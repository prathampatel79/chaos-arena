// public/js/joystick.js - Mobile Touch Virtual Joystick

class VirtualJoystick {
  constructor(zoneElementId, baseElementId, thumbElementId) {
    this.zone = document.getElementById(zoneElementId);
    this.base = document.getElementById(baseElementId);
    this.thumb = document.getElementById(thumbElementId);

    this.activeTouchId = null;
    this.baseCenter = { x: 0, y: 0 };
    this.maxRadius = 45; // max thumb movement distance
    this.vector = { dx: 0, dy: 0 };
    this.isActive = false;

    this.onMoveCallback = null;

    if (this.zone && this.base && this.thumb) {
      this.initEvents();
    }
  }

  initEvents() {
    // Touch start
    this.zone.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    // Touch move
    window.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    // Touch end / cancel
    window.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    window.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });

    // Auto display mobile controls if touch capability is detected
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      const controlsWrapper = document.getElementById('mobile-controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'block';
    }
  }

  handleTouchStart(e) {
    if (this.activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.activeTouchId = touch.identifier;
    this.isActive = true;

    // Calculate base center relative to viewport
    const rect = this.base.getBoundingClientRect();
    this.baseCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    this.updateThumb(touch.clientX, touch.clientY);
    e.preventDefault();
  }

  handleTouchMove(e) {
    if (!this.isActive) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.activeTouchId) {
        this.updateThumb(touch.clientX, touch.clientY);
        e.preventDefault();
        break;
      }
    }
  }

  handleTouchEnd(e) {
    if (!this.isActive) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.activeTouchId) {
        this.reset();
        e.preventDefault();
        break;
      }
    }
  }

  updateThumb(clientX, clientY) {
    const rawDx = clientX - this.baseCenter.x;
    const rawDy = clientY - this.baseCenter.y;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    let normX = 0;
    let normY = 0;
    let thumbX = rawDx;
    let thumbY = rawDy;

    if (dist > 0.001) {
      normX = rawDx / dist;
      normY = rawDy / dist;

      if (dist > this.maxRadius) {
        thumbX = normX * this.maxRadius;
        thumbY = normY * this.maxRadius;
      }
    }

    // Normalized 0 to 1 vector
    const intensity = Math.min(dist / this.maxRadius, 1.0);
    this.vector = {
      dx: normX * intensity,
      dy: normY * intensity
    };

    // Update thumb CSS
    this.thumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;

    if (typeof this.onMoveCallback === 'function') {
      this.onMoveCallback(this.vector);
    }
  }

  reset() {
    this.activeTouchId = null;
    this.isActive = false;
    this.vector = { dx: 0, dy: 0 };
    this.thumb.style.transform = 'translate(0px, 0px)';

    if (typeof this.onMoveCallback === 'function') {
      this.onMoveCallback(this.vector);
    }
  }

  getVector() {
    return this.vector;
  }
}

window.VirtualJoystick = VirtualJoystick;
