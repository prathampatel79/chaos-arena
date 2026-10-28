// public/js/renderer.js - High Performance 2D Canvas Arcade Renderer

class ArenaRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    // World Arena Bounds
    this.worldWidth = 1600;
    this.worldHeight = 1000;

    // Viewport & Camera
    this.camera = { x: 800, y: 500, scale: 1 };
    this.dpr = window.devicePixelRatio || 1;

    // Particles & FX
    this.particles = [];
    this.floatingTexts = [];
    this.bumperFlashes = {}; // bumperId -> flashTimer

    // Animation Ticks
    this.animTime = 0;

    // Resize handler
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.viewWidth = w;
    this.viewHeight = h;
  }

  // Camera update: Smoothly follow local player or center whole arena if desktop fits
  updateCamera(localPlayer) {
    // If screen is large enough, scale to view entire arena comfortably
    const scaleX = this.viewWidth / this.worldWidth;
    const scaleY = this.viewHeight / this.worldHeight;
    const fitScale = Math.min(scaleX, scaleY);

    if (this.viewWidth >= 1200 && this.viewHeight >= 800) {
      // Wide desktop: Fit entire arena centered
      this.camera.scale = Math.min(1.0, fitScale * 0.96);
      this.camera.x = this.worldWidth / 2;
      this.camera.y = this.worldHeight / 2;
    } else {
      // Mobile / Laptop: Dynamic follow local player with responsive zoom
      this.camera.scale = Math.max(0.75, Math.min(1.15, fitScale * 1.5));
      if (localPlayer) {
        // Lerp towards player position
        this.camera.x += (localPlayer.x - this.camera.x) * 0.12;
        this.camera.y += (localPlayer.y - this.camera.y) * 0.12;
      } else {
        this.camera.x = this.worldWidth / 2;
        this.camera.y = this.worldHeight / 2;
      }

      // Clamp camera so view stays within arena margins
      const halfW = (this.viewWidth / (2 * this.camera.scale));
      const halfH = (this.viewHeight / (2 * this.camera.scale));
      this.camera.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.camera.x));
      this.camera.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.camera.y));
    }
  }

  // Spawn visual particle burst
  addParticleBurst(x, y, color = '#ffe600', count = 12, speed = 120) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (Math.random() * 0.7 + 0.3) * speed;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: Math.random() * 3 + 2,
        color: color,
        alpha: 1.0,
        decay: Math.random() * 1.5 + 1.2
      });
    }
  }

  // Floating text (+10, 2X!, SHIELD!)
  addFloatingText(x, y, text, color = '#ffe600', size = 18) {
    this.floatingTexts.push({
      x: x,
      y: y - 10,
      text: text,
      color: color,
      size: size,
      alpha: 1.0,
      vy: -50,
      duration: 0.9
    });
  }

  triggerBumperFlash(bumperId) {
    this.bumperFlashes[bumperId] = 0.35; // 350ms flash duration
  }

  // Main Render Frame
  render(gameState, localPlayerId, dt) {
    this.animTime += dt;
    const ctx = this.ctx;
    const dpr = this.dpr;

    // Clear Screen
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!gameState) return;

    // Find local player
    const localPlayer = gameState.players ? gameState.players.find(p => p.id === localPlayerId) : null;
    this.updateCamera(localPlayer);

    // Apply Camera Transform
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
    ctx.scale(this.camera.scale, this.camera.scale);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Arena Floor & Grid
    this.drawArenaFloor(ctx);

    // 2. Draw Shrinking Safe Zone (if active)
    if (gameState.chaos && gameState.chaos.safeZone && gameState.chaos.safeZone.active) {
      this.drawShrinkingZone(ctx, gameState.chaos.safeZone);
    }

    // 3. Draw Obstacles & Walls
    this.drawArenaWalls(ctx);

    // 4. Draw Bumpers
    if (gameState.hazards && gameState.hazards.bumpers) {
      this.drawBumpers(ctx, gameState.hazards.bumpers, dt);
    }

    // 5. Draw Power-Up Pod Stations
    if (gameState.powerUps) {
      this.drawPowerUps(ctx, gameState.powerUps);
    }

    // 6. Draw Moving Hazards
    if (gameState.hazards && gameState.hazards.hazards) {
      this.drawHazards(ctx, gameState.hazards.hazards);
    }

    // 7. Draw Coins
    if (gameState.coins) {
      this.drawCoins(ctx, gameState.coins);
    }

    // 8. Draw Players
    if (gameState.players) {
      this.drawPlayers(ctx, gameState.players, localPlayerId);
    }

    // 9. Update & Draw Particles & Floating Text FX
    this.drawEffects(ctx, dt);

    ctx.restore();
  }

  drawArenaFloor(ctx) {
    // Floor Base
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // Grid pattern
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const gridSize = 80;
    for (let x = 0; x <= this.worldWidth; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.worldHeight);
    }
    for (let y = 0; y <= this.worldHeight; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.worldWidth, y);
    }
    ctx.stroke();

    // Center Arena Cyber Ring
    ctx.beginPath();
    ctx.arc(this.worldWidth / 2, this.worldHeight / 2, 180, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawShrinkingZone(ctx, sz) {
    ctx.save();
    // Danger perimeter outside safe zone
    ctx.fillStyle = 'rgba(255, 0, 77, 0.2)';
    // Top danger
    ctx.fillRect(0, 0, this.worldWidth, sz.minY);
    // Bottom danger
    ctx.fillRect(0, sz.maxY, this.worldWidth, this.worldHeight - sz.maxY);
    // Left danger
    ctx.fillRect(0, sz.minY, sz.minX, sz.maxY - sz.minY);
    // Right danger
    ctx.fillRect(sz.maxX, sz.minY, this.worldWidth - sz.maxX, sz.maxY - sz.minY);

    // Flashing danger border line
    ctx.strokeStyle = '#ff004d';
    ctx.lineWidth = 3 + Math.sin(this.animTime * 8) * 1.5;
    ctx.strokeRect(sz.minX, sz.minY, sz.maxX - sz.minX, sz.maxY - sz.minY);
    ctx.restore();
  }

  drawArenaWalls(ctx) {
    ctx.save();
    // Outer perimeter neon glow
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 15;
    ctx.strokeRect(16, 16, this.worldWidth - 32, this.worldHeight - 32);

    ctx.shadowBlur = 0;

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

    for (const ob of obstacles) {
      // Barrier Body
      ctx.fillStyle = '#162035';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 2;
      this.roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 8);
      ctx.fill();
      ctx.stroke();

      // Neon interior accent
      ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.fillRect(ob.x + 6, ob.y + 6, ob.w - 12, ob.h - 12);
    }
    ctx.restore();
  }

  drawBumpers(ctx, bumpers, dt) {
    for (const b of bumpers) {
      // Update flash timer
      if (this.bumperFlashes[b.id]) {
        this.bumperFlashes[b.id] -= dt;
        if (this.bumperFlashes[b.id] <= 0) delete this.bumperFlashes[b.id];
      }

      const isFlashing = Boolean(this.bumperFlashes[b.id]);
      const glowColor = isFlashing ? '#ffffff' : (b.glow || '#ff0055');

      ctx.save();
      // Outer ripple ring
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + (isFlashing ? 8 : 4), 0, Math.PI * 2);
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 3;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = isFlashing ? 25 : 12;
      ctx.stroke();

      // Inner Bumper Body
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = isFlashing ? '#ff3388' : '#1a1028';
      ctx.fill();

      // Center Pin Core
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();

      ctx.restore();
    }
  }

  drawPowerUps(ctx, pods) {
    for (const pod of pods) {
      ctx.save();
      // Station Pedestal Base
      ctx.beginPath();
      ctx.arc(pod.x, pod.y, pod.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = pod.active ? 'rgba(0, 240, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(10, 15, 30, 0.6)';
      ctx.fill();
      ctx.stroke();

      if (pod.active) {
        // Floating animated bob
        const bob = Math.sin(this.animTime * 4 + pod.x) * 4;
        const iconY = pod.y + bob;

        // Glowing aura
        let auraColor = '#00f0ff';
        let iconSymbol = '⚡';
        if (pod.type === 'SHIELD') { auraColor = '#38b6ff'; iconSymbol = '🛡️'; }
        else if (pod.type === 'MAGNET') { auraColor = '#ff007f'; iconSymbol = '🧲'; }
        else if (pod.type === 'DOUBLE') { auraColor = '#ffe600'; iconSymbol = '⭐'; }

        ctx.shadowColor = auraColor;
        ctx.shadowBlur = 18;

        // Power-Up Orb
        ctx.beginPath();
        ctx.arc(pod.x, iconY, pod.radius, 0, Math.PI * 2);
        ctx.fillStyle = auraColor;
        ctx.fill();

        // Icon Emoji/Symbol
        ctx.shadowBlur = 0;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconSymbol, pod.x, iconY);
      }
      ctx.restore();
    }
  }

  drawHazards(ctx, hazards) {
    for (const h of hazards) {
      ctx.save();
      // Warning Laser Path
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 0, 77, 0.15)';
      ctx.lineWidth = 2;
      if (h.axis === 'x') {
        ctx.moveTo(300, h.y);
        ctx.lineTo(1300, h.y);
      } else {
        ctx.moveTo(h.x, 260);
        ctx.lineTo(h.x, 740);
      }
      ctx.stroke();

      // Spinning Hazard Drone / Blade
      const spinAngle = this.animTime * 8 * (h.direction || 1);
      ctx.translate(h.x, h.y);
      ctx.rotate(spinAngle);

      // Hazard Glow
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 20;

      // 4-point sawblade teeth
      ctx.fillStyle = '#ff0044';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.lineTo(Math.cos(a) * h.radius, Math.sin(a) * h.radius);
        ctx.lineTo(Math.cos(a + 0.38) * (h.radius * 0.45), Math.sin(a + 0.38) * (h.radius * 0.45));
      }
      ctx.closePath();
      ctx.fill();

      // Center Core
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    }
  }

  drawCoins(ctx, coins) {
    for (const coin of coins) {
      ctx.save();
      const r = coin.radius;
      const isGiant = coin.isGiant;

      // Pulse twinkle
      const pulse = Math.sin(this.animTime * 6 + coin.id) * 1.5;

      ctx.shadowColor = isGiant ? '#ff007f' : '#ffe600';
      ctx.shadowBlur = isGiant ? 22 : 12;

      // Outer coin rim
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, r + (isGiant ? pulse : 0), 0, Math.PI * 2);
      ctx.fillStyle = isGiant ? '#ff007f' : '#ffe600';
      ctx.fill();

      // Inner coin face
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, r * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = isGiant ? '#ffe600' : '#ff9900';
      ctx.fill();

      // Inner Star badge
      ctx.fillStyle = '#ffffff';
      ctx.font = isGiant ? '18px Orbitron, sans-serif' : '9px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isGiant ? '★' : '$', coin.x, coin.y + (isGiant ? 1 : 0.5));

      ctx.restore();
    }
  }

  drawPlayers(ctx, players, localPlayerId) {
    // Sort players by score to identify leader
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const leaderId = sorted.length > 0 && sorted[0].score > 0 ? sorted[0].id : null;

    for (const p of players) {
      ctx.save();
      const isLocal = p.id === localPlayerId;
      const hexColor = (p.color && p.color.hex) || '#00f0ff';

      // 1. Dash / Speed Trail Particles (when speed boosted)
      if (p.powerUps && p.powerUps.speed > 0) {
        if (Math.random() < 0.35) {
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 14,
            y: p.y + (Math.random() - 0.5) * 14,
            vx: -p.vx * 0.3,
            vy: -p.vy * 0.3,
            radius: Math.random() * 4 + 2,
            color: '#00f0ff',
            alpha: 0.8,
            decay: 2.5
          });
        }
      }

      // 2. Shield Forcefield Bubble (when shielded)
      if (p.powerUps && p.powerUps.shield) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#38b6ff';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(56, 182, 255, 0.2)';
        ctx.shadowColor = '#38b6ff';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.stroke();
      }

      // 3. Player Base Body Circle
      ctx.shadowColor = hexColor;
      ctx.shadowBlur = isLocal ? 18 : 10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = hexColor;
      ctx.fill();

      // Border Outline
      ctx.strokeStyle = isLocal ? '#ffffff' : (p.color && p.color.border) || '#ffffff';
      ctx.lineWidth = isLocal ? 3.5 : 2;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // 4. Character Eyes (Follow facing angle)
      const angle = p.angle || 0;
      const eyeDist = 9;
      const eyeForward = 8;
      const eyeRadius = 3.5;

      const rightAngle = angle + Math.PI / 2;
      const eye1X = p.x + Math.cos(angle) * eyeForward + Math.cos(rightAngle) * eyeDist;
      const eye1Y = p.y + Math.sin(angle) * eyeForward + Math.sin(rightAngle) * eyeDist;

      const eye2X = p.x + Math.cos(angle) * eyeForward - Math.cos(rightAngle) * eyeDist;
      const eye2Y = p.y + Math.sin(angle) * eyeForward - Math.sin(rightAngle) * eyeDist;

      // White eye sclera
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
      ctx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Black pupils
      ctx.fillStyle = '#0a0e1a';
      const pupilShift = 1.2;
      ctx.beginPath();
      ctx.arc(eye1X + Math.cos(angle) * pupilShift, eye1Y + Math.sin(angle) * pupilShift, eyeRadius * 0.55, 0, Math.PI * 2);
      ctx.arc(eye2X + Math.cos(angle) * pupilShift, eye2Y + Math.sin(angle) * pupilShift, eyeRadius * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // 5. Stun Stars Effect (if stunned)
      if (p.isStunned) {
        const starAngle = this.animTime * 10;
        ctx.fillStyle = '#ffe600';
        ctx.font = '14px sans-serif';
        ctx.fillText('💫', p.x + Math.cos(starAngle) * 20, p.y - 15 + Math.sin(starAngle) * 8);
      }

      // 6. Leader Crown 👑 (if 1st place)
      if (p.id === leaderId) {
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', p.x, p.y - p.radius - 16);
      }

      // 7. Player Name Tag
      ctx.font = 'bold 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // Background tag pill
      const nameText = isLocal ? `★ ${p.name} (YOU)` : p.name;
      const textWidth = ctx.measureText(nameText).width;

      ctx.fillStyle = 'rgba(7, 10, 18, 0.85)';
      this.roundRect(ctx, p.x - textWidth / 2 - 6, p.y - p.radius - 16, textWidth + 12, 16, 4);
      ctx.fill();

      ctx.fillStyle = isLocal ? '#00f0ff' : '#ffffff';
      ctx.fillText(nameText, p.x, p.y - p.radius - 2);

      ctx.restore();
    }
  }

  drawEffects(ctx, dt) {
    // 1. Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.alpha -= pt.decay * dt;

      if (pt.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.shadowColor = pt.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

    // 2. Floating Text Popups (+10, 2X!, SHIELD!)
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= dt / ft.duration;

      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = `bold ${ft.size}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  // Rounded rectangle helper
  roundRect(ctx, x, y, width, height, radius = 6) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

window.ArenaRenderer = ArenaRenderer;
