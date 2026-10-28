// lib/PowerUpManager.js - Server-Authoritative Power-Up Spawning and Collection

const {
  POWERUP_RADIUS,
  POWERUP_RESPAWN_DELAY_MS,
  POWERUP_TYPES,
  POWERUP_DURATIONS,
  PLAYER_RADIUS
} = require('./Constants');

class PowerUpManager {
  constructor(arena) {
    this.arena = arena;
    this.types = Object.values(POWERUP_TYPES);
    this.pods = [];
    this.initPods();
  }

  initPods() {
    this.pods = this.arena.powerUpPods.map((pod, idx) => {
      // Pick a diverse initial type for each pod
      const type = this.types[idx % this.types.length];
      return {
        id: pod.id,
        x: pod.x,
        y: pod.y,
        radius: POWERUP_RADIUS,
        type: type,
        active: true,
        respawnAt: 0
      };
    });
  }

  reset() {
    this.initPods();
  }

  update(players) {
    const now = Date.now();
    const events = [];

    for (const pod of this.pods) {
      // Handle respawn
      if (!pod.active) {
        if (now >= pod.respawnAt) {
          pod.active = true;
          // Randomize next type
          pod.type = this.types[Math.floor(Math.random() * this.types.length)];
          events.push({
            event: 'POWERUP_SPAWNED',
            podId: pod.id,
            type: pod.type,
            x: pod.x,
            y: pod.y
          });
        }
        continue;
      }

      // Check collection against active players
      for (const player of players) {
        const dx = player.x - pod.x;
        const dy = player.y - pod.y;
        const distSq = dx * dx + dy * dy;
        const collideDist = PLAYER_RADIUS + pod.radius;

        if (distSq <= collideDist * collideDist) {
          // Player collected this powerup!
          const collectedType = pod.type;
          const duration = POWERUP_DURATIONS[collectedType];

          player.applyPowerUp(collectedType, duration);

          pod.active = false;
          pod.respawnAt = now + POWERUP_RESPAWN_DELAY_MS;

          events.push({
            event: 'POWERUP_COLLECTED',
            playerId: player.id,
            playerName: player.name,
            type: collectedType,
            duration: duration,
            x: pod.x,
            y: pod.y
          });

          break; // One player collects it
        }
      }
    }

    return events;
  }

  serialize() {
    return this.pods.map(pod => ({
      id: pod.id,
      x: pod.x,
      y: pod.y,
      radius: pod.radius,
      type: pod.type,
      active: pod.active
    }));
  }
}

module.exports = PowerUpManager;
