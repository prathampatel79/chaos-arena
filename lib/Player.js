// lib/Player.js - Server-Authoritative Player State and Movement

const {
  PLAYER_RADIUS,
  BASE_SPEED,
  SPEED_BOOST_MULTIPLIER,
  SPEED_FRENZY_MULTIPLIER,
  NORMAL_FRICTION,
  SLIPPERY_FRICTION,
  STUN_DURATION_MS,
  POWERUP_TYPES
} = require('./Constants');

class Player {
  constructor(id, name, color, spawnPos) {
    this.id = id;
    this.name = name.trim().slice(0, 16);
    this.color = color; // { name, hex, border }
    this.radius = PLAYER_RADIUS;

    this.x = spawnPos.x;
    this.y = spawnPos.y;
    this.vx = 0;
    this.vy = 0;
    this.facingAngle = 0;

    // Input state
    this.inputX = 0;
    this.inputY = 0;

    // Gameplay metrics
    this.score = 0;
    this.coinsCollected = 0;
    this.powerupsCollected = 0;
    this.hazardsHit = 0;

    // Power-Up States & Expiration Timestamps
    this.powerUps = {
      speedUntil: 0,
      shieldActive: false,
      magnetUntil: 0,
      doubleScoreUntil: 0
    };

    // Stun state
    this.stunnedUntil = 0;
    this.isReady = false;
    this.lastInputTime = Date.now();
  }

  // Accepts client input vector and normalizes it to prevent diagonal speed exploits
  setInput(dx, dy, reverseControls = false) {
    if (this.isStunned()) {
      this.inputX = 0;
      this.inputY = 0;
      return;
    }

    let ix = Number(dx) || 0;
    let iy = Number(dy) || 0;

    // Clamp input components
    ix = Math.max(-1, Math.min(1, ix));
    iy = Math.max(-1, Math.min(1, iy));

    // Normalize diagonal magnitude
    const mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    if (reverseControls) {
      ix = -ix;
      iy = -iy;
    }

    this.inputX = ix;
    this.inputY = iy;
    this.lastInputTime = Date.now();

    if (ix !== 0 || iy !== 0) {
      this.facingAngle = Math.atan2(iy, ix);
    }
  }

  isStunned() {
    return Date.now() < this.stunnedUntil;
  }

  hasSpeedBoost() {
    return Date.now() < this.powerUps.speedUntil;
  }

  hasShield() {
    return this.powerUps.shieldActive;
  }

  hasMagnet() {
    return Date.now() < this.powerUps.magnetUntil;
  }

  hasDoubleScore() {
    return Date.now() < this.powerUps.doubleScoreUntil;
  }

  applyPowerUp(type, durationMs) {
    this.powerupsCollected++;
    const now = Date.now();

    switch (type) {
      case POWERUP_TYPES.SPEED:
        this.powerUps.speedUntil = now + durationMs;
        break;
      case POWERUP_TYPES.SHIELD:
        this.powerUps.shieldActive = true;
        break;
      case POWERUP_TYPES.MAGNET:
        this.powerUps.magnetUntil = now + durationMs;
        break;
      case POWERUP_TYPES.DOUBLE:
        this.powerUps.doubleScoreUntil = now + durationMs;
        break;
    }
  }

  // Stun / Hazard Hit handling
  takeHazardHit(impulseX, impulseY, pointsToLose) {
    this.hazardsHit++;

    // If shielded, absorb hit completely and consume shield
    if (this.powerUps.shieldActive) {
      this.powerUps.shieldActive = false;
      // Slight push back only, no stun, no point deduction
      this.vx = impulseX * 0.4;
      this.vy = impulseY * 0.4;
      return { absorbed: true };
    }

    // Apply knockback impulse & stun
    this.vx = impulseX;
    this.vy = impulseY;
    this.stunnedUntil = Date.now() + STUN_DURATION_MS;

    const lost = Math.min(this.score, pointsToLose);
    this.score = Math.max(0, this.score - lost);

    return { absorbed: false, pointsLost: lost };
  }

  // Physics integration tick
  updatePhysics(dt, isSlippery = false, isSpeedFrenzy = false) {
    const now = Date.now();

    // Calculate effective speed
    let speed = BASE_SPEED;
    if (this.hasSpeedBoost()) {
      speed *= SPEED_BOOST_MULTIPLIER;
    }
    if (isSpeedFrenzy) {
      speed *= SPEED_FRENZY_MULTIPLIER;
    }

    if (this.isStunned()) {
      // Damping during stun
      this.vx *= 0.88;
      this.vy *= 0.88;
    } else if (isSlippery) {
      // Low friction ice physics: accelerates continuously, high momentum
      const accel = speed * 4 * dt;
      this.vx += this.inputX * accel;
      this.vy += this.inputY * accel;

      // Clamp max velocity
      const maxVel = speed * 1.35;
      const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (currentSpeed > maxVel) {
        this.vx = (this.vx / currentSpeed) * maxVel;
        this.vy = (this.vy / currentSpeed) * maxVel;
      }
      this.vx *= SLIPPERY_FRICTION;
      this.vy *= SLIPPERY_FRICTION;
    } else {
      // Normal responsive arcade physics
      if (this.inputX !== 0 || this.inputY !== 0) {
        this.vx = this.inputX * speed;
        this.vy = this.inputY * speed;
      } else {
        this.vx *= NORMAL_FRICTION;
        this.vy *= NORMAL_FRICTION;
        if (Math.abs(this.vx) < 1) this.vx = 0;
        if (Math.abs(this.vy) < 1) this.vy = 0;
      }
    }

    // Advance position
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  // Resets player state for a new round
  resetForNewRound(spawnPos) {
    this.x = spawnPos.x;
    this.y = spawnPos.y;
    this.vx = 0;
    this.vy = 0;
    this.inputX = 0;
    this.inputY = 0;
    this.score = 0;
    this.coinsCollected = 0;
    this.powerupsCollected = 0;
    this.hazardsHit = 0;
    this.powerUps = {
      speedUntil: 0,
      shieldActive: false,
      magnetUntil: 0,
      doubleScoreUntil: 0
    };
    this.stunnedUntil = 0;
  }

  // Compact payload for network transmission
  serialize() {
    const now = Date.now();
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      vx: Math.round(this.vx * 10) / 10,
      vy: Math.round(this.vy * 10) / 10,
      angle: Math.round(this.facingAngle * 100) / 100,
      score: this.score,
      isStunned: this.isStunned(),
      powerUps: {
        speed: this.hasSpeedBoost() ? Math.max(0, Math.ceil((this.powerUps.speedUntil - now) / 1000)) : 0,
        shield: this.hasShield(),
        magnet: this.hasMagnet() ? Math.max(0, Math.ceil((this.powerUps.magnetUntil - now) / 1000)) : 0,
        double: this.hasDoubleScore() ? Math.max(0, Math.ceil((this.powerUps.doubleScoreUntil - now) / 1000)) : 0
      }
    };
  }
}

module.exports = Player;
