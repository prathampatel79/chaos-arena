// js/network.js - Socket.IO Client Network and Solo Simulation Controller

class NetworkClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.roomCode = null;
    this.localPlayerId = null;
    this.isHost = false;
    this.isSolo = false;

    // Game state snapshots buffer for smooth client-side interpolation
    this.currentSnapshot = null;
    this.previousSnapshot = null;
    this.lastSnapshotTime = 0;

    // Input loop
    this.inputInterval = null;
    this.currentInput = { dx: 0, dy: 0 };

    // Event listeners
    this.callbacks = {};

    // Solo simulation state
    this.soloTimer = null;
    this.soloCountdown = null;
    this.soloState = null;
  }

  getServerUrl() {
    const custom = localStorage.getItem('chaos_arena_custom_server');
    if (custom && custom.trim().length > 0) {
      return custom.trim();
    }
    // If on GitHub Pages and no custom server is specified
    if (window.location.hostname.endsWith('github.io')) {
      return null;
    }
    return window.location.origin;
  }

  connect(customUrl = null) {
    if (this.socket && this.connected) return;

    const url = customUrl || this.getServerUrl();
    if (!url) {
      // On GitHub Pages with no backend specified
      this.trigger('error', {
        message: 'On GitHub Pages (static host). To play multiplayer, enter your Node.js server URL in Settings, or click "PLAY SOLO PRACTICE"!'
      });
      return;
    }

    try {
      if (typeof io !== 'function') {
        this.trigger('error', { message: 'Socket.IO client library is loading. Please retry.' });
        return;
      }

      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 6000
      });

      this.socket.on('connect', () => {
        this.connected = true;
        this.localPlayerId = this.socket.id;
        this.isSolo = false;
        this.trigger('connect', { id: this.socket.id });
      });

      this.socket.on('connect_error', (err) => {
        this.connected = false;
        this.trigger('error', {
          message: `Unable to connect to multiplayer server at ${url}. Verify server is running with 'npm start', or play Solo Practice!`
        });
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        this.stopInputLoop();
        this.trigger('disconnect');
      });

      // Lobby events
      this.socket.on('LOBBY_CREATED', (data) => {
        this.roomCode = data.roomCode;
        this.isHost = true;
        this.isSolo = false;
        this.trigger('lobby_created', data);
      });

      this.socket.on('LOBBY_JOINED', (data) => {
        this.roomCode = data.roomCode;
        this.isHost = data.lobbyState.hostId === this.socket.id;
        this.isSolo = false;
        this.trigger('lobby_joined', data);
      });

      this.socket.on('LOBBY_UPDATE', (lobbyState) => {
        this.isHost = lobbyState.hostId === this.socket.id;
        this.trigger('lobby_update', lobbyState);
      });

      // Countdown & Match Start
      this.socket.on('COUNTDOWN_START', (data) => this.trigger('countdown_start', data));
      this.socket.on('COUNTDOWN_TICK', (data) => this.trigger('countdown_tick', data));
      this.socket.on('MATCH_STARTED', (data) => {
        this.startInputLoop();
        this.trigger('match_started', data);
      });

      // Game Ticks & Interpolation
      this.socket.on('GAME_TICK', (snapshot) => {
        this.previousSnapshot = this.currentSnapshot;
        this.currentSnapshot = snapshot;
        this.lastSnapshotTime = Date.now();
        this.trigger('game_tick', snapshot);
      });

      // Match Completion
      this.socket.on('MATCH_FINISHED', (results) => {
        this.stopInputLoop();
        this.trigger('match_finished', results);
      });

      this.socket.on('MATCH_CANCELLED', (data) => {
        this.stopInputLoop();
        this.trigger('match_cancelled', data);
      });

      // Errors & Security
      this.socket.on('ERROR', (err) => this.trigger('error', err));
      this.socket.on('SECURITY_WARNING', (warn) => this.trigger('security_warning', warn));
    } catch (e) {
      console.warn('Socket connect failed:', e);
      this.trigger('error', { message: 'Failed to initialize connection to server.' });
    }
  }

  on(event, callback) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(callback);
  }

  trigger(event, data) {
    const list = this.callbacks[event];
    if (list) {
      for (const cb of list) cb(data);
    }
  }

  // --- ACTIONS ---

  createLobby(playerName, callback) {
    if (!this.socket || !this.connected) {
      this.connect();
    }
    if (!this.socket) {
      if (typeof callback === 'function') callback({ success: false, error: 'Connecting to server...' });
      return;
    }
    this.socket.emit('CREATE_LOBBY', { playerName }, callback);
  }

  joinLobby(playerName, roomCode, callback) {
    if (!this.socket || !this.connected) {
      this.connect();
    }
    if (!this.socket) {
      if (typeof callback === 'function') callback({ success: false, error: 'Connecting to server...' });
      return;
    }
    this.socket.emit('JOIN_LOBBY', { playerName, roomCode }, callback);
  }

  setTestMode(testMode) {
    if (this.socket && this.connected) this.socket.emit('SET_TEST_MODE', { testMode });
  }

  setMatchDuration(duration) {
    if (this.socket && this.connected) this.socket.emit('SET_MATCH_DURATION', { duration });
  }

  startMatch() {
    if (this.isSolo) {
      this.startSoloCountdown();
      return;
    }
    if (this.socket && this.connected) this.socket.emit('START_MATCH');
  }

  playAgain() {
    if (this.isSolo) {
      this.startSoloCountdown();
      return;
    }
    if (this.socket && this.connected) this.socket.emit('PLAY_AGAIN');
  }

  returnToLobby() {
    if (this.isSolo) {
      this.stopSoloSimulation();
      this.trigger('return_menu');
      return;
    }
    if (this.socket && this.connected) this.socket.emit('RETURN_TO_LOBBY');
  }

  leaveRoom() {
    if (this.isSolo) {
      this.stopSoloSimulation();
      return;
    }
    if (this.socket && this.connected) this.socket.emit('LEAVE_ROOM');
    this.stopInputLoop();
    this.roomCode = null;
    this.isHost = false;
  }

  // --- INPUT STREAM (30Hz Client Emission) ---

  setInput(dx, dy) {
    this.currentInput = { dx, dy };
  }

  startInputLoop() {
    this.stopInputLoop();
    this.inputInterval = setInterval(() => {
      if (this.isSolo) {
        // Solo mode directly updates local simulation
        return;
      }
      if (this.socket && this.connected) {
        this.socket.emit('PLAYER_INPUT', this.currentInput);
      }
    }, 1000 / 30);
  }

  stopInputLoop() {
    if (this.inputInterval) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
    this.currentInput = { dx: 0, dy: 0 };
  }

  // Linear Interpolation helper for smooth 60fps rendering between 30Hz snapshots
  getInterpolatedState() {
    if (!this.currentSnapshot) return null;
    if (!this.previousSnapshot) return this.currentSnapshot;

    const tickDuration = 1000 / 30;
    const elapsed = Date.now() - this.lastSnapshotTime;
    const alpha = Math.min(1.0, elapsed / tickDuration);

    const interpolatedPlayers = (this.currentSnapshot.players || []).map(curr => {
      const prev = (this.previousSnapshot.players || []).find(p => p.id === curr.id);
      if (!prev) return curr;

      return {
        ...curr,
        x: prev.x + (curr.x - prev.x) * alpha,
        y: prev.y + (curr.y - prev.y) * alpha
      };
    });

    return {
      ...this.currentSnapshot,
      players: interpolatedPlayers
    };
  }

  // ========================================================
  // --- OFFLINE / SOLO PRACTICE MODE (GITHUB PAGES READY) ---
  // ========================================================

  startSoloPractice(playerName) {
    this.isSolo = true;
    this.isHost = true;
    this.localPlayerId = 'solo-player';
    this.playerName = playerName || 'SoloFighter';

    this.startSoloCountdown();
  }

  startSoloCountdown() {
    this.stopSoloSimulation();

    let cd = 3;
    this.trigger('countdown_start', { countdown: cd });

    this.soloCountdown = setInterval(() => {
      cd--;
      if (cd > 0) {
        this.trigger('countdown_tick', { countdown: cd });
      } else {
        clearInterval(this.soloCountdown);
        this.soloCountdown = null;
        this.runSoloMatch();
      }
    }, 1000);
  }

  runSoloMatch() {
    const duration = 90;
    const now = Date.now();
    const endTime = now + duration * 1000;

    // Solo Player
    const player = {
      id: 'solo-player',
      name: this.playerName,
      color: { name: 'Cyan', hex: '#00F0FF', border: '#00B8CC' },
      x: 800,
      y: 500,
      vx: 0,
      vy: 0,
      angle: 0,
      score: 0,
      coinsCollected: 0,
      powerupsCollected: 0,
      hazardsHit: 0,
      isStunned: false,
      stunnedUntil: 0,
      powerUps: { speed: 0, shield: false, magnet: 0, double: 0 },
      speedUntil: 0,
      magnetUntil: 0,
      doubleUntil: 0
    };

    // Bumpers
    const bumpers = [
      { id: 'b1', x: 480, y: 480, radius: 32, glow: '#ff0055' },
      { id: 'b2', x: 1120, y: 480, radius: 32, glow: '#ff0055' },
      { id: 'b3', x: 800, y: 220, radius: 32, glow: '#00f0ff' },
      { id: 'b4', x: 800, y: 760, radius: 32, glow: '#00f0ff' }
    ];

    // Obstacles
    const obstacles = [
      { x: 300, y: 220, w: 180, h: 50 },
      { x: 1120, y: 220, w: 180, h: 50 },
      { x: 300, y: 730, w: 180, h: 50 },
      { x: 1120, y: 730, w: 180, h: 50 },
      { x: 720, y: 340, w: 160, h: 40 },
      { x: 720, y: 620, w: 160, h: 40 },
      { x: 540, y: 460, w: 40, h: 80 },
      { x: 1020, y: 460, w: 40, h: 80 }
    ];

    // Power-Up Pods
    const powerUps = [
      { id: 'pod-north', x: 800, y: 100, radius: 20, type: 'SPEED', active: true, respawnAt: 0 },
      { id: 'pod-south', x: 800, y: 900, radius: 20, type: 'SHIELD', active: true, respawnAt: 0 },
      { id: 'pod-west', x: 120, y: 500, radius: 20, type: 'MAGNET', active: true, respawnAt: 0 },
      { id: 'pod-east', x: 1480, y: 500, radius: 20, type: 'DOUBLE', active: true, respawnAt: 0 }
    ];

    // Moving Hazards
    const hazards = [
      { id: 'h1', x: 400, y: 170, radius: 26, speed: 160, minX: 300, maxX: 1300, direction: 1, axis: 'x' },
      { id: 'h2', x: 1200, y: 830, radius: 26, speed: 160, minX: 300, maxX: 1300, direction: -1, axis: 'x' },
      { id: 'h3', x: 230, y: 350, radius: 26, speed: 140, minY: 260, maxY: 740, direction: 1, axis: 'y' },
      { id: 'h4', x: 1370, y: 650, radius: 26, speed: 140, minY: 260, maxY: 740, direction: -1, axis: 'y' }
    ];

    // Coins
    const coins = [];
    for (let i = 0; i < 35; i++) {
      coins.push({
        id: i + 1,
        x: 100 + Math.random() * 1400,
        y: 100 + Math.random() * 800,
        radius: 11,
        value: 10,
        isGiant: false,
        collected: false,
        respawnAt: 0
      });
    }

    // Chaos Events
    const chaosList = ['SLIPPERY_FLOOR', 'REVERSE_CONTROLS', 'COIN_RUSH', 'GIANT_COINS', 'MOVING_HAZARDS', 'SPEED_FRENZY'];
    let chaosActive = null;
    let nextChaosTime = now + 15000;
    let chaosEndTime = 0;

    let tick = 0;
    let lastTick = Date.now();

    this.trigger('match_started', { durationSec: duration, endTime });

    this.soloTimer = setInterval(() => {
      const curNow = Date.now();
      const dt = Math.min((curNow - lastTick) / 1000, 0.05);
      lastTick = curNow;
      tick++;

      const timeLeftSec = Math.max(0, Math.ceil((endTime - curNow) / 1000));
      if (timeLeftSec <= 0) {
        this.stopSoloSimulation();
        this.trigger('match_finished', {
          winner: player,
          rankings: [{
            rank: 1,
            id: player.id,
            name: player.name,
            color: player.color,
            score: player.score,
            coinsCollected: player.coinsCollected,
            powerupsCollected: player.powerupsCollected,
            hazardsHit: player.hazardsHit
          }],
          totalPlayers: 1,
          matchDuration: duration
        });
        return;
      }

      const events = [];

      // Chaos update
      if (chaosActive) {
        if (curNow >= chaosEndTime) {
          const prev = chaosActive;
          chaosActive = null;
          nextChaosTime = curNow + 20000;
          events.push({ event: 'CHAOS_ENDED', type: prev });
        }
      } else if (curNow >= nextChaosTime) {
        chaosActive = chaosList[Math.floor(Math.random() * chaosList.length)];
        chaosEndTime = curNow + 10000;
        events.push({ event: 'CHAOS_STARTED', type: chaosActive, title: chaosActive.replace('_', ' ') });
      }

      // Physics
      const isSlippery = chaosActive === 'SLIPPERY_FLOOR';
      const isReversed = chaosActive === 'REVERSE_CONTROLS';
      const isSpeedFrenzy = chaosActive === 'SPEED_FRENZY';

      let ix = this.currentInput.dx;
      let iy = this.currentInput.dy;
      if (isReversed) { ix = -ix; iy = -iy; }

      let spd = 280;
      if (curNow < player.speedUntil) spd *= 1.6;
      if (isSpeedFrenzy) spd *= 1.8;

      if (curNow < player.stunnedUntil) {
        player.vx *= 0.88;
        player.vy *= 0.88;
      } else if (isSlippery) {
        player.vx += ix * spd * 4 * dt;
        player.vy += iy * spd * 4 * dt;
        player.vx *= 0.985;
        player.vy *= 0.985;
      } else {
        if (ix !== 0 || iy !== 0) {
          player.vx = ix * spd;
          player.vy = iy * spd;
          player.angle = Math.atan2(iy, ix);
        } else {
          player.vx *= 0.8;
          player.vy *= 0.8;
        }
      }

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      // Arena walls clamp
      player.x = Math.max(54, Math.min(1546, player.x));
      player.y = Math.max(54, Math.min(946, player.y));

      // Bumpers
      for (const b of bumpers) {
        const dx = player.x - b.x;
        const dy = player.y - b.y;
        const dSq = dx * dx + dy * dy;
        const minDist = 22 + b.radius;
        if (dSq < minDist * minDist) {
          const dist = Math.sqrt(dSq) || 1;
          player.vx = (dx / dist) * 600;
          player.vy = (dy / dist) * 600;
          events.push({ event: 'BUMPER_HIT', bumperId: b.id, playerId: player.id });
        }
      }

      // Moving Hazards
      for (const h of hazards) {
        if (h.axis === 'x') {
          h.x += h.speed * (chaosActive === 'MOVING_HAZARDS' ? 2 : 1) * h.direction * dt;
          if (h.x >= h.maxX) { h.x = h.maxX; h.direction = -1; }
          else if (h.x <= h.minX) { h.x = h.minX; h.direction = 1; }
        } else {
          h.y += h.speed * (chaosActive === 'MOVING_HAZARDS' ? 2 : 1) * h.direction * dt;
          if (h.y >= h.maxY) { h.y = h.maxY; h.direction = -1; }
          else if (h.y <= h.minY) { h.y = h.minY; h.direction = 1; }
        }

        if (curNow > player.stunnedUntil) {
          const dx = player.x - h.x;
          const dy = player.y - h.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < (22 + h.radius) * (22 + h.radius)) {
            player.hazardsHit++;
            if (player.powerUps.shield) {
              player.powerUps.shield = false;
              events.push({ event: 'HAZARD_HIT', hazardId: h.id, playerId: player.id, shieldAbsorbed: true });
            } else {
              player.stunnedUntil = curNow + 600;
              const dist = Math.sqrt(dSq) || 1;
              player.vx = (dx / dist) * 450;
              player.vy = (dy / dist) * 450;
              player.score = Math.max(0, player.score - 5);
              events.push({ event: 'HAZARD_HIT', hazardId: h.id, playerId: player.id, pointsLost: 5 });
            }
          }
        }
      }

      // Power-Ups
      for (const pod of powerUps) {
        if (!pod.active && curNow >= pod.respawnAt) pod.active = true;
        if (pod.active) {
          const dx = player.x - pod.x;
          const dy = player.y - pod.y;
          if (dx * dx + dy * dy < (22 + pod.radius) * (22 + pod.radius)) {
            pod.active = false;
            pod.respawnAt = curNow + 15000;
            player.powerupsCollected++;
            if (pod.type === 'SPEED') player.speedUntil = curNow + 7000;
            if (pod.type === 'SHIELD') player.powerUps.shield = true;
            if (pod.type === 'MAGNET') player.magnetUntil = curNow + 8000;
            if (pod.type === 'DOUBLE') player.doubleUntil = curNow + 10000;
            events.push({ event: 'POWERUP_COLLECTED', type: pod.type, playerId: player.id, x: pod.x, y: pod.y });
          }
        }
      }

      // Coins & Magnet
      const hasMagnet = curNow < player.magnetUntil;
      const isDouble = curNow < player.doubleUntil;
      for (const coin of coins) {
        if (coin.collected) {
          if (curNow >= coin.respawnAt) {
            coin.x = 100 + Math.random() * 1400;
            coin.y = 100 + Math.random() * 800;
            coin.collected = false;
          }
          continue;
        }

        const dx = player.x - coin.x;
        const dy = player.y - coin.y;
        const dSq = dx * dx + dy * dy;

        if (hasMagnet && dSq < 240 * 240 && dSq > 1) {
          const dist = Math.sqrt(dSq);
          coin.x += (dx / dist) * 320 * dt;
          coin.y += (dy / dist) * 320 * dt;
        }

        if (dSq < (22 + coin.radius) * (22 + coin.radius)) {
          coin.collected = true;
          coin.respawnAt = curNow + 3000;
          const pts = (coin.isGiant ? 50 : 10) * (isDouble ? 2 : 1);
          player.score += pts;
          player.coinsCollected++;
          events.push({ event: 'COIN_COLLECTED', coinId: coin.id, playerId: player.id, points: pts, isDouble, x: coin.x, y: coin.y });
        }
      }

      // Update Power-up timers on player
      player.powerUps.speed = curNow < player.speedUntil ? Math.ceil((player.speedUntil - curNow) / 1000) : 0;
      player.powerUps.magnet = curNow < player.magnetUntil ? Math.ceil((player.magnetUntil - curNow) / 1000) : 0;
      player.powerUps.double = curNow < player.doubleUntil ? Math.ceil((player.doubleUntil - curNow) / 1000) : 0;
      player.isStunned = curNow < player.stunnedUntil;

      // Broadcast Snapshot
      const snapshot = {
        t: tick,
        timeLeft: timeLeftSec,
        players: [{
          id: player.id,
          name: player.name,
          color: player.color,
          x: Math.round(player.x),
          y: Math.round(player.y),
          vx: player.vx,
          vy: player.vy,
          angle: player.angle,
          score: player.score,
          isStunned: player.isStunned,
          powerUps: player.powerUps
        }],
        coins: coins.filter(c => !c.collected).map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), radius: c.radius, isGiant: c.isGiant })),
        powerUps: powerUps.map(p => ({ id: p.id, x: p.x, y: p.y, radius: p.radius, type: p.type, active: p.active })),
        hazards: {
          bumpers,
          hazards: hazards.map(h => ({ id: h.id, x: Math.round(h.x), y: Math.round(h.y), radius: h.radius, axis: h.axis, direction: h.direction }))
        },
        chaos: {
          activeEvent: chaosActive,
          remainingSec: chaosActive ? Math.ceil((chaosEndTime - curNow) / 1000) : 0,
          safeZone: null
        },
        events
      };

      this.previousSnapshot = this.currentSnapshot;
      this.currentSnapshot = snapshot;
      this.lastSnapshotTime = curNow;
      this.trigger('game_tick', snapshot);
    }, 1000 / 30);
  }

  stopSoloSimulation() {
    if (this.soloCountdown) {
      clearInterval(this.soloCountdown);
      this.soloCountdown = null;
    }
    if (this.soloTimer) {
      clearInterval(this.soloTimer);
      this.soloTimer = null;
    }
  }
}

window.NetworkClient = NetworkClient;
