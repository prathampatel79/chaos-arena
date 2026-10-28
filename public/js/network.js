// public/js/network.js - Socket.IO Client Network and Interpolation Controller

class NetworkClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.roomCode = null;
    this.localPlayerId = null;
    this.isHost = false;

    // Game state snapshots buffer for smooth client-side interpolation
    this.currentSnapshot = null;
    this.previousSnapshot = null;
    this.lastSnapshotTime = 0;

    // Input loop
    this.inputInterval = null;
    this.currentInput = { dx: 0, dy: 0 };

    // Event listeners
    this.callbacks = {};
  }

  connect() {
    if (this.socket) return;

    this.socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.localPlayerId = this.socket.id;
      this.trigger('connect', { id: this.socket.id });
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
      this.trigger('lobby_created', data);
    });

    this.socket.on('LOBBY_JOINED', (data) => {
      this.roomCode = data.roomCode;
      this.isHost = data.lobbyState.hostId === this.socket.id;
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
    this.connect();
    this.socket.emit('CREATE_LOBBY', { playerName }, callback);
  }

  joinLobby(playerName, roomCode, callback) {
    this.connect();
    this.socket.emit('JOIN_LOBBY', { playerName, roomCode }, callback);
  }

  setTestMode(testMode) {
    if (this.socket) this.socket.emit('SET_TEST_MODE', { testMode });
  }

  setMatchDuration(duration) {
    if (this.socket) this.socket.emit('SET_MATCH_DURATION', { duration });
  }

  startMatch() {
    if (this.socket) this.socket.emit('START_MATCH');
  }

  playAgain() {
    if (this.socket) this.socket.emit('PLAY_AGAIN');
  }

  returnToLobby() {
    if (this.socket) this.socket.emit('RETURN_TO_LOBBY');
  }

  leaveRoom() {
    if (this.socket) this.socket.emit('LEAVE_ROOM');
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

    // Deep copy players for interpolated rendering positions
    const interpolatedPlayers = this.currentSnapshot.players.map(curr => {
      const prev = this.previousSnapshot.players.find(p => p.id === curr.id);
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
}

window.NetworkClient = NetworkClient;
