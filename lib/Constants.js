// lib/Constants.js - Core Game Constants and Configuration

module.exports = {
  ARENA_WIDTH: 1600,
  ARENA_HEIGHT: 1000,
  TICK_RATE: 30, // 30 updates per second
  TICK_INTERVAL_MS: 1000 / 30,

  DEFAULT_MATCH_DURATION: 90, // 90 seconds per match
  MIN_PLAYERS_NORMAL: 4,
  MIN_PLAYERS_TEST: 2,
  MAX_PLAYERS: 10,

  // Player physics
  PLAYER_RADIUS: 22,
  BASE_SPEED: 280, // pixels per second
  SPEED_BOOST_MULTIPLIER: 1.6,
  SPEED_FRENZY_MULTIPLIER: 1.8,
  NORMAL_FRICTION: 0.80,
  SLIPPERY_FRICTION: 0.985,
  STUN_DURATION_MS: 600,

  // Coins
  MAX_NORMAL_COINS: 35,
  COIN_RADIUS: 11,
  GIANT_COIN_RADIUS: 22,
  COIN_VALUE: 10,
  GIANT_COIN_VALUE: 50,
  COIN_RESPAWN_DELAY_MS: 3000,
  MAGNET_RADIUS: 240,
  MAGNET_PULL_SPEED: 320,

  // Power-Ups
  POWERUP_RADIUS: 20,
  POWERUP_RESPAWN_DELAY_MS: 15000,
  POWERUP_TYPES: {
    SPEED: 'SPEED',
    SHIELD: 'SHIELD',
    MAGNET: 'MAGNET',
    DOUBLE: 'DOUBLE'
  },
  POWERUP_DURATIONS: {
    SPEED: 7000,    // 7 seconds
    SHIELD: 15000,  // 15 seconds (or until absorbed)
    MAGNET: 8000,   // 8 seconds
    DOUBLE: 10000   // 10 seconds
  },

  // Chaos Events
  CHAOS_INTERVAL_MS: 20000, // Every 20 seconds
  CHAOS_DURATION_MS: 10000, // Lasts 10 seconds
  CHAOS_EVENTS: {
    SLIPPERY_FLOOR: 'SLIPPERY_FLOOR',
    REVERSE_CONTROLS: 'REVERSE_CONTROLS',
    COIN_RUSH: 'COIN_RUSH',
    GIANT_COINS: 'GIANT_COINS',
    MOVING_HAZARDS: 'MOVING_HAZARDS',
    SHRINKING_ZONE: 'SHRINKING_ZONE',
    SPEED_FRENZY: 'SPEED_FRENZY'
  },
  CHAOS_DESCRIPTIONS: {
    SLIPPERY_FLOOR: { title: 'SLIPPERY FLOOR!', desc: 'Low friction! Drift and slide across the arena!' },
    REVERSE_CONTROLS: { title: 'REVERSE CONTROLS!', desc: 'Directional inputs inverted! Watch your step!' },
    COIN_RUSH: { title: 'COIN RUSH!', desc: 'Bonus golden coins flooded into the arena!' },
    GIANT_COINS: { title: 'GIANT COINS!', desc: 'Mega coins worth 50 points have appeared!' },
    MOVING_HAZARDS: { title: 'OVERDRIVE HAZARDS!', desc: 'Arena hazards are moving at double speed!' },
    SHRINKING_ZONE: { title: 'SHRINKING ZONE!', desc: 'Stay inside the safe perimeter or lose points!' },
    SPEED_FRENZY: { title: 'SPEED FRENZY!', desc: 'All players supercharged with nitro speed!' }
  },

  // Hazards
  HAZARD_RADIUS: 26,
  BUMPER_RADIUS: 32,
  BUMPER_FORCE: 600,
  HAZARD_PENALTY_POINTS: 5,

  // Player Color Palette (Distinct, readable against dark grid)
  PLAYER_COLORS: [
    { name: 'Cyan', hex: '#00F0FF', border: '#00B8CC' },
    { name: 'Pink', hex: '#FF007F', border: '#CC0066' },
    { name: 'Lime', hex: '#39FF14', border: '#2ECC11' },
    { name: 'Orange', hex: '#FF9900', border: '#CC7A00' },
    { name: 'Purple', hex: '#BD00FF', border: '#9400CC' },
    { name: 'Yellow', hex: '#FFE600', border: '#CCB800' },
    { name: 'Aquamarine', hex: '#00FFCC', border: '#00CCA3' },
    { name: 'Crimson', hex: '#FF3366', border: '#CC2952' },
    { name: 'Sky', hex: '#38B6FF', border: '#2B8FCC' },
    { name: 'Ghost White', hex: '#E2E8F0', border: '#94A3B8' }
  ]
};
