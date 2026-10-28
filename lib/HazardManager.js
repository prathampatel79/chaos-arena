// lib/HazardManager.js - Server-Authoritative Bumpers and Moving Hazards

const {
  HAZARD_RADIUS,
  BUMPER_RADIUS,
  BUMPER_FORCE,
  HAZARD_PENALTY_POINTS,
  PLAYER_RADIUS
} = require('./Constants');

class HazardManager {
  constructor(arena) {
    this.arena = arena;
    this.bumpers = arena.bumpers.map(b => ({ ...b }));

    // 4 Moving Patrol Hazards with well-defined patrol paths
    this.hazards = [
      {
        id: 'h1',
        x: 400,
        y: 170,
        radius: HAZARD_RADIUS,
        speed: 160,
        minX: 300,
        maxX: 1300,
        direction: 1, // 1 = right, -1 = left
        axis: 'x'
      },
      {
        id: 'h2',
        x: 1200,
        y: 830,
        radius: HAZARD_RADIUS,
        speed: 160,
        minX: 300,
        maxX: 1300,
        direction: -1,
        axis: 'x'
      },
      {
        id: 'h3',
        x: 230,
        y: 350,
        radius: HAZARD_RADIUS,
        speed: 140,
        minY: 260,
        maxY: 740,
        direction: 1,
        axis: 'y'
      },
      {
        id: 'h4',
        x: 1370,
        y: 650,
        radius: HAZARD_RADIUS,
        speed: 140,
        minY: 260,
        maxY: 740,
        direction: -1,
        axis: 'y'
      }
    ];

    // Tracking bumper flash animations
    this.bumperCooldowns = {};
  }

  reset() {
    this.bumperCooldowns = {};
    this.hazards[0].x = 400; this.hazards[0].direction = 1;
    this.hazards[1].x = 1200; this.hazards[1].direction = -1;
    this.hazards[2].y = 350; this.hazards[2].direction = 1;
    this.hazards[3].y = 650; this.hazards[3].direction = -1;
  }

  update(dt, players, isOverdrive = false) {
    const events = [];
    const speedMult = isOverdrive ? 2.2 : 1.0;

    // 1. Update patrol hazard positions
    for (const h of this.hazards) {
      if (h.axis === 'x') {
        h.x += h.speed * speedMult * h.direction * dt;
        if (h.x >= h.maxX) {
          h.x = h.maxX;
          h.direction = -1;
        } else if (h.x <= h.minX) {
          h.x = h.minX;
          h.direction = 1;
        }
      } else {
        h.y += h.speed * speedMult * h.direction * dt;
        if (h.y >= h.maxY) {
          h.y = h.maxY;
          h.direction = -1;
        } else if (h.y <= h.minY) {
          h.y = h.minY;
          h.direction = 1;
        }
      }
    }

    const now = Date.now();

    // 2. Check Player vs Bumpers
    for (const bumper of this.bumpers) {
      for (const player of players) {
        const dx = player.x - bumper.x;
        const dy = player.y - bumper.y;
        const distSq = dx * dx + dy * dy;
        const hitDist = PLAYER_RADIUS + bumper.radius;

        if (distSq < hitDist * hitDist) {
          let dist = Math.sqrt(distSq);
          let normX = 1;
          let normY = 0;
          if (dist > 0.0001) {
            normX = dx / dist;
            normY = dy / dist;
          }

          // Push player out of bumper
          player.x = bumper.x + normX * (hitDist + 2);
          player.y = bumper.y + normY * (hitDist + 2);

          // Apply strong elastic impulse away from bumper
          player.vx = normX * BUMPER_FORCE;
          player.vy = normY * BUMPER_FORCE;

          events.push({
            event: 'BUMPER_HIT',
            bumperId: bumper.id,
            playerId: player.id,
            x: bumper.x,
            y: bumper.y
          });
        }
      }
    }

    // 3. Check Player vs Moving Hazards
    for (const hazard of this.hazards) {
      for (const player of players) {
        // Skip if player is already stunned
        if (player.isStunned()) continue;

        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        const distSq = dx * dx + dy * dy;
        const hitDist = PLAYER_RADIUS + hazard.radius;

        if (distSq < hitDist * hitDist) {
          let dist = Math.sqrt(distSq);
          let normX = 1;
          let normY = 0;
          if (dist > 0.0001) {
            normX = dx / dist;
            normY = dy / dist;
          }

          // Push player outside hazard
          player.x = hazard.x + normX * (hitDist + 4);
          player.y = hazard.y + normY * (hitDist + 4);

          // Apply hazard hit with knockback
          const impulseX = normX * 450;
          const impulseY = normY * 450;
          const result = player.takeHazardHit(impulseX, impulseY, HAZARD_PENALTY_POINTS);

          events.push({
            event: 'HAZARD_HIT',
            hazardId: hazard.id,
            playerId: player.id,
            playerName: player.name,
            shieldAbsorbed: result.absorbed,
            pointsLost: result.pointsLost || 0,
            x: hazard.x,
            y: hazard.y
          });
        }
      }
    }

    return events;
  }

  serialize() {
    return {
      bumpers: this.bumpers,
      hazards: this.hazards.map(h => ({
        id: h.id,
        x: Math.round(h.x * 10) / 10,
        y: Math.round(h.y * 10) / 10,
        radius: h.radius,
        axis: h.axis,
        direction: h.direction
      }))
    };
  }
}

module.exports = HazardManager;
