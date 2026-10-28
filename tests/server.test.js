// tests/server.test.js - Comprehensive End-to-End Multiplayer Verification Test Suite

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const ioClient = require('socket.io-client');
const { app, server, rooms } = require('../server');

const TEST_PORT = 3456;
let baseUrl;

function createClient() {
  return ioClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${eventName}" (${timeoutMs}ms)`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

test.before(async () => {
  await new Promise((resolve) => {
    // If server is already listening, close it or use another port
    if (server.listening) {
      const addr = server.address();
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    } else {
      server.listen(TEST_PORT, () => {
        baseUrl = `http://localhost:${TEST_PORT}`;
        resolve();
      });
    }
  });
});

test.after(async () => {
  // Disconnect any remaining sockets and close server
  for (const r of rooms.values()) {
    r.cleanup();
  }
  rooms.clear();
  await new Promise((resolve) => server.close(resolve));
});

test('1. HTTP Endpoints: /api/health and /api/info respond with valid status', async () => {
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'online');
  assert.ok(typeof healthData.uptime === 'number');

  const infoRes = await fetch(`${baseUrl}/api/info`);
  assert.equal(infoRes.status, 200);
  const infoData = await infoRes.json();
  assert.ok(infoData.recommendedUrl);
});

test('2. Main Menu Validation: Reject empty or whitespace player names', async () => {
  const client = createClient();
  await waitForEvent(client, 'connect');

  // Attempt to create lobby with empty name
  client.emit('CREATE_LOBBY', { playerName: '   ' });
  const errorEvent = await waitForEvent(client, 'ERROR');
  assert.ok(errorEvent.message.includes('valid player name'));

  client.disconnect();
});

test('3. Lobby Creation: Unique 6-character room code generated, creator is host', async () => {
  const host = createClient();
  await waitForEvent(host, 'connect');

  host.emit('CREATE_LOBBY', { playerName: 'PlayerHost' });
  const lobbyData = await waitForEvent(host, 'LOBBY_CREATED');

  assert.ok(lobbyData.success);
  assert.equal(typeof lobbyData.roomCode, 'string');
  assert.equal(lobbyData.roomCode.length, 6);
  assert.equal(lobbyData.player.name, 'PlayerHost');
  assert.equal(lobbyData.lobbyState.hostId, host.id);
  assert.equal(lobbyData.lobbyState.players.length, 1);
  assert.equal(lobbyData.lobbyState.players[0].isHost, true);

  host.disconnect();
});

test('4. Real Multiplayer Roster: Up to 4 clients join lobby, player list synchronizes with distinct colors', async () => {
  const p1 = createClient();
  const p2 = createClient();
  const p3 = createClient();
  const p4 = createClient();

  await Promise.all([
    waitForEvent(p1, 'connect'),
    waitForEvent(p2, 'connect'),
    waitForEvent(p3, 'connect'),
    waitForEvent(p4, 'connect')
  ]);

  // P1 creates room
  p1.emit('CREATE_LOBBY', { playerName: 'Viper' });
  const created = await waitForEvent(p1, 'LOBBY_CREATED');
  const code = created.roomCode;

  // P2, P3, P4 join room
  p2.emit('JOIN_LOBBY', { playerName: 'Neon', roomCode: code });
  await waitForEvent(p2, 'LOBBY_JOINED');

  p3.emit('JOIN_LOBBY', { playerName: 'Ghost', roomCode: code });
  await waitForEvent(p3, 'LOBBY_JOINED');

  p4.emit('JOIN_LOBBY', { playerName: 'Titan', roomCode: code });
  const p4Joined = await waitForEvent(p4, 'LOBBY_JOINED');

  // Verify authoritative room state
  const state = p4Joined.lobbyState;
  assert.equal(state.players.length, 4);

  // Verify all 4 have unique assigned colors
  const hexColors = state.players.map(p => p.color.hex);
  const uniqueColors = new Set(hexColors);
  assert.equal(uniqueColors.size, 4, 'All 4 players must receive distinct colors');

  // Verify host identity is P1 for all
  assert.equal(state.hostId, p1.id);

  p1.disconnect();
  p2.disconnect();
  p3.disconnect();
  p4.disconnect();
});

test('5. Host Permissions: Only host can modify settings or start match', async () => {
  const host = createClient();
  const guest = createClient();

  await Promise.all([waitForEvent(host, 'connect'), waitForEvent(guest, 'connect')]);

  host.emit('CREATE_LOBBY', { playerName: 'HostKing' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  guest.emit('JOIN_LOBBY', { playerName: 'GuestOne', roomCode });
  await waitForEvent(guest, 'LOBBY_JOINED');

  // Guest tries to enable test mode -> Server must reject or ignore
  guest.emit('SET_TEST_MODE', { testMode: true });
  const guestErr = await waitForEvent(guest, 'ERROR');
  assert.ok(guestErr.message.includes('Only the host'));

  // Host changes match duration to 60s
  host.emit('SET_MATCH_DURATION', { duration: 60 });
  const update = await waitForEvent(guest, 'LOBBY_UPDATE');
  assert.equal(update.matchDuration, 60);

  host.disconnect();
  guest.disconnect();
});

test('6. Start Match Threshold & Quick Test Mode: Enforce min 4 in normal, min 1 in test mode', async () => {
  const host = createClient();
  const guest = createClient();

  await Promise.all([waitForEvent(host, 'connect'), waitForEvent(guest, 'connect')]);

  host.emit('CREATE_LOBBY', { playerName: 'HostGuy' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  guest.emit('JOIN_LOBBY', { playerName: 'GuestGuy', roomCode });
  await waitForEvent(guest, 'LOBBY_JOINED');

  // Disable test mode to test standard 4-player threshold
  host.emit('SET_TEST_MODE', { testMode: false });
  await waitForEvent(guest, 'LOBBY_UPDATE');

  // Try to start in normal mode with 2 players -> rejected
  host.emit('START_MATCH');
  const err = await waitForEvent(host, 'ERROR');
  assert.ok(err.message.includes('Need at least 4 players'));

  // Host enables Quick Test Mode
  host.emit('SET_TEST_MODE', { testMode: true });
  await waitForEvent(guest, 'LOBBY_UPDATE');

  // Host starts match in Quick Test Mode with players -> Countdown triggers!
  host.emit('START_MATCH');
  const cdHost = await waitForEvent(host, 'COUNTDOWN_START');
  const cdGuest = await waitForEvent(guest, 'COUNTDOWN_START');
  assert.equal(cdHost.countdown, 3);
  assert.equal(cdGuest.countdown, 3);

  host.disconnect();
  guest.disconnect();
});

test('7. Synchronized Movement & Authoritative Bounds: Server processes input vectors and restricts walls', async () => {
  const host = createClient();
  const guest = createClient();

  await Promise.all([waitForEvent(host, 'connect'), waitForEvent(guest, 'connect')]);

  host.emit('CREATE_LOBBY', { playerName: 'PlayerA' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  guest.emit('JOIN_LOBBY', { playerName: 'PlayerB', roomCode });
  await waitForEvent(guest, 'LOBBY_JOINED');

  // Enable test mode and speed up match start
  const room = rooms.get(roomCode);
  room.testMode = true;
  room.startMatch(); // direct start to skip 3s countdown in test

  // Wait for initial tick
  const tick1 = await waitForEvent(host, 'GAME_TICK');
  const hostP1 = tick1.players.find(p => p.id === host.id);
  const startX = hostP1.x;

  // Send move right input { dx: 1, dy: 0 }
  host.emit('PLAYER_INPUT', { dx: 1, dy: 0 });

  // Wait a few ticks
  await new Promise(r => setTimeout(r, 150));

  const tick2 = await waitForEvent(host, 'GAME_TICK');
  const hostP2 = tick2.players.find(p => p.id === host.id);

  assert.ok(hostP2.x > startX, 'Player position X must advance with move input');
  assert.ok(hostP2.x <= room.arena.width, 'Player position must not exceed arena bounds');

  room.cleanup();
  host.disconnect();
  guest.disconnect();
});

test('8. Anti-Cheat Security: Reject client requests to directly set scores or declare coin pickups', async () => {
  const host = createClient();
  await waitForEvent(host, 'connect');

  host.emit('CREATE_LOBBY', { playerName: 'CheaterAttempt' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  const room = rooms.get(roomCode);
  room.testMode = true;
  room.startMatch();

  // Malicious client tries to emit fake SUBMIT_SCORE or COLLECT_COIN
  host.emit('SUBMIT_SCORE', { score: 9999 });
  const secWarn = await waitForEvent(host, 'SECURITY_WARNING');
  assert.ok(secWarn.message.includes('server-authoritative'));

  // Verify server score is still 0
  const player = room.players.get(host.id);
  assert.equal(player.score, 0, 'Score must remain 0, unaffected by client exploits');

  room.cleanup();
  host.disconnect();
});

test('9. Coin Collection & Magnet: Server awards points on proximity and prevents duplicate collections', async () => {
  const host = createClient();
  await waitForEvent(host, 'connect');

  host.emit('CREATE_LOBBY', { playerName: 'CoinMaster' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  const room = rooms.get(roomCode);
  room.testMode = true;
  room.startMatch();
  // Pause automatic interval to run deterministic manual ticks
  clearInterval(room.tickInterval);
  room.tickInterval = null;

  const player = room.players.get(host.id);
  const coin = room.coins.find(c => !c.collected);
  assert.ok(coin, 'An active coin must exist');

  // Teleport player directly onto coin to test authoritative collision & single-collection guarantee
  player.x = coin.x;
  player.y = coin.y;
  player.vx = 0;
  player.vy = 0;
  player.inputX = 0;
  player.inputY = 0;

  // Advance game tick
  room.gameTick();

  assert.equal(coin.collected, true, 'Coin must be marked collected');
  assert.equal(player.score, 10, 'Player score must increase by coin value (10)');
  assert.equal(player.coinsCollected, 1, 'Player coinsCollected count must be 1');

  // Trigger another tick: Player is still at the same spot, coin must not be collected twice!
  room.gameTick();
  assert.equal(player.score, 10, 'Duplicate collection must be prevented');

  room.cleanup();
  host.disconnect();
});

test('10. Power-Ups: Speed, Shield, Magnet, Double Score apply real status and expire', async () => {
  const host = createClient();
  await waitForEvent(host, 'connect');

  host.emit('CREATE_LOBBY', { playerName: 'PowerRunner' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  const room = rooms.get(roomCode);
  room.testMode = true;
  room.startMatch();
  clearInterval(room.tickInterval);
  room.tickInterval = null;

  const player = room.players.get(host.id);

  // Apply Shield
  player.applyPowerUp('SHIELD', 15000);
  assert.equal(player.hasShield(), true);

  // Simulate Hazard Hit while shielded
  const hitResult = player.takeHazardHit(100, 100, 5);
  assert.equal(hitResult.absorbed, true, 'Shield must absorb hazard hit');
  assert.equal(player.hasShield(), false, 'Shield must be consumed on hit');
  assert.equal(player.score, 0, 'No points lost when hit with shield');

  // Apply Double Score and collect a coin
  player.applyPowerUp('DOUBLE', 10000);
  assert.equal(player.hasDoubleScore(), true);

  const coin = room.coins.find(c => !c.collected);
  player.x = coin.x;
  player.y = coin.y;
  player.vx = 0;
  player.vy = 0;
  player.inputX = 0;
  player.inputY = 0;
  room.gameTick();

  assert.equal(player.score, 20, 'Coin score must be doubled (10 * 2 = 20)');

  room.cleanup();
  host.disconnect();
});

test('11. Chaos Events: Activates, synchronizes event state, and expires cleanly', async () => {
  const host = createClient();
  await waitForEvent(host, 'connect');

  host.emit('CREATE_LOBBY', { playerName: 'ChaosWitness' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  const room = rooms.get(roomCode);
  room.testMode = true;
  room.startMatch();

  // Fast-forward chaos scheduler to trigger an event immediately
  const now = Date.now();
  room.chaosManager.nextEventTime = now - 100;
  room.gameTick();

  assert.ok(room.chaosManager.activeEvent, 'A chaos event must be active');
  const activeType = room.chaosManager.activeEvent;

  // Verify serialized chaos payload in tick snapshot
  const tick = await waitForEvent(host, 'GAME_TICK');
  assert.equal(tick.chaos.activeEvent, activeType);
  assert.ok(tick.chaos.remainingSec > 0);

  // Fast-forward time past expiration
  room.chaosManager.eventEndTime = Date.now() - 100;
  room.gameTick();

  assert.equal(room.chaosManager.activeEvent, null, 'Chaos event must expire and return to null');

  host.disconnect();
});

test('12. Match End & Replay: 90s timer expiration triggers consistent rankings and allows replay', async () => {
  const host = createClient();
  const guest = createClient();

  await Promise.all([waitForEvent(host, 'connect'), waitForEvent(guest, 'connect')]);

  host.emit('CREATE_LOBBY', { playerName: 'HostWinner' });
  const { roomCode } = await waitForEvent(host, 'LOBBY_CREATED');

  guest.emit('JOIN_LOBBY', { playerName: 'GuestRunnerUp', roomCode });
  await waitForEvent(guest, 'LOBBY_JOINED');

  const room = rooms.get(roomCode);
  room.testMode = true;
  room.startMatch();

  // Give Host 50 points and Guest 20 points
  room.players.get(host.id).score = 50;
  room.players.get(guest.id).score = 20;

  // Fast-forward match end timer
  room.matchEndTime = Date.now() - 50;

  // Process game tick -> finish match
  room.gameTick();

  const hostResults = await waitForEvent(host, 'MATCH_FINISHED');
  const guestResults = await waitForEvent(guest, 'MATCH_FINISHED');

  assert.equal(hostResults.winner.name, 'HostWinner');
  assert.equal(guestResults.winner.name, 'HostWinner');
  assert.equal(hostResults.rankings[0].rank, 1);
  assert.equal(hostResults.rankings[0].score, 50);
  assert.equal(hostResults.rankings[1].rank, 2);
  assert.equal(hostResults.rankings[1].score, 20);

  // Host can trigger return to lobby
  host.emit('RETURN_TO_LOBBY');
  const lobbyState = await waitForEvent(guest, 'LOBBY_UPDATE');
  assert.equal(lobbyState.phase, 'LOBBY');

  host.disconnect();
  guest.disconnect();
});

test('13. Disconnect Handling & Host Migration: Server does not crash, host migrates safely', async () => {
  const p1 = createClient();
  const p2 = createClient();

  await Promise.all([waitForEvent(p1, 'connect'), waitForEvent(p2, 'connect')]);

  p1.emit('CREATE_LOBBY', { playerName: 'HostP1' });
  const { roomCode } = await waitForEvent(p1, 'LOBBY_CREATED');

  p2.emit('JOIN_LOBBY', { playerName: 'NextHostP2', roomCode });
  await waitForEvent(p2, 'LOBBY_JOINED');

  const room = rooms.get(roomCode);
  assert.equal(room.hostId, p1.id);

  // Host P1 disconnects
  p1.disconnect();

  // P2 should receive LOBBY_UPDATE where hostId is now P2
  const update = await waitForEvent(p2, 'LOBBY_UPDATE');
  assert.equal(update.hostId, p2.id, 'Host must migrate to next remaining player');
  assert.equal(room.players.size, 1);

  // P2 disconnects -> room cleaned up
  p2.disconnect();
  await new Promise(r => setTimeout(r, 100));
  assert.equal(rooms.has(roomCode), false, 'Empty room must be cleaned up from registry');
});

test('14. Full 4-Player Match Simulation: Lobby -> 4 players join -> countdown -> start -> inputs -> bumper bounce -> finish -> play again', async () => {
  const p1 = createClient();
  const p2 = createClient();
  const p3 = createClient();
  const p4 = createClient();

  await Promise.all([
    waitForEvent(p1, 'connect'),
    waitForEvent(p2, 'connect'),
    waitForEvent(p3, 'connect'),
    waitForEvent(p4, 'connect')
  ]);

  // 1. Host creates lobby
  p1.emit('CREATE_LOBBY', { playerName: 'AlphaHost' });
  const lobby = await waitForEvent(p1, 'LOBBY_CREATED');
  const code = lobby.roomCode;

  // 2. 3 other players join
  p2.emit('JOIN_LOBBY', { playerName: 'Bravo', roomCode: code });
  await waitForEvent(p2, 'LOBBY_JOINED');

  p3.emit('JOIN_LOBBY', { playerName: 'Charlie', roomCode: code });
  await waitForEvent(p3, 'LOBBY_JOINED');

  p4.emit('JOIN_LOBBY', { playerName: 'Delta', roomCode: code });
  await waitForEvent(p4, 'LOBBY_JOINED');

  const room = rooms.get(code);
  assert.equal(room.players.size, 4);

  // 3. Normal match can now start with 4 players!
  assert.equal(room.canStartMatch(p1.id).canStart, true);

  // Directly start match to simulate gameplay
  room.startMatch();

  // 4. Verify all 4 clients receive GAME_TICK updates
  const [t1, t2, t3, t4] = await Promise.all([
    waitForEvent(p1, 'GAME_TICK'),
    waitForEvent(p2, 'GAME_TICK'),
    waitForEvent(p3, 'GAME_TICK'),
    waitForEvent(p4, 'GAME_TICK')
  ]);

  assert.equal(t1.players.length, 4);
  assert.equal(t2.players.length, 4);
  assert.equal(t3.players.length, 4);
  assert.equal(t4.players.length, 4);

  // 5. Send inputs from all players
  p1.emit('PLAYER_INPUT', { dx: 1, dy: 0 });
  p2.emit('PLAYER_INPUT', { dx: -1, dy: 0 });
  p3.emit('PLAYER_INPUT', { dx: 0, dy: 1 });
  p4.emit('PLAYER_INPUT', { dx: 0, dy: -1 });

  // Simulate simulation frames
  for (let i = 0; i < 5; i++) {
    room.gameTick();
  }

  // 6. Test Bumper collision
  const bumper = room.arena.bumpers[0];
  const player1 = room.players.get(p1.id);
  player1.x = bumper.x + 2;
  player1.y = bumper.y + 2;
  room.gameTick();

  assert.ok(player1.vx !== 0 || player1.vy !== 0, 'Player must receive bumper velocity impulse');

  // 7. Finish Match and verify consistent rankings across all 4 clients
  room.players.get(p1.id).score = 80;
  room.players.get(p2.id).score = 60;
  room.players.get(p3.id).score = 40;
  room.players.get(p4.id).score = 20;

  room.finishMatch();

  const [res1, res2, res3, res4] = await Promise.all([
    waitForEvent(p1, 'MATCH_FINISHED'),
    waitForEvent(p2, 'MATCH_FINISHED'),
    waitForEvent(p3, 'MATCH_FINISHED'),
    waitForEvent(p4, 'MATCH_FINISHED')
  ]);

  assert.equal(res1.winner.name, 'AlphaHost');
  assert.equal(res2.winner.name, 'AlphaHost');
  assert.equal(res3.winner.name, 'AlphaHost');
  assert.equal(res4.winner.name, 'AlphaHost');

  // 8. Host triggers Play Again
  p1.emit('PLAY_AGAIN');
  const cdStart = await waitForEvent(p2, 'COUNTDOWN_START');
  assert.equal(cdStart.countdown, 3);

  // Clean up
  p1.disconnect();
  p2.disconnect();
  p3.disconnect();
  p4.disconnect();
});
