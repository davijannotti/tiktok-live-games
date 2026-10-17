/**
 * TikTokService.js
 * Manages TikTok Live connections for multiple streamers (Multi-tenant)
 *
 * IMPORTANT - DATA ISOLATION:
 * - Each streamer has their own Socket.io Room (Room ID = username)
 * - Data from Streamer A will NEVER be sent to Streamer B
 * - Uses io.to(username).emit() to send to the CORRECT room only
 *
 * @module services/TikTokService
 */

import { TikTokLiveClient } from "piratetok-live-js";
import { withoutTikTokRoomCache } from "../lib/tiktokRoomCache.js";

import {
	normalizeChat,
	normalizeGift,
	normalizeLike,
	normalizeShare,
} from "../lib/tiktokEventNormalizer.js";
import { getDelay, shouldRetry, sleep } from "../lib/tiktokReconnectPolicy.js";

// The client has no fetch option; constrain the workaround to its TikTok room endpoint.
globalThis.fetch = withoutTikTokRoomCache(globalThis.fetch);

class TikTokService {
	constructor() {
		// Singleton pattern - ensure only one instance exists
		if (TikTokService.instance) {
			return TikTokService.instance;
		}
		TikTokService.instance = this;

		/**
		 * Map storing active TikTok connections
		 * @type {Map<string, {connection: TikTokLiveClient, lastActivity: number, connected: boolean, ready: Promise<boolean>}>}
		 */
		this.connections = new Map();

		/**
		 * Map tracking client count per room
		 * @type {Map<string, number>}
		 */
		this.roomClients = new Map();

		/**
		 * Track reconnect state per username to avoid overlapping retries
		 * @type {Map<string, {attempting: boolean, attempt: number}>}
		 */
		this.reconnectState = new Map();

		// Cleanup interval - check for inactive connections every minute
		this.cleanupInterval = setInterval(
			() => this.checkInactiveConnections(),
			60000,
		);
	}

	/**
	 * Connect to a streamer's TikTok Live
	 * IMPORTANT: If connection exists, reuse it. Do NOT create new one.
	 *
	 * @param {string} username - TikTok username (also used as Room ID)
	 * @param {import('socket.io').Server} io - Socket.io server instance
	 * @returns {Promise<boolean>} - Whether connection was successful
	 */
	async connect(username, io) {
		if (this.shuttingDown) return false;
		const existing = this.connections.get(username);
		if (existing) {
			existing.lastActivity = Date.now();
			return existing.ready;
		}

		console.log(`[TikTokService] Creating PirateTok connection for: ${username}`);
		const connection = new TikTokLiveClient(username).timeout(15000).maxRetries(0)
			.language("pt").region("BR");
		const entry = { connection, connected: false, lastActivity: Date.now(), ready: null };
		this.connections.set(username, entry);
		const current = () => this.connections.get(username) === entry && !this.shuttingDown;

		for (const [event, normalize] of Object.entries({
			chat: normalizeChat, like: normalizeLike, share: normalizeShare, gift: normalizeGift,
		})) {
			connection.on(event, data => {
				if (!current()) return;
				this.updateActivity(username);
				const normalized = normalize(data);
				try { this.onActivity?.(username, event, normalized, data.common?.msgId); }
				catch (error) { console.error(`[Rankings] Failed to save: ${error.message}`); }
				io.to(username).emit(`tiktok_${event}`, normalized);
			});
		}
		connection.on("liveEnded", () => {
			if (current()) connection.disconnect();
		});
		connection.on("disconnected", () => {
			if (!current() || !entry.connected) return;
			this.connections.delete(username);
			io.to(username).emit("tiktok_disconnected", { timestamp: Date.now() });
			if (this.getClientCount(username) > 0) void this._scheduleReconnect(username, io);
		});
		connection.on("error", error => {
			if (!current()) return;
			console.error(`[TikTokService] Error for ${username}:`, error.message);
			io.to(username).emit("tiktok_error", { message: error.message, timestamp: Date.now() });
		});

		entry.ready = Promise.resolve().then(async () => {
			if (!current()) return false;
			let timeout;
			try {
				// PirateTok emits "connected" before the handshake; its promise waits for it.
				const roomId = await Promise.race([
					connection.connect(),
					new Promise((_, reject) => {
						timeout = setTimeout(() => {
							reject(new Error("TikTok connection timed out after 45 seconds"));
							connection.disconnect();
						}, 45000);
					}),
				]);
				if (!current()) {
					connection.disconnect();
					return false;
				}
				entry.connected = true;
				console.log(`[TikTokService] Connected to live: ${username}`);
				io.to(username).emit("tiktok_connected", { roomId, timestamp: Date.now() });
				return true;
			} catch (error) {
				if (current()) {
					this.connections.delete(username);
					console.error(`[TikTokService] Cannot connect to ${username}:`, error.message);
					io.to(username).emit("tiktok_error", { message: error.message, timestamp: Date.now() });
					if (this.getClientCount(username) > 0) void this._scheduleReconnect(username, io);
				}
				connection.disconnect();
				return false;
			} finally {
				clearTimeout(timeout);
			}
		});
		return entry.ready;
	}

	/**
	 * Schedule auto-reconnect with exponential backoff.
	 * Skips if a reconnect loop is already running for this username.
	 *
	 * @param {string} username
	 * @param {import('socket.io').Server} io
	 * @private
	 */
	async _scheduleReconnect(username, io) {
		if (this.shuttingDown) return;
		// Guard against overlapping reconnect loops
		const previous = this.reconnectState.get(username);
		if (previous?.attempting) return;

		let attempt = 0;
		const state = { attempting: true, attempt };
		this.reconnectState.set(username, state);

		while (shouldRetry(attempt)) {
			if (this.reconnectState.get(username) !== state || this.shuttingDown) return;
			// Bail if no clients remain (nobody watching → no point reconnecting)
			if (this.getClientCount(username) === 0) {
				console.log(
					`[TikTokService] Reconnect aborted for ${username}: 0 clients`,
				);
				break;
			}

			// Bail if connection was re-established elsewhere
			if (this.connections.has(username)) {
				console.log(
					`[TikTokService] Reconnect aborted for ${username}: already connected`,
				);
				break;
			}

			const delay = getDelay(attempt);
			console.log(
				`[TikTokService] Reconnect attempt ${attempt + 1} for ${username} in ${delay}ms`,
			);
			io.to(username).emit("tiktok_reconnecting", {
				attempt: attempt + 1,
				delayMs: delay,
				timestamp: Date.now(),
			});

			await sleep(delay);
			if (this.shuttingDown || this.reconnectState.get(username) !== state) return;
			if (this.getClientCount(username) === 0) break;

			const ok = await this.connect(username, io);
			if (ok) {
				console.log(
					`[TikTokService] Reconnected to ${username} on attempt ${attempt + 1}`,
				);
				this.reconnectState.delete(username);
				return;
			}

			attempt++;
			state.attempt = attempt;
		}

		if (this.getClientCount(username) === 0 || this.connections.has(username)) {
			this.reconnectState.delete(username);
			return;
		}

		console.error(
			`[TikTokService] Reconnect failed for ${username} after ${attempt} attempts`,
		);
		io.to(username).emit("tiktok_error", {
			message: `Reconnect failed after ${attempt} attempts. Streamer may have ended the live.`,
			timestamp: Date.now(),
		});
		this.reconnectState.delete(username);
	}

	/**
	 * Disconnect a streamer's TikTok connection
	 * @param {string} username - TikTok username
	 */
	disconnect(username) {
		// Cancel any pending reconnect
		this.reconnectState.delete(username);

		const entry = this.connections.get(username);
		if (entry) {
			// Remove first so a deliberate disconnect never starts a reconnect loop.
			this.connections.delete(username);
			entry.connection.disconnect();
			console.log(`[TikTokService] Disconnected: ${username}`);
		}
	}

	shutdown() {
		this.shuttingDown = true;
		clearInterval(this.cleanupInterval);
		this.roomClients.clear();
		this.reconnectState.clear();
		for (const username of this.connections.keys()) this.disconnect(username);
	}

	/**
	 * Update last activity timestamp for a connection
	 * @param {string} username - TikTok username
	 */
	updateActivity(username) {
		if (this.connections.has(username)) {
			this.connections.get(username).lastActivity = Date.now();
		}
	}

	/**
	 * Add a client to a room's count
	 * @param {string} username - Room ID (username)
	 */
	addClientToRoom(username) {
		const count = this.roomClients.get(username) || 0;
		this.roomClients.set(username, count + 1);
		console.log(`[TikTokService] Room ${username}: ${count + 1} clients`);
	}

	/**
	 * Remove a client from a room's count
	 * @param {string} username - Room ID (username)
	 */
	removeClientFromRoom(username) {
		const count = this.roomClients.get(username) || 0;
		if (count > 0) {
			this.roomClients.set(username, count - 1);
			console.log(`[TikTokService] Room ${username}: ${count - 1} clients`);
		}
	}

	/**
	 * Get client count for a room
	 * @param {string} username - Room ID
	 * @returns {number} Number of clients
	 */
	getClientCount(username) {
		return this.roomClients.get(username) || 0;
	}

	/**
	 * Check and disconnect inactive connections
	 * AUTO-DISCONNECT after 5 minutes with no clients in room
	 * This helps free up server resources
	 */
	checkInactiveConnections() {
		const TIMEOUT = 5 * 60 * 1000; // 5 minutes
		const now = Date.now();

		for (const [username, data] of this.connections.entries()) {
			const clientCount = this.getClientCount(username);
			const timeSinceActivity = now - data.lastActivity;

			if (clientCount === 0 && timeSinceActivity > TIMEOUT) {
				console.log(
					`[TikTokService] Auto-disconnect ${username} (inactive ${Math.round(
						timeSinceActivity / 1000,
					)}s, 0 clients)`,
				);
				this.disconnect(username);
			}
		}
	}

	/**
	 * Get current service statistics
	 * @returns {{activeConnections: number, connections: string[], rooms: Object}}
	 */
	getStats() {
		return {
			activeConnections: this.connections.size,
			connections: Array.from(this.connections.keys()),
			rooms: Object.fromEntries(this.roomClients),
		};
	}
}

// Export singleton instance
export default new TikTokService();
