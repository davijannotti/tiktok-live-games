# TikTok Live Games 🎮

An open-source platform that creates interactive game overlays for TikTok Live streams. Viewers send gifts to power games in real-time — designed for 24/7 streaming with OBS.

<img width="2938" height="1654" alt="image" src="https://github.com/user-attachments/assets/7fe6231f-8a9b-450b-8490-b38d775a0645" />

## Features

- **Multi-tenant Architecture** — Multiple streamers use the platform simultaneously, fully isolated
- **TikTok Bridge SDK** — Lightweight client-side library to connect any HTML5 game to TikTok Live
- **Gift Integration** — Automatic gift categorization (small/medium/large) with `giftId` tracking
- **Event Normalizer** — Consistent event payloads across all TikTok event types
- **Auto-Reconnect** — Exponential backoff with jitter (up to 5 retries)
- **OBS Ready** — Transparent overlays designed for streaming software
- **Event Debugger** — Real-time event monitor for discovering gift names and testing

## Available Games

### Horse Racing 🏇

Gift-powered horse race with 5 country lanes. Viewers send gifts to move their country's horse forward.

- **5 Lanes**: 🇻🇳 Vietnam, 🇹🇭 Thailand, 🇮🇩 Indonesia, 🇲🇾 Malaysia, 🇨🇳 China
- **Gift → Lane Mapping**: Each gift name maps to a specific lane (configurable in `config.js`)
- **4 Gift Tiers**: 1-coin, 5-coin, 10-coin, 99-coin — each tier has 5 gifts (one per lane)
- **Auto-Reset**: Races cycle automatically (Waiting → Countdown → Racing → Finished → Cooldown)
- **Supporter Tracking**: Top 3 contributors shown on winner overlay
- **Canvas 2D + DOM HUD**: Progress bars, event feed, phase banners, winner celebration

## Quick Start

### Prerequisites

- Node.js 22.19+
- npm

### Installation

```bash
git clone https://github.com/vamnguyen/tiktok-live-games.git
cd tiktok-live-games
npm install
npm start
```

### Usage

1. Open the dashboard: http://localhost:3000
2. Enter the TikTok username of someone currently LIVE
3. Select **Horse Racing**
4. Click **Generate Game Link**
5. Copy the overlay URL
6. Add as **Browser Source** in OBS/TikTok Studio
7. Viewers send gifts to race!

> **Note**: The TikTok username must be currently LIVE for the connection to work.

### Event Debugger

Visit http://localhost:3000/debug.html to monitor all TikTok events in real-time. Useful for discovering exact gift names to configure lane mappings.

## Project Structure

```
tiktok-live-games/
├── src/
│   ├── server.js                        # Express + Socket.io server (port 3000)
│   ├── services/
│   │   └── TikTokService.js             # Singleton: TikTok connections, rooms, auto-reconnect
│   └── lib/
│       ├── tiktokEventNormalizer.js      # Pure normalization for TikTok events
│       └── tiktokReconnectPolicy.js      # Exponential backoff reconnect helpers
├── public/
│   ├── index.html                        # Dashboard: username → overlay URL generator
│   ├── debug.html                        # Event debugger: live event monitoring
│   ├── css/styles.css                    # Dark theme, glass-morphism
│   ├── js/dashboard.js                   # Game selection & URL generation
│   ├── lib/tiktok-bridge.js              # Client SDK: Socket.io → game event bridge
│   └── games/
│       └── horse-racing/                 # Canvas + DOM horse race game
│           ├── index.html                # Overlay entry point
│           ├── game.js                   # Canvas renderer + bridge wiring
│           ├── race-engine.js            # Pure race state machine
│           ├── config.js                 # Lanes, gift tiers, gift→lane mapping
│           └── style.css                 # OBS overlay styles
└── package.json
```

## Architecture

### Data Flow

```
TikTok Live → PirateTok → TikTokService → Socket.io rooms → tiktok-bridge.js → Game
```

### Multi-tenant Isolation

Each streamer gets their own Socket.io room (Room ID = TikTok username). Events are routed only to the relevant room — no data leakage between streamers.

```
TikTokService (Singleton)
  ├── connections: Map<username, WebcastConnection>
  └── rooms: Map<username, clientCount>
        │
        ├── io.to("streamer_a").emit() → [Horse Racing Overlay A]
        ├── io.to("streamer_b").emit() → [Horse Racing Overlay B]
        └── io.to("streamer_c").emit() → [Horse Racing Overlay C]
```

### Connection Management

- **Singleton Pattern**: Single `TikTokService` instance manages all connections
- **Connection Reuse**: Existing connections are reused, not recreated
- **Auto-disconnect**: Connections close after 5 minutes with 0 clients
- **Auto-reconnect**: Exponential backoff (2s → 4s → 8s → 16s → 32s) with ±30% jitter, max 5 attempts

## API Reference

### REST Endpoints

| Endpoint      | Method | Description           |
| ------------- | ------ | --------------------- |
| `/api/health` | GET    | Server health + stats |
| `/api/stats`  | GET    | Connection statistics |

### Socket.io Events

**Client → Server:**

| Event        | Payload            | Description            |
| ------------ | ------------------ | ---------------------- |
| `join-room`  | `username: string` | Join a streamer's room |
| `leave-room` | `username: string` | Leave a room           |

**Server → Client (TikTok Events):**

| Event                 | Key Payload Fields                                             | Description              |
| --------------------- | -------------------------------------------------------------- | ------------------------ |
| `tiktok_connected`    | `{ roomId }`                                                   | Connected to TikTok Live |
| `tiktok_chat`         | `{ user, comment }`                                            | Chat message             |
| `tiktok_gift`         | `{ user, giftId, giftName, giftValue, repeatCount, giftType }` | Gift received            |
| `tiktok_like`         | `{ user, likeCount, totalLikeCount }`                          | Like/heart               |
| `tiktok_share`        | `{ user }`                                                     | Share event              |
| `tiktok_reconnecting` | `{ attempt, delayMs }`                                         | Auto-reconnect attempt   |
| `tiktok_disconnected` | `{}`                                                           | Disconnected             |
| `tiktok_error`        | `{ message }`                                                  | Error occurred           |

All events include `timestamp`. The `user` object contains `{ uniqueId, nickname, profilePictureUrl }`.

Gift types: `"small"` (<10 diamonds), `"medium"` (10-99), `"large"` (100+).

## TikTok Bridge SDK

Client-side SDK that handles Socket.io connection and event dispatch for games.

### Auto-Connect

The bridge auto-connects if the URL has `?id=username` or `?username=username` params.

### API

```javascript
// Manual connect (auto-connect also works via URL params)
TikTokBridge.connect(username, serverUrl);

// Listen to events
TikTokBridge.on("gift", (data) => {
  console.log(data.giftName, data.giftValue, data.giftType);
});

TikTokBridge.on("chat", (data) => {
  console.log(data.user.uniqueId, data.comment);
});

// Available events: chat, gift, like, share, connected, disconnected, reconnecting, error
```

## Adding a New Game

1. Create `public/games/{name}/` with an entry HTML file
2. Include the SDK:
   ```html
   <script src="/socket.io/socket.io.js"></script>
   <script src="/lib/tiktok-bridge.js"></script>
   ```
3. Listen to events:
   ```javascript
   TikTokBridge.on("gift", (data) => {
     /* move piece, deal damage, etc. */
   });
   TikTokBridge.on("chat", (data) => {
     /* parse commands */
   });
   ```
4. Add a game card in `public/index.html`:
   ```html
   <div class="game-card" data-game="your-game" data-entry="index.html" data-param="id">
     <!-- card content -->
   </div>
   ```

## Horse Racing Configuration

### Lane Setup (`config.js`)

```javascript
lanes: [
  { id: 0, name: "Vietnam", flag: "🇻🇳", color: "#FF4444" },
  { id: 1, name: "Thailand", flag: "🇹🇭", color: "#4488FF" },
  { id: 2, name: "Indonesia", flag: "🇮🇩", color: "#44DD44" },
  { id: 3, name: "Malaysia", flag: "🇲🇾", color: "#FFCC00" },
  { id: 4, name: "China", flag: "🇨🇳", color: "#CC44FF" },
];
```

### Gift Tiers

Each tier has 5 gifts — one per lane (array index = lane index):

| Tier    | Gifts (VN, TH, ID, MY, CN)                                    |
| ------- | ------------------------------------------------------------- |
| 1 coin  | Rose, GG, Ice Cream Cone, Finger Heart, TikTok                |
| 5 coin  | Hand Heart, Little Crown, Butterfly, Love You, Wishing Bottle |
| 10 coin | Perfume, Doughnut, Cap, Paper Crane, Sunglasses               |
| 99 coin | Garland, Singing Mic, Star, Concert, Lock and Key             |

### Gift → Distance Formula

```
distance = 5 + 3 × √(diamondValue)
```

| Diamonds | Distance |
| -------- | -------- |
| 1        | 8 units  |
| 10       | 14 units |
| 99       | 35 units |

### Race Phases

```
WAITING → COUNTDOWN (10s) → RACING (max 120s) → FINISHED (8s) → COOLDOWN (5s) → WAITING
```

## Development

```bash
npm run dev    # Development mode with auto-reload
npm start      # Production
```

### Tech Stack

| Component | Technology                             |
| --------- | -------------------------------------- |
| Runtime   | Node.js >= 22.19 (ES Modules)             |
| Server    | Express 4.18 + Socket.io 4.7           |
| TikTok    | piratetok-live-js 0.3.0            |
| Games     | Vanilla Canvas 2D + DOM                |
| Styling   | Custom CSS (dark theme, glassmorphism) |

No `.env` required for local development. Server runs on port 3000 by default (`PORT` env var supported).

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-game`
3. Commit your changes: `git commit -m 'Add amazing game'`
4. Push to branch: `git push origin feature/amazing-game`
5. Open a Pull Request

### Code Style

- ES Modules (`import`/`export`)
- Comments in English
- JSDoc for function documentation

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [PirateTok/live-js](https://github.com/PirateTok/live-js) — open-source TikTok LIVE connector without a signing service
- [Socket.io](https://socket.io/) — Real-time communication
- Vietnamese Streamer Community

---

**Made with ❤️ for the Global Streamer Community**

### TikTok connection — PirateTok

The server uses `piratetok-live-js` 0.3.0. No Euler Stream account, paid plan,
`SIGN_API_KEY`, or TikTok login is needed for public livestreams. Existing Euler
variables in a local `.env` are no longer used; do not publish that file.

Run `npm install` and `npm start` with Node.js 22.19 or newer, then open the game
with the streamer's username. Games keep the same Socket.io event names and
payloads. Gift costs, names and combo information come directly from gift events.
Missing gift costs do not receive a guessed one-point value.

The server waits for a completed WebSocket handshake before reporting connected,
shares one connection between viewers of each streamer, and retries failed or
lost connections up to five times with exponential backoff. Reconnects resolve
the current room again. A narrowly scoped fetch workaround bypasses PirateTok's
ten-minute room cache so a newly started live is not mistaken for the last one.
A connection attempt times out after 45 seconds; shutdown cancels active clients.

This uses TikTok's unofficial web protocol. TikTok can change or block it, and
missed events are not replayed after reconnecting. Private/age-restricted streams
are not supported by this anonymous setup.

Run `npm test` for offline integration, scoring, reconnection and shutdown checks.

### Batalha da urna — Lula vs Flávio Bolsonaro

Select **Lula vs Flávio Bolsonaro** in the dashboard, or open:
`http://localhost:3000/games/urna-battle/index.html?id=YOUR_USERNAME`.
Use a **1080 × 1920** browser source (720 × 1280 also works).

The same source now rotates **Urna → Corrida do Planalto → Cabo de guerra → Torre da torcida → Urna**
after each round and its result interval, without page reloads, duplicate connections, or restarting music.
The next game is announced during results and at the transition. Each mode uses the same team scoring,
free-vote limit, gifts, automatic timing, avatars, and round/all-time rankings. New rounds reset round
scores and votes; the server's SQLite totals remain shared across all four games.

- Corrida: cars advance visually with time; points determine their relative positions. Gifts show turbo,
  chat votes show an impulse; only the actual round winner crosses the finish line at results.
- Cabo de guerra: the score advantage moves the rope and characters; pull/slip effects are cosmetic.
- Torre: points raise colored block towers, with adaptive height so large scores stay inside the scene.
- Start the rotation at a different game with `&mode=race`, `&mode=tug`, or `&mode=tower`.
  Add `&fixed=1` to keep only that game. Direct standalone previews are available at
  `/games/planalto-race/`, `/games/torcida-tug/`, and `/games/torcida-tower/`; they preserve account and
  other query parameters and redirect to the shared overlay in fixed mode.

Without `id`, the same URL previews the game offline.

- Lula (red, 13): Rose (1 coin, also gift ID 5655), Heart (10 coins).
- Flávio Bolsonaro (green, 22): White Rose (1 coin), Tiny Diny (10 coins).
- Comment with `13` or `22` anywhere in the text (including `13.13`; comments containing both sides do not vote) for one free point, once per identified user per round (across both teams). Chat votes appear in the donor banner and history; gifts remain unlimited extras. Chat voting does not stop automatic players; the first accepted real gift still does.
- Suggested LIVE title: **Lula x Flávio 🇧🇷 Comente 13 ou 22 e entre na disputa**. Set this in TikTok LIVE Studio; the overlay also displays the invitation.
- Each gift diamond is one game point, multiplied by the final combo count.
  Equal total gift value scores equally for either team: a value-10 Heart
  equals ten value-1 White Rose gifts. Values come from the live event, so regional
  or future gift price changes do not require a fixed price table.
  Intermediate streak events are ignored; repeated message IDs are deduplicated.
  Unknown gifts do not choose a side. Confirm gift names in the debugger for your region.
- Round results show the winner portrait, team colors and party flag; ties have no winner portrait. Profile photos appear on the current supporter banner, activity feed and rankings, with a placeholder if absent or expired.
- All-time rankings are recorded once at the server from real TikTok events, separately for each streamer. SQLite lives at `data/rankings.sqlite` (override with `RANKINGS_DB`); no extra dependency is required (`node:sqlite`, Node >=22.19). Results alternate every 10 seconds between round and all-time rankings when connected with `id`/`username`. Recording includes events during the between-round break; the round ranking freezes. Historical totals start when this feature is enabled; past events cannot be recovered. Message IDs deduplicate replays, including across restarts; events without IDs cannot reliably be deduplicated. Keep `data/` when restarting or updating. For backup, stop the server and copy this directory, including SQLite files. Totals survive reloads; current-round state still resets on browser reload.
- Round results show the top three real users for all nonempty comments, gifted coin value (including unmapped gifts), and received like counts. Counts freeze during results and reset next round; repeated comments count for ranking but only one free vote scores.
- Each round runs for 5 minutes, followed by a 1-minute result. Gifts received
  during the result do not score. Ties and rounds without points are shown explicitly.
- Automatic players add one point after an initial 5-second wait, then at random 5–30-second intervals until the first accepted
  real gift of the round. That gift disables them for the rest of the round;
  the next round enables them again. Unknown gifts and unfinished combos do not
  disable them. Alternating pressure favors each side in turn, with correction
  toward roughly equal automatic totals. Automatic points can decide the winner.
  Append `&demo=0` (or `?demo=0` without `id`) to disable them.
- This is a fictional game, not an official ballot, poll, or campaign fundraiser.
- shortcut: round state lives in one browser source and resets on reload; move
  state to the server before requiring shared or persistent scores across sources.

The UI uses a playful arcade scoreboard, live lead/comeback announcements,
point bursts, confetti and a victory screen. Reduced-motion preferences disable
movement and particles. There is no extra scoring multiplier for visual effects.

The audio is on by default: “Carnival Brasil”, an upbeat carnival track with
Brazilian batteria percussion, brass and whistle, loops at 18% volume. Original
arcade effects play at 30% for keypad presses, points, large gifts, lead changes,
the final five seconds, round starts and results. Music briefly lowers during
major celebrations. There are no audio buttons or volume sliders in the overlay.

The page attempts autoplay immediately. If browser policy blocks sound, the first
click, touch or keypress retries automatically without an on-screen prompt. In
OBS, interacting with the browser source once may be necessary; make sure source
audio is included in your mixer. Blocked cues are dropped rather than replayed.

Music: “Carnival Brasil” by Shane Ivers (Silverman Sound), CC BY 4.0 — free to use
with attribution, rather than public domain. Credit links appear in the footer.
Source, license, modifications and the required stream-description credit are in
`public/games/urna-battle/assets/audio/CREDITS.txt`.

Character art was generated with the built-in image tool and saved as
`public/games/urna-battle/assets/lula-flavio-arcade.webp`. Prompts and reference
provenance are recorded in `public/games/urna-battle/assets/PROMPT.txt`.

### Random instrumental music playlist

The four shared minigames play full tracks from a shuffled local playlist, with no immediate
repeats across playlist cycles. Background music stays enabled by default at the same low volume,
ducks beneath major game effects and continues when switching games. Missing tracks are skipped;
autoplay rejection retries on interaction without showing audio controls.

Playlist: Carnival Brasil (Shane Ivers), Accordion Street Sway, Cumbia Street Stroll and
Funky Brazilian Phonk (BudgetPixel AI). The accordion tracks are cumbia; these are not Forro Boys
recordings or famous-song instrumentals. All tracks use CC BY 4.0 with on-screen credits following
the current track. See `public/games/urna-battle/assets/audio/CREDITS.txt` for sources, modifications
and attribution to copy into stream descriptions. An instrumental version alone does not grant
permission to broadcast a copyrighted song.

Music uses only the four bundled instrumental files; no embedded YouTube player or temporary game-switch button remains.

### OBS: optional 20-minute stream restart

Load `scripts/obs/restart-live.lua` through **OBS → Tools → Scripts → +**. This uses
OBS's built-in Lua/frontend API and does not need WebSocket, passwords, external
packages or changes to stream keys. It is disabled by default.

Before enabling, verify manually that stopping OBS actually ends the TikTok LIVE
and that starting OBS creates a new LIVE through Restream. Restream disconnect
protection or TikTok's reconnect grace period may keep the same LIVE open. The
script only controls the OBS output; it cannot confirm a new TikTok room/session.

Enable **Ativar reinício automático a cada 20 minutos**. The timer starts on an
observed stream start, or on activation if already streaming. After 20 minutes it
requests Stop, waits for the full STREAMING_STOPPED event, waits the configured
pause (30 seconds by default), then requests Start. No repeated stop/start commands
are sent if confirmation is missing; 30-second action timeouts pause the automation
and log the failure. After a confirmed start the next 20-minute interval begins.

Use **Testar reinício agora** for a controlled real stop/start test; this interrupts
the stream immediately. Disable or unload the script to cancel a pending restart.
A manual stop outside a scheduled cycle does not restart the broadcast. Closing OBS
or switching profiles/scene collections cancels pending automation. See the script
log for details. The script does not start a broadcast automatically just by loading.

Game rounds last 5 minutes plus the existing 1-minute result interval. Therefore an
exact 20-minute broadcast restart can occur mid-game; four complete game/result
cycles last 24 minutes. OBS output restarts do not themselves reset the game page.
All-time SQLite interaction totals remain intact. Refresh the OBS browser source
after updating game code to load the new five-minute duration.

Offline script checks (no real OBS output): `luajit test/obs-live-reset.test.lua`.

## Migration to another Linux PC

The current OBS profile, vertical scene and 20-minute restart script are included without streaming credentials. Follow [the Portuguese migration guide](obs/LEIA-ME.md). The installer registers and enables the Lua script with OBS closed, preserves existing collections and profiles, and can restore credentials and rankings from the separate private export.
