// lib/Arena.js - Geometry, Walls, Bumpers, and Collision Handling

const {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_RADIUS,
  BUMPER_RADIUS
} = require('./Constants');

class Arena {
  constructor() {
    this.width = ARENA_WIDTH;
    this.height = ARENA_HEIGHT;
    this.wallThickness = 32;

    // Outer perimeter walls: [x, y, width, height]
    this.outerWalls = [
      { x: 0, y: 0, w: this.width, h: this.wallThickness }, // Top
      { x: 0, y: this.height - this.wallThickness, w: this.width, h: this.wallThickness }, // Bottom
      { x: 0, y: 0, w: this.wallThickness, h: this.height }, // Left
      { x: this.width - this.wallThickness, y: 0, w: this.wallThickness, h: this.height } // Right
    ];

    // Interior strategic obstacles (symmetrical arcade map)
    this.obstacles = [
      // Northwest & Northeast barriers
      { x: 300, y: 220, w: 180, h: 50, color: '#1e293b' },
      { x: 1120, y: 220, w: 180, h: 50, color: '#1e293b' },

      // Southwest & Southeast barriers
      { x: 300, y: 730, w: 180, h: 50, color: '#1e293b' },
      { x: 1120, y: 730, w: 180, h: 50, color: '#1e293b' },

      // Center arena structure (creates dynamic choke points and flanking routes)
      { x: 720, y: 340, w: 160, h: 40, color: '#334155' },
      { x: 720, y: 620, w: 160, h: 40, color: '#334155' },
      { x: 540, y: 460, w: 40, h: 80, color: '#334155' },
      { x: 1020, y: 460, w: 40, h: 80, color: '#334155' }
    ];

    // All solid AABB colliders combined
    this.walls = [...this.outerWalls, ...this.obstacles];

    // Circular Pinball Bumpers (trigger high-impulse knockback)
    this.bumpers = [
      { id: 'b1', x: 480, y: 480, radius: BUMPER_RADIUS, glow: '#ff0055' },
      { id: 'b2', x: 1120, y: 480, radius: BUMPER_RADIUS, glow: '#ff0055' },
      { id: 'b3', x: 800, y: 220, radius: BUMPER_RADIUS, glow: '#00f0ff' },
      { id: 'b4', x: 800, y: 760, radius: BUMPER_RADIUS, glow: '#00f0ff' }
    ];

    // 10 Balanced Player Spawn Locations
    this.spawnPoints = [
      { x: 180, y: 160 },
      { x: 1420, y: 160 },
      { x: 180, y: 840 },
      { x: 1420, y: 840 },
      { x: 800, y: 480 },
      { x: 340, y: 480 },
      { x: 1260, y: 480 },
      { x: 580, y: 220 },
      { x: 1020, y: 220 },
      { x: 800, y: 900 }
    ];

    // 4 Fixed Power-Up Pod Stations
    this.powerUpPods = [
      { id: 'pod-north', x: 800, y: 100 },
      { id: 'pod-south', x: 800, y: 900 },
      { id: 'pod-west', x: 120, y: 500 },
      { id: 'pod-east', x: 1480, y: 500 }
    ];
  }

  // Returns true if a circle at (x, y) with radius r intersects any solid wall or bumper
  isSolidCollision(x, y, radius = PLAYER_RADIUS) {
    // Check perimeter & obstacles
    for (const wall of this.walls) {
      if (this.circleIntersectsAABB(x, y, radius, wall)) {
        return true;
      }
    }
    // Check bumpers
    for (const b of this.bumpers) {
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy < (radius + b.radius) * (radius + b.radius)) {
        return true;
      }
    }
    return false;
  }

  // Circle vs Axis-Aligned Bounding Box (AABB) intersection check
  circleIntersectsAABB(cx, cy, r, box) {
    const closestX = Math.max(box.x, Math.min(cx, box.x + box.w));
    const closestY = Math.max(box.y, Math.min(cy, box.y + box.h));
    const distX = cx - closestX;
    const distY = cy - closestY;
    return distX * distX + distY * distY < r * r;
  }

  // Resolves collision of a player circle against all arena walls with smooth sliding
  resolveWallCollisions(player) {
    const r = player.radius || PLAYER_RADIUS;

    // Hard arena boundary clamp
    if (player.x - r < this.wallThickness) player.x = this.wallThickness + r;
    if (player.x + r > this.width - this.wallThickness) player.x = this.width - this.wallThickness - r;
    if (player.y - r < this.wallThickness) player.y = this.wallThickness + r;
    if (player.y + r > this.height - this.wallThickness) player.y = this.height - this.wallThickness - r;

    // Check each interior obstacle
    for (const wall of this.obstacles) {
      const closestX = Math.max(wall.x, Math.min(player.x, wall.x + wall.w));
      const closestY = Math.max(wall.y, Math.min(player.y, wall.y + wall.h));
      const dx = player.x - closestX;
      const dy = player.y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < r * r && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = r - dist;
        // Push out along normal
        player.x += (dx / dist) * overlap;
        player.y += (dy / dist) * overlap;

        // Cancel velocity into wall
        const normalX = dx / dist;
        const normalY = dy / dist;
        const dot = player.vx * normalX + player.vy * normalY;
        if (dot < 0) {
          player.vx -= dot * normalX;
          player.vy -= dot * normalY;
        }
      }
    }
  }

  // Generates a random walkable position not inside any wall, obstacle, or bumper
  getRandomWalkablePosition(margin = 80, radius = 20) {
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      const x = Math.floor(margin + Math.random() * (this.width - margin * 2));
      const y = Math.floor(margin + Math.random() * (this.height - margin * 2));
      if (!this.isSolidCollision(x, y, radius + 15)) {
        return { x, y };
      }
    }
    // Fallback safe center
    return { x: 800, y: 500 };
  }

  getSpawnPoint(index) {
    const sp = this.spawnPoints[index % this.spawnPoints.length];
    return { x: sp.x, y: sp.y };
  }
}

module.exports = Arena;
