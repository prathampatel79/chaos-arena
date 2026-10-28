# ⚡ CHAOS ARENA — Multiplayer 2D Arcade Game

> A fast-paced, browser-based top-down 2D multiplayer arcade game built with HTML5 Canvas, Node.js, Express, and Socket.IO. Designed for 4–10 simultaneous players on PC and mobile browsers, featuring signature 20-second **Chaos Events**, procedural 8-bit Web Audio synth, responsive touch virtual joystick, and strict server-authoritative physics.

![Exhibition Ready](https://img.shields.io/badge/College%20Exhibition-Ready-brightgreen.svg)
![Multiplayer](https://img.shields.io/badge/Players-4%E2%80%9310%20LAN%20%2F%20Web-cyan.svg)
![Tech](https://img.shields.io/badge/Tech-Vanilla%20JS%20%7C%20Canvas%20%7C%20Socket.IO-ff007f.svg)

---

## 🎮 Game Overview

In **CHAOS ARENA**, players enter a neon-lit cybernetic arena to compete for the highest score within a **90-second** match. Collect golden coins, dodge moving laser patrol drones, ricochet off pinball bumpers, grab strategic power-ups, and survive sudden, game-altering **Chaos Modifiers** that trigger every 20 seconds.

### Signature Features
1. **Real Server-Authoritative Multiplayer**:
   - Zero fake players or simulated bots.
   - Movement, physics, coin collections, hazard hits, and scores are simulated and validated authoritative on the server at 30 ticks per second.
   - Client-side interpolation provides smooth 60fps rendering without jitter.
2. **Signature Chaos Events (Every 20 Seconds, Duration ~10s)**:
   - ⛸️ **Slippery Floor**: High inertia, ice-skating momentum drift across the arena!
   - 🔄 **Reverse Controls**: Directional inputs invert instantly (Up is Down, Left is Right)!
   - 🪙 **Coin Rush**: 25 extra golden bonus coins flood into the arena floor!
   - 🌟 **Giant Coins**: Standard coins morph into 50-point pulsating mega-coins!
   - ⚡ **Overdrive Hazards**: Arena laser drones double their patrol velocity!
   - 🔴 **Shrinking Zone**: Red hazard borders contract inward; players outside lose points and get pushed back!
   - 🚀 **Speed Frenzy**: Hyper-nitro speed boost awarded to all players simultaneously!
3. **4 Tactical Power-Ups**:
   - ⚡ **Speed Boost**: +60% turbo speed for 7 seconds with glowing particle trails.
   - 🛡️ **Shield**: Absorbs 1 hazard hit or chaos penalty without taking stun or point loss.
   - 🧲 **Coin Magnet**: Gravitationally draws coins within a 240px radius toward player for 8 seconds.
   - ⭐ **Double Score**: Multiplies coin points by 2x for 10 seconds.
4. **Arena Hazards & Bumpers**:
   - **Pinball Bumpers**: High-impulse elastic bumpers that launch colliding players backward with sound and flash effects.
   - **Laser Patrol Hazards**: Moving drones that inflict knockback, 0.6s stun, and drop 5 points (blocked by Shield).
5. **Procedural Web Audio Arcade Synthesizer**:
   - Zero external audio files or missing MP3 dependencies.
   - Authentic retro 8-bit sound effects synthesized in real time via the Web Audio API.
   - Includes coin chimes, bumper bounces, hazard buzzes, chaos sirens, countdown ticks, victory fanfares, and an optional 8-bit chiptune background groove.
6. **Cross-Platform PC & Mobile Support**:
   - **Desktop / Laptop**: Smooth `WASD` or `Arrow Keys` controls.
   - **Mobile / Tablet**: Responsive on-screen virtual touch joystick with touch-action isolation to prevent accidental browser scrolling or zooming.

---

## 🚀 Quick Launch Guide

### 1. Requirements
- Node.js (v18, v20, v22, or v24+)
- Modern web browser (Chrome, Safari, Firefox, Edge)

### 2. Install & Run
Open terminal in the project directory:

```bash
# Navigate to project folder
cd "vs code/chaos-arena"

# Install dependencies (Express & Socket.IO)
npm install

# Start the game server
npm start
```

You will see the startup banner displaying your local and LAN URLs:

```text
====================================================
⚡  CHAOS ARENA - MULTIPLAYER ARCADE SERVER RUNNING  ⚡
====================================================
📡 Local Access:    http://localhost:3000
🌐 LAN Multiplayer: http://192.168.1.50:3000
====================================================
```

### 3. Open in Browser
- **On the Host Computer**: Open `http://localhost:3000`
- **Testing Locally**: Open two or more browser tabs or windows to simulate multiple players.

---

## 🌐 LAN Exhibition Multiplayer Setup

For a college exhibition or multiplayer showcase with multiple laptops and phones:

1. **Ensure all devices are on the same Wi-Fi or Local Network**.
2. **Find the Host Computer's Local IP**:
   - **Linux**: Run `hostname -I` or `ip addr show` (the server also prints this on startup!).
   - **Windows**: Open Command Prompt and run `ipconfig` (look for `IPv4 Address`, e.g., `192.168.1.X`).
   - **macOS**: System Settings -> Wi-Fi -> Details, or run `ifconfig | grep "inet "`.
3. **Connect from other Devices**:
   - From any laptop, iPad, or mobile phone on the same network, navigate to:
     ```
     http://<HOST_IP>:3000
     ```
   - (Example: `http://192.168.1.50:3000`)
4. **Firewall Note**: If other devices cannot reach the host, ensure port `3000` is allowed through the host firewall:
   - Linux (UFW): `sudo ufw allow 3000/tcp`
   - Windows: In Windows Defender Firewall, allow Node.js or port 3000 on Private Networks.
5. **Instant Join Links**:
   - When the host creates a lobby, click **"Copy Link"**.
   - Send or display the direct URL: `http://<HOST_IP>:3000/?room=ABCDEF`.
   - Players visiting that link have the room code pre-filled and only need to type their name and tap **JOIN**!

---

## 👥 Lobby & Match Modes

- **Standard Mode (Exhibition Default)**:
  - Requires **4 to 10 players** to start.
  - Ensures a full, vibrant arena battle.
- **Quick Test Mode (2-Player Testing)**:
  - The host can toggle **"Quick Test Mode (Min 2 Players)"** in the lobby settings panel.
  - Allows two developers or booth staff to test and demonstrate full matches with only 2 devices.
- **Match Durations**:
  - Host can select between **60 Seconds (Blitz)**, **90 Seconds (Standard)**, or **120 Seconds (Endurance)**.
- **Host Permissions & Migration**:
  - Only the host can adjust match duration, toggle test mode, or launch matches.
  - Non-hosts can view settings in real-time.
  - If the host disconnects, the server migrates host status automatically to the next remaining player.
- **Match Finish & Podium**:
  - Detailed final leaderboard: 1st, 2nd, 3rd place podium with crowns and confetti.
  - Complete stat breakdown: Final score, coins collected, power-ups grabbed, hazard hits.
  - Host can click **"PLAY AGAIN"** (launches immediate rematch with fresh round scores) or **"RETURN TO LOBBY"**.

---

## 🧪 Automated Testing & Verification

The project includes an automated test suite verifying 14 key gameplay and network criteria using real Socket.IO client connections.

Run the tests:
```bash
npm test
```

### Verified Test Criteria:
✔ **1. HTTP Endpoints**: `/api/health` and `/api/info` respond with 200 OK and accurate LAN IP data.  
✔ **2. Name Validation**: Rejects empty and whitespace strings, enforces 1-16 characters.  
✔ **3. Lobby Creation**: Generates unique 6-character room codes, establishes host authority.  
✔ **4. Roster Synchronization**: 4 concurrent clients join; player lists sync with distinct colors.  
✔ **5. Host Permissions**: Host settings modifications succeed; unauthorized client settings requests are rejected.  
✔ **6. Min Players Threshold**: Blocks start under 4 players in standard mode; starts at 2 in test mode.  
✔ **7. Authoritative Movement & Physics**: Server processes normalized direction vectors; clamps collisions against solid walls.  
✔ **8. Anti-Cheat Security**: Client attempts to emit `SUBMIT_SCORE` or `COLLECT_COIN` trigger `SECURITY_WARNING` and are ignored.  
✔ **9. Coin Collection & Magnet**: Server verifies proximity collection, awards points, prevents duplicate collections, and pulls coins with magnet power.  
✔ **10. Power-Up Lifecycle**: Speed, Shield, Magnet, and Double Score apply real attributes and expire accurately.  
✔ **11. Chaos Events Engine**: Events trigger deterministically, broadcast notifications, alter arena rules, and cleanly revert.  
✔ **12. Match Timer & Rankings**: Match ends when timer reaches zero; calculates identical winner and rankings across all clients.  
✔ **13. Disconnect Handling & Host Migration**: Gracefully handles unexpected client disconnects without server crashes and migrates host badge.  
✔ **14. Multi-Player Exhibition Simulation**: Full 4-player end-to-end match with input, collisions, bumper bounces, rankings, and replay.

---

## 📁 Project Architecture

```
chaos-arena/
├── package.json               # Scripts and dependencies (Express, Socket.IO)
├── server.js                  # Express HTTP server & Socket.IO network broker
├── lib/
│   ├── Constants.js           # Shared physics, colors, timings, and chaos configs
│   ├── Arena.js               # Map geometry, collision detection, and spawn locations
│   ├── Player.js              # Server-authoritative player model and velocity physics
│   ├── PowerUpManager.js      # Pod spawn cycles, pickups, and duration tracking
│   ├── HazardManager.js       # Moving patrol drones, pinball bumpers, and knockback
│   ├── ChaosManager.js        # 7-event chaos scheduler and safe-zone shrink mechanics
│   └── GameRoom.js            # Room lifecycle, lobby membership, and 30Hz game loop
├── public/
│   ├── index.html             # Semantic markup (Menu, Lobby, Arena HUD, Modals)
│   ├── css/
│   │   ├── style.css          # Cyber-arcade neon theme, responsive layout
│   │   └── hud.css            # Live scores, chaos alerts, mobile virtual joystick
│   └── js/
│       ├── audio.js           # Procedural Web Audio arcade synthesizer & BGM
│       ├── joystick.js        # Touch virtual joystick controller
│       ├── renderer.js        # 2D Canvas renderer with camera tracking and particle FX
│       ├── network.js         # Socket.IO client and linear interpolation buffer
│       └── main.js            # UI controller, keyboard input, and render loop
├── tests/
│   └── server.test.js         # Comprehensive 14-test end-to-end verification suite
└── README.md                  # Documentation and exhibition launch guide
```

---

## 📜 License
MIT License. Built for exhibition and educational demonstration.
