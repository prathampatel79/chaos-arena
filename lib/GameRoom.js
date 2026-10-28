// lib/GameRoom.js - Complete Server-Authoritative Game Room Controller

const Arena = require('./Arena');
const Player = require('./Player');
const PowerUpManager = require('./PowerUpManager');
const HazardManager = require('./HazardManager');
const ChaosManager = require('./ChaosManager');
const {
  TICK_RATE,
  TICK_INTERVAL_MS,
  DEFAULT_MATCH_DURATION,
  MIN_PLAYERS_NORMAL,
  MIN_PLAYERS_TEST,
  MAX_PLAYERS,
  MAX_NORMAL_COINS,
  COIN_RADIUS,
  GIANT_COIN_RADIUS,
  COIN_VALUE,
  GIANT_COIN_VALUE,
  COIN_RESPAWN_DELAY_MS,
  MAGNET_RADIUS,
  MAGNET_PULL_SPEED,
  CHAOS_EVENTS,
  PLAYER_COLORS
} = require('./Constants');

class GameRoom {
  constructor(code, hostSocketId, io) {
    this.code = code;
    this.io = io;
    this.hostId = hostSocketId;

    // Room Settings
    this.testMode = false; // When true: min 2 players. When false: min 4 players.
    this.matchDuration = DEFAULT_MATCH_DURATION; // 90 seconds
    this.phase = 'LOBBY'; // 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED'

    // Systems
    this.arena = new Arena();
    this.powerUpManager = new PowerUpManager(this.arena);
    this.hazardManager = new HazardManager(this.arena);
    this.chaosManager = new ChaosManager(this.arena);

    // Players: Map<socketId, Player>
    this.players = new Map();

    // Available color index rotation
    this.colorIndex = 0;

    // Coins: Array of { id, x, y, radius, value, isGiant, isRush, respawnAt }
    this.coins = [];
    this.nextCoinId = 1;
    this.initCoins();

    // Match Timing
    this.matchStartTime = 0;
    this.matchEndTime = 0;
    this.tickInterval = null;
    this.tickCount = 0;
    this.countdownTimer = null;
    this.lastTickTime = Date.now();

    // Round Results
    this.finalResults = null;
  }

  // --- LOBBY MANAGEMENT ---

  getMinPlayers() {
    return this.testMode ? MIN_PLAYERS_TEST : MIN_PLAYERS_NORMAL;
  }

  addPlayer(socketId, name) {
    if (this.players.size >= MAX_PLAYERS) {
      return { success: false, error: 'Lobby is full (maximum 10 players).' };
    }
    if (this.phase !== 'LOBBY') {
      return { success: false, error: 'Match is already in progress.' };
    }

    // Pick distinct color
    const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    const spawnPos = this.arena.getSpawnPoint(this.players.size);
    const player = new Player(socketId, name, color, spawnPos);
    this.players.set(socketId, player);

    return { success: true, player };
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    this.players.delete(socketId);

    // Host migration if host disconnects
    if (this.hostId === socketId && this.players.size > 0) {
      // Migrate to the first remaining player
      const nextHostId = this.players.keys().next().value;
      this.hostId = nextHostId;
    }

    // If no players remain, clean up room
    if (this.players.size === 0) {
      this.cleanup();
    } else if (this.phase === 'PLAYING') {
      // If active match and player drops below minimum
      if (this.players.size < (this.testMode ? 1 : 2)) {
        this.endMatch('Not enough players remaining.');
      }
    }

    return player;
  }

  setTestMode(socketId, enabled) {
    if (socketId !== this.hostId) return { success: false, error: 'Only the host can modify settings.' };
    if (this.phase !== 'LOBBY') return { success: false, error: 'Cannot change settings during match.' };
    this.testMode = Boolean(enabled);
    return { success: true, testMode: this.testMode };
  }

  setMatchDuration(socketId, durationSec) {
    if (socketId !== this.hostId) return { success: false, error: 'Only the host can modify settings.' };
    if (this.phase !== 'LOBBY') return { success: false, error: 'Cannot change settings during match.' };
    const dur = Math.max(30, Math.min(180, Number(durationSec) || 90));
    this.matchDuration = dur;
    return { success: true, matchDuration: this.matchDuration };
  }

  getLobbyState() {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      testMode: this.testMode,
      minPlayers: this.getMinPlayers(),
      matchDuration: this.matchDuration,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isHost: p.id === this.hostId
      }))
    };
  }

  // --- MATCH INITIALIZATION & LIFECYCLE ---

  canStartMatch(socketId) {
    if (socketId !== this.hostId) {
      return { canStart: false, error: 'Only the host can start the match.' };
    }
    if (this.phase !== 'LOBBY' && this.phase !== 'FINISHED') {
      return { canStart: false, error: 'Match already in progress.' };
    }
    const min = this.getMinPlayers();
    if (this.players.size < min) {
      return {
        canStart: false,
        error: `Need at least ${min} players to start (currently ${this.players.size}). ${!this.testMode ? 'Host can enable Quick Test Mode for 2 players in settings.' : ''}`
      };
    }
    return { canStart: true };
  }

  startCountdown(socketId) {
    const check = this.canStartMatch(socketId);
    if (!check.canStart) return check;

    this.phase = 'COUNTDOWN';
    let countdownSec = 3;

    // Reset systems and players
    let spawnIdx = 0;
    for (const player of this.players.values()) {
      const sp = this.arena.getSpawnPoint(spawnIdx++);
      player.resetForNewRound(sp);
    }
    this.initCoins();
    this.powerUpManager.reset();
    this.hazardManager.reset();
    this.chaosManager.reset();

    this.io.to(this.code).emit('COUNTDOWN_START', { countdown: countdownSec });

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      countdownSec--;
      if (countdownSec > 0) {
        this.io.to(this.code).emit('COUNTDOWN_TICK', { countdown: countdownSec });
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startMatch();
      }
    }, 1000);

    return { canStart: true };
  }

  startMatch() {
    this.phase = 'PLAYING';
    const now = Date.now();
    this.matchStartTime = now;
    this.matchEndTime = now + this.matchDuration * 1000;
    this.tickCount = 0;
    this.lastTickTime = now;

    this.chaosManager.start(now);

    this.io.to(this.code).emit('MATCH_STARTED', {
      durationSec: this.matchDuration,
      endTime: this.matchEndTime,
      arena: {
        width: this.arena.width,
        height: this.arena.height,
        walls: this.arena.walls,
        bumpers: this.arena.bumpers
      }
    });

    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this.gameTick(), TICK_INTERVAL_MS);
  }

  // --- COIN MECHANICS ---

  initCoins() {
    this.coins = [];
    for (let i = 0; i < MAX_NORMAL_COINS; i++) {
      const pos = this.arena.getRandomWalkablePosition(90, COIN_RADIUS);
      this.coins.push({
        id: this.nextCoinId++,
        x: pos.x,
        y: pos.y,
        radius: COIN_RADIUS,
        value: COIN_VALUE,
        isGiant: false,
        isRush: false,
        collected: false,
        respawnAt: 0
      });
    }
  }

  spawnRushCoins(count = 25) {
    for (let i = 0; i < count; i++) {
      const pos = this.arena.getRandomWalkablePosition(90, COIN_RADIUS);
      this.coins.push({
        id: this.nextCoinId++,
        x: pos.x,
        y: pos.y,
        radius: COIN_RADIUS,
        value: COIN_VALUE,
        isGiant: false,
        isRush: true, // will be cleaned up when Coin Rush ends
        collected: false,
        respawnAt: 0
      });
    }
  }

  removeRushCoins() {
    this.coins = this.coins.filter(c => !c.isRush);
  }

  setGiantCoins(enable) {
    for (const coin of this.coins) {
      if (!coin.collected) {
        coin.isGiant = enable;
        coin.radius = enable ? GIANT_COIN_RADIUS : COIN_RADIUS;
        coin.value = enable ? GIANT_COIN_VALUE : COIN_VALUE;
      }
    }
  }

  // --- SERVER TICK SIMULATION ---

  handlePlayerInput(socketId, { dx, dy }) {
    const player = this.players.get(socketId);
    if (!player || this.phase !== 'PLAYING') return;

    // Check if Reverse Controls chaos event is active
    const isReversed = this.chaosManager.activeEvent === CHAOS_EVENTS.REVERSE_CONTROLS;
    player.setInput(dx, dy, isReversed);
  }

  gameTick() {
    if (this.phase !== 'PLAYING') return;

    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.05); // max 50ms delta to prevent huge jumps
    this.lastTickTime = now;
    this.tickCount++;

    const events = [];

    // 1. Check match countdown expiration
    const timeLeftMs = Math.max(0, this.matchEndTime - now);
    const timeLeftSec = Math.ceil(timeLeftMs / 1000);

    if (timeLeftMs <= 0) {
      this.finishMatch();
      return;
    }

    // 2. Chaos Manager Update
    const activeChaos = this.chaosManager.activeEvent;
    const chaosEvents = this.chaosManager.update(dt, Array.from(this.players.values()), now);

    for (const ce of chaosEvents) {
      events.push(ce);
      if (ce.event === 'CHAOS_STARTED') {
        if (ce.type === CHAOS_EVENTS.COIN_RUSH) {
          this.spawnRushCoins(25);
        } else if (ce.type === CHAOS_EVENTS.GIANT_COINS) {
          this.setGiantCoins(true);
        }
      } else if (ce.event === 'CHAOS_ENDED') {
        if (ce.type === CHAOS_EVENTS.COIN_RUSH) {
          this.removeRushCoins();
        } else if (ce.type === CHAOS_EVENTS.GIANT_COINS) {
          this.setGiantCoins(false);
        }
      }
    }

    const isSlippery = this.chaosManager.activeEvent === CHAOS_EVENTS.SLIPPERY_FLOOR;
    const isSpeedFrenzy = this.chaosManager.activeEvent === CHAOS_EVENTS.SPEED_FRENZY;
    const isOverdriveHazards = this.chaosManager.activeEvent === CHAOS_EVENTS.MOVING_HAZARDS;

    // 3. Update Players Physics & Collisions
    const playerList = Array.from(this.players.values());
    for (const player of playerList) {
      player.updatePhysics(dt, isSlippery, isSpeedFrenzy);
      this.arena.resolveWallCollisions(player);
    }

    // Player vs Player gentle separation
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const p1 = playerList[i];
        const p2 = playerList[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = p1.radius + p2.radius;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;

          p1.x -= nx * overlap;
          p1.y -= ny * overlap;
          p2.x += nx * overlap;
          p2.y += ny * overlap;

          this.arena.resolveWallCollisions(p1);
          this.arena.resolveWallCollisions(p2);
        }
      }
    }

    // 4. Update Hazards & Bumpers
    const hazardEvents = this.hazardManager.update(dt, playerList, isOverdriveHazards);
    events.push(...hazardEvents);

    // 5. Update Power-Up Pods
    const powerUpEvents = this.powerUpManager.update(playerList);
    events.push(...powerUpEvents);

    // 6. Update Coins (collection, magnet attraction, respawning)
    for (const coin of this.coins) {
      if (coin.collected) {
        // Respawn normal coins after delay
        if (!coin.isRush && now >= coin.respawnAt) {
          const pos = this.arena.getRandomWalkablePosition(90, coin.radius);
          coin.x = pos.x;
          coin.y = pos.y;
          coin.collected = false;
          // Retain giant state if giant event is still active
          const isGiantActive = this.chaosManager.activeEvent === CHAOS_EVENTS.GIANT_COINS;
          coin.isGiant = isGiantActive;
          coin.radius = isGiantActive ? GIANT_COIN_RADIUS : COIN_RADIUS;
          coin.value = isGiantActive ? GIANT_COIN_VALUE : COIN_VALUE;
        }
        continue;
      }

      // Check Coin Magnet effect from any player
      for (const player of playerList) {
        if (player.hasMagnet()) {
          const dx = player.x - coin.x;
          const dy = player.y - coin.y;
          const distSq = dx * dx + dy * dy;

          if (distSq <= MAGNET_RADIUS * MAGNET_RADIUS && distSq > 1) {
            const dist = Math.sqrt(distSq);
            // Pull coin smoothly towards player
            coin.x += (dx / dist) * MAGNET_PULL_SPEED * dt;
            coin.y += (dy / dist) * MAGNET_PULL_SPEED * dt;
          }
        }
      }

      // Check Collection against all players
      for (const player of playerList) {
        const dx = player.x - coin.x;
        const dy = player.y - coin.y;
        const distSq = dx * dx + dy * dy;
        const collectDist = player.radius + coin.radius;

        if (distSq <= collectDist * collectDist) {
          coin.collected = true;
          coin.respawnAt = now + COIN_RESPAWN_DELAY_MS;

          // Points calculation with Double Score check
          let pts = coin.value;
          if (player.hasDoubleScore()) {
            pts *= 2;
          }

          player.score += pts;
          player.coinsCollected++;

          events.push({
            event: 'COIN_COLLECTED',
            coinId: coin.id,
            playerId: player.id,
            playerName: player.name,
            points: pts,
            isGiant: coin.isGiant,
            isDouble: player.hasDoubleScore(),
            x: coin.x,
            y: coin.y
          });

          break; // One player collects this coin
        }
      }
    }

    // 7. Assemble and broadcast authoritative tick snapshot
    const activeCoins = this.coins
      .filter(c => !c.collected)
      .map(c => ({
        id: c.id,
        x: Math.round(c.x),
        y: Math.round(c.y),
        radius: c.radius,
        isGiant: c.isGiant,
        isRush: c.isRush
      }));

    const snapshot = {
      t: this.tickCount,
      timeLeft: timeLeftSec,
      players: playerList.map(p => p.serialize()),
      coins: activeCoins,
      powerUps: this.powerUpManager.serialize(),
      hazards: this.hazardManager.serialize(),
      chaos: this.chaosManager.serialize(now),
      events: events
    };

    this.io.to(this.code).emit('GAME_TICK', snapshot);
  }

  // --- MATCH COMPLETION & RESULTS ---

  finishMatch() {
    this.phase = 'FINISHED';
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Calculate final scores and rankings
    const rankedPlayers = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        coinsCollected: p.coinsCollected,
        powerupsCollected: p.powerupsCollected,
        hazardsHit: p.hazardsHit
      }));

    this.finalResults = {
      winner: rankedPlayers[0] || null,
      rankings: rankedPlayers,
      totalPlayers: rankedPlayers.length,
      matchDuration: this.matchDuration
    };

    this.io.to(this.code).emit('MATCH_FINISHED', this.finalResults);
  }

  endMatch(reason) {
    this.phase = 'LOBBY';
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.io.to(this.code).emit('MATCH_CANCELLED', { reason });
    this.broadcastLobbyUpdate();
  }

  returnToLobby(socketId) {
    if (socketId !== this.hostId) {
      return { success: false, error: 'Only the host can return everyone to the lobby.' };
    }
    this.phase = 'LOBBY';
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.broadcastLobbyUpdate();
    return { success: true };
  }

  broadcastLobbyUpdate() {
    this.io.to(this.code).emit('LOBBY_UPDATE', this.getLobbyState());
  }

  cleanup() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.players.clear();
  }
}

module.exports = GameRoom;
