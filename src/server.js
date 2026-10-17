/**
 * server.js
 * Main entry point - Express + Socket.io Server
 *
 * MULTI-TENANT ARCHITECTURE:
 * - Each streamer = 1 isolated Socket.io Room
 * - Room ID = TikTok username
 * - Data isolation: Streamer A cannot see Streamer B's data
 *
 * @module server
 */

import express from "express";
import { InteractionStore } from "./lib/interactionStore.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import tiktokService from "./services/TikTokService.js";

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const rankings = new InteractionStore(process.env.RANKINGS_DB || join(__dirname, "../data/rankings.sqlite"));
tiktokService.onActivity = (...args) => rankings.record(...args);
const app = express();
const server = createServer(app);

// Socket.io with CORS enabled for development
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE & STATIC FILES
// ==========================================

// Serve static files from public directory
app.use(express.static(join(__dirname, "../public")));

// Parse JSON body
app.use(express.json());

// ==========================================
// API ROUTES
// ==========================================

/**
 * Health check endpoint
 * @route GET /api/health
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    stats: tiktokService.getStats(),
  });
});

/**
 * Get connection statistics
 * @route GET /api/stats
 */
app.get("/api/stats", (req, res) => {
  res.json(tiktokService.getStats());
});

app.get('/api/leaderboards/:username', (req, res) => {
  const username = req.params.username.trim().toLowerCase();
  if (!/^[a-z0-9_.]{1,64}$/.test(username)) return res.status(400).json({error:'Invalid username'});
  try { res.json(rankings.leaderboards(username)); }
  catch (error) {
    console.error(`[Rankings] Failed to read: ${error.message}`);
    res.status(500).json({error:'Could not load rankings'});
  }
});

// ==========================================
// SOCKET.IO - REALTIME CONNECTION HANDLING
// ==========================================

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  /**
   * JOIN ROOM HANDLER
   *
   * IMPORTANT - DATA ISOLATION:
   * - Each client joins a room based on streamer's username
   * - Client only receives events from their subscribed streamer
   * - Ensures data isolation between different streamers
   */
  socket.on("join-room", async (username) => {
    // Validate username
    if (!username || typeof username !== "string") {
      socket.emit("error", { message: "Invalid username" });
      return;
    }

    // Normalize username (lowercase, trimmed)
    const normalizedUsername = username.toLowerCase().trim();

    // Repeated joins reuse membership; switching streamers leaves the previous room.
    if (socket.tiktokUsername !== normalizedUsername) {
      if (socket.tiktokUsername) {
        socket.leave(socket.tiktokUsername);
        tiktokService.removeClientFromRoom(socket.tiktokUsername);
      }
      socket.tiktokUsername = normalizedUsername;
      socket.join(normalizedUsername);
      tiktokService.addClientToRoom(normalizedUsername);
      console.log(`[Socket] ${socket.id} joined room: ${normalizedUsername}`);
    }

    // Connect to TikTok Live (reuses existing connection if available)
    try {
      const connected = await tiktokService.connect(normalizedUsername, io);
      if (connected) {
        socket.emit("room-joined", {
          room: normalizedUsername,
          message: `Joined room: ${normalizedUsername}`,
        });
      } else {
        socket.emit("connection-error", {
          message: `Cannot connect to ${normalizedUsername}'s live. Make sure they are currently streaming!`,
        });
      }
    } catch (error) {
      console.error(`[Socket] Error connecting to TikTok: ${error.message}`);
      socket.emit("connection-error", {
        message: error.message,
      });
    }
  });

  /**
   * LEAVE ROOM HANDLER
   */
  socket.on("leave-room", (username) => {
    if (typeof username === "string") {
      const normalizedUsername = username.toLowerCase().trim();
      if (socket.tiktokUsername !== normalizedUsername) return;
      socket.tiktokUsername = null;
      socket.leave(normalizedUsername);
      tiktokService.removeClientFromRoom(normalizedUsername);
      console.log(`[Socket] ${socket.id} left room: ${normalizedUsername}`);
    }
  });

  /**
   * DISCONNECT HANDLER
   *
   * When client disconnects, update room count.
   * If room is empty for too long, TikTokService will auto-disconnect.
   */
  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);

    if (socket.tiktokUsername) {
      tiktokService.removeClientFromRoom(socket.tiktokUsername);
    }
  });

  /**
   * Debug: Ping-pong for connection testing
   */
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: Date.now() });
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log(`
    TikTok Live Games - Open Source Platform
    Server running at: → http://localhost:${server.address().port}
    `);
});

// Close upgraded Socket.io connections too; server.close() alone leaves them open.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[Server] Shutting down...");
  const deadline = setTimeout(() => {
    console.error("[Server] Shutdown timed out; forcing exit.");
    process.exit(1);
  }, 5000);
  deadline.unref();

  tiktokService.shutdown();
  rankings.close();
  io.close(() => {
    clearTimeout(deadline);
    console.log("[Server] Goodbye!");
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
