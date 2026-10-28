// server.js - Express & Socket.IO Multiplayer Game Server

const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const GameRoom = require('./lib/GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

// Serve static frontend assets (from root and public)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Registry: Map<roomCode, GameRoom>
const rooms = new Map();
// Socket ID to room code lookup: Map<socketId, roomCode>
const socketToRoom = new Map();

// Helper: Get local network IPv4 address for LAN multiplayer
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip internal (localhost 127.0.0.1) and non-ipv4
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// API endpoint for health check and server status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    uptime: Math.floor(process.uptime()),
    activeRooms: rooms.size,
    totalPlayers: socketToRoom.size
  });
});

// API endpoint to return server LAN IP addresses for LAN multiplayer helper
app.get('/api/info', (req, res) => {
  const lanIps = getLocalIpAddresses();
  res.json({
    port: PORT,
    lanIps: lanIps,
    recommendedUrl: lanIps.length > 0 ? `http://${lanIps[0]}:${PORT}` : `http://localhost:${PORT}`
  });
});

// Generate 6-character room code (unambiguous uppercase alphanumeric)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateRoomCode() {
  let code = '';
  for (let attempts = 0; attempts < 1000; attempts++) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
    if (!rooms.has(code)) return code;
  }
  return code;
}

// Validate player name
function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/[<>]/g, '');
  if (!trimmed || trimmed.length === 0) return null;
  return trimmed.slice(0, 16);
}

// Socket.IO Multiplayer Lifecycle
io.on('connection', (socket) => {
  // 1. Create Room
  socket.on('CREATE_LOBBY', (data, callback) => {
    const rawName = data && data.playerName;
    const name = sanitizeName(rawName);
    if (!name) {
      const err = 'Please enter a valid player name (1-16 characters).';
      if (typeof callback === 'function') callback({ success: false, error: err });
      socket.emit('ERROR', { message: err });
      return;
    }

    const code = generateRoomCode();
    const room = new GameRoom(code, socket.id, io);
    rooms.set(code, room);

    const joinResult = room.addPlayer(socket.id, name);
    if (!joinResult.success) {
      if (typeof callback === 'function') callback({ success: false, error: joinResult.error });
      socket.emit('ERROR', { message: joinResult.error });
      return;
    }

    socket.join(code);
    socketToRoom.set(socket.id, code);

    const response = {
      success: true,
      roomCode: code,
      player: joinResult.player.serialize(),
      lobbyState: room.getLobbyState()
    };

    if (typeof callback === 'function') callback(response);
    socket.emit('LOBBY_CREATED', response);
  });

  // 2. Join Room
  socket.on('JOIN_LOBBY', (data, callback) => {
    const rawName = data && data.playerName;
    const rawCode = data && data.roomCode;

    const name = sanitizeName(rawName);
    if (!name) {
      const err = 'Please enter a valid player name (1-16 characters).';
      if (typeof callback === 'function') callback({ success: false, error: err });
      socket.emit('ERROR', { message: err });
      return;
    }

    if (typeof rawCode !== 'string' || rawCode.trim().length === 0) {
      const err = 'Please enter a valid 6-character room code.';
      if (typeof callback === 'function') callback({ success: false, error: err });
      socket.emit('ERROR', { message: err });
      return;
    }

    const code = rawCode.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      const err = `Room "${code}" was not found. Please verify the code.`;
      if (typeof callback === 'function') callback({ success: false, error: err });
      socket.emit('ERROR', { message: err });
      return;
    }

    const joinResult = room.addPlayer(socket.id, name);
    if (!joinResult.success) {
      if (typeof callback === 'function') callback({ success: false, error: joinResult.error });
      socket.emit('ERROR', { message: joinResult.error });
      return;
    }

    socket.join(code);
    socketToRoom.set(socket.id, code);

    const response = {
      success: true,
      roomCode: code,
      player: joinResult.player.serialize(),
      lobbyState: room.getLobbyState()
    };

    if (typeof callback === 'function') callback(response);
    socket.emit('LOBBY_JOINED', response);
    // Broadcast updated player list to other room members
    room.broadcastLobbyUpdate();
  });

  // 3. Lobby Settings
  socket.on('SET_TEST_MODE', (data) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const res = room.setTestMode(socket.id, data && data.testMode);
    if (!res.success) {
      socket.emit('ERROR', { message: res.error });
    } else {
      room.broadcastLobbyUpdate();
    }
  });

  socket.on('SET_MATCH_DURATION', (data) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const res = room.setMatchDuration(socket.id, data && data.duration);
    if (!res.success) {
      socket.emit('ERROR', { message: res.error });
    } else {
      room.broadcastLobbyUpdate();
    }
  });

  // 4. Start Match
  socket.on('START_MATCH', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const res = room.startCountdown(socket.id);
    if (!res.canStart) {
      socket.emit('ERROR', { message: res.error });
    }
  });

  // 5. Player Movement Input
  socket.on('PLAYER_INPUT', (input) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    room.handlePlayerInput(socket.id, input || {});
  });

  // 6. Play Again
  socket.on('PLAY_AGAIN', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const res = room.startCountdown(socket.id);
    if (!res.canStart) {
      socket.emit('ERROR', { message: res.error });
    }
  });

  // 7. Return to Lobby
  socket.on('RETURN_TO_LOBBY', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const res = room.returnToLobby(socket.id);
    if (!res.success) {
      socket.emit('ERROR', { message: res.error });
    }
  });

  // 8. Leave Room
  socket.on('LEAVE_ROOM', () => {
    handlePlayerLeave(socket);
  });

  // 9. Disconnect
  socket.on('disconnect', () => {
    handlePlayerLeave(socket);
  });

  // 10. Anti-Cheat Security: Catch unauthorized client claims
  socket.on('SUBMIT_SCORE', () => {
    // REJECT: Server is authoritative.
    socket.emit('SECURITY_WARNING', { message: 'Rejected: Score calculation is server-authoritative.' });
  });

  socket.on('COLLECT_COIN', () => {
    // REJECT: Server is authoritative.
    socket.emit('SECURITY_WARNING', { message: 'Rejected: Coin collection is server-authoritative.' });
  });
});

function handlePlayerLeave(socket) {
  const code = socketToRoom.get(socket.id);
  if (!code) return;

  socketToRoom.delete(socket.id);
  socket.leave(code);

  const room = rooms.get(code);
  if (!room) return;

  room.removePlayer(socket.id);

  if (room.players.size === 0) {
    rooms.delete(code);
  } else {
    room.broadcastLobbyUpdate();
  }
}

function startServer(port = PORT) {
  return new Promise((resolve) => {
    if (server.listening) {
      resolve(server);
      return;
    }
    server.listen(port, '0.0.0.0', () => {
      const lanIps = getLocalIpAddresses();
      console.log('====================================================');
      console.log('⚡  CHAOS ARENA - MULTIPLAYER ARCADE SERVER RUNNING  ⚡');
      console.log('====================================================');
      console.log(`📡 Local Access:    http://localhost:${port}`);
      if (lanIps.length > 0) {
        console.log(`🌐 LAN Multiplayer: http://${lanIps[0]}:${port}`);
        for (let i = 1; i < lanIps.length; i++) {
          console.log(`                    http://${lanIps[i]}:${port}`);
        }
      } else {
        console.log('🌐 LAN Multiplayer: Connect players to your local Wi-Fi IP');
      }
      console.log('====================================================\n');
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, rooms, startServer };
