// lib/ChaosManager.js - Server-Authoritative Chaos Events Engine

const {
  CHAOS_INTERVAL_MS,
  CHAOS_DURATION_MS,
  CHAOS_EVENTS,
  CHAOS_DESCRIPTIONS
} = require('./Constants');

class ChaosManager {
  constructor(arena) {
    this.arena = arena;
    this.eventList = Object.values(CHAOS_EVENTS);
    this.activeEvent = null;
    this.eventEndTime = 0;
    this.nextEventTime = 0;
    this.lastEvent = null;

    // Shrinking zone bounds when active
    this.safeZone = {
      active: false,
      minX: 0,
      maxX: arena.width,
      minY: 0,
      maxY: arena.height
    };

    // Tracking shrink damage cooldown per player
    this.shrinkDamageCooldowns = {};
  }

  // Starts the chaos scheduler when match starts
  start(matchStartTime) {
    this.activeEvent = null;
    this.eventEndTime = 0;
    this.nextEventTime = matchStartTime + CHAOS_INTERVAL_MS;
    this.lastEvent = null;
    this.resetSafeZone();
  }

  reset() {
    this.activeEvent = null;
    this.eventEndTime = 0;
    this.nextEventTime = 0;
    this.lastEvent = null;
    this.resetSafeZone();
  }

  resetSafeZone() {
    this.safeZone = {
      active: false,
      minX: 0,
      maxX: this.arena.width,
      minY: 0,
      maxY: this.arena.height
    };
    this.shrinkDamageCooldowns = {};
  }

  update(dt, players, now) {
    const events = [];

    // 1. If an event is currently active, check if it has expired
    if (this.activeEvent) {
      if (now >= this.eventEndTime) {
        const expiredType = this.activeEvent;
        this.activeEvent = null;
        this.resetSafeZone();
        // Schedule next event
        this.nextEventTime = now + CHAOS_INTERVAL_MS;

        events.push({
          event: 'CHAOS_ENDED',
          type: expiredType
        });
      } else {
        // If SHRINKING_ZONE is active, handle players outside bounds
        if (this.activeEvent === CHAOS_EVENTS.SHRINKING_ZONE) {
          this.processShrinkingZone(players, now, events);
        }
      }
    } else {
      // 2. Check if it's time to trigger a new event
      if (this.nextEventTime > 0 && now >= this.nextEventTime) {
        // Pick an event that is not the same as the last one
        const candidates = this.eventList.filter(e => e !== this.lastEvent);
        const selected = candidates[Math.floor(Math.random() * candidates.length)];

        this.activeEvent = selected;
        this.lastEvent = selected;
        this.eventEndTime = now + CHAOS_DURATION_MS;

        // Initialize event-specific mechanics
        if (selected === CHAOS_EVENTS.SHRINKING_ZONE) {
          // Safe zone contracts by 30% from each side
          const marginX = this.arena.width * 0.22;
          const marginY = this.arena.height * 0.22;
          this.safeZone = {
            active: true,
            minX: marginX,
            maxX: this.arena.width - marginX,
            minY: marginY,
            maxY: this.arena.height - marginY
          };
        }

        const info = CHAOS_DESCRIPTIONS[selected];

        events.push({
          event: 'CHAOS_STARTED',
          type: selected,
          title: info.title,
          desc: info.desc,
          durationMs: CHAOS_DURATION_MS,
          endTime: this.eventEndTime
        });
      }
    }

    return events;
  }

  // Applies damage / pushback to players standing outside the shrinking safe zone
  processShrinkingZone(players, now, events) {
    const sz = this.safeZone;
    for (const player of players) {
      const isOutside =
        player.x < sz.minX ||
        player.x > sz.maxX ||
        player.y < sz.minY ||
        player.y > sz.maxY;

      if (isOutside) {
        const lastHit = this.shrinkDamageCooldowns[player.id] || 0;
        // Apply zone penalty once every 1 second
        if (now - lastHit >= 1000) {
          this.shrinkDamageCooldowns[player.id] = now;

          // Push slightly toward center
          const centerX = this.arena.width / 2;
          const centerY = this.arena.height / 2;
          const dx = centerX - player.x;
          const dy = centerY - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          player.vx += (dx / dist) * 150;
          player.vy += (dy / dist) * 150;

          // Shield protects, otherwise lose 3 points
          if (player.hasShield()) {
            player.powerUps.shieldActive = false;
            events.push({
              event: 'ZONE_DAMAGE',
              playerId: player.id,
              shieldAbsorbed: true,
              pointsLost: 0
            });
          } else {
            const lost = Math.min(player.score, 3);
            player.score = Math.max(0, player.score - lost);
            events.push({
              event: 'ZONE_DAMAGE',
              playerId: player.id,
              shieldAbsorbed: false,
              pointsLost: lost
            });
          }
        }
      }
    }
  }

  serialize(now) {
    return {
      activeEvent: this.activeEvent,
      remainingSec: this.activeEvent ? Math.max(0, Math.ceil((this.eventEndTime - now) / 1000)) : 0,
      nextEventInSec: !this.activeEvent && this.nextEventTime > 0 ? Math.max(0, Math.ceil((this.nextEventTime - now) / 1000)) : 0,
      safeZone: this.activeEvent === CHAOS_EVENTS.SHRINKING_ZONE ? this.safeZone : null
    };
  }
}

module.exports = ChaosManager;
