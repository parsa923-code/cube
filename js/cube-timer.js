/**
 * Cube timer with keyboard + touch/pointer support (WCA-style inspection).
 * Space or hold on timer area → release to start · press/tap to stop · Esc to reset.
 */
window.CubeTimerCore = class CubeTimerCore {
  constructor(opts) {
    this.digits = opts.digits;
    this.deck = opts.deck;
    this.pill = opts.pill;
    this.onStart = opts.onStart || (() => {});
    this.onFinish = opts.onFinish || (() => {});
    this.isLocked = opts.isLocked || (() => false);
    this.inspection = false;
    this.state = 'idle';
    this._t0 = 0;
    this._i0 = 0;
    this._insp = 0;
    this._holdT = null;
    this._raf = 0;
    this._pendingForced = null;
    this._pointerDown = false;
    this._activePointerId = null;

    document.addEventListener('keydown', e => this._keyDown(e));
    document.addEventListener('keyup', e => this._keyUp(e));

    if (this.deck) {
      this.deck.addEventListener('pointerdown', e => this._pointerDownHandler(e));
      this.deck.addEventListener('pointerup', e => this._pointerUpHandler(e));
      this.deck.addEventListener('pointercancel', e => this._pointerUpHandler(e));
      this.deck.addEventListener('lostpointercapture', e => this._pointerUpHandler(e));
      // Prevent context menu / long-press selection on the timer area
      this.deck.addEventListener('contextmenu', e => e.preventDefault());
    }

    this._render();
  }

  _isInteractiveTarget(t) {
    if (!t || typeof t.closest !== 'function') return false;
    try {
      return !!(
        t.closest('input, textarea, button, a, select, label, [contenteditable="true"]') ||
        t.isContentEditable
      );
    } catch (_) {
      return false;
    }
  }

  _pointerDownHandler(e) {
    if (e.button != null && e.button !== 0) return;
    if (this._isInteractiveTarget(e.target)) return;
    if (this.isLocked()) return;
    e.preventDefault();
    try {
      this.deck.setPointerCapture(e.pointerId);
    } catch (_) {}
    this._pointerDown = true;
    this._activePointerId = e.pointerId;
    this._press();
  }

  _pointerUpHandler(e) {
    if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;
    if (!this._pointerDown) return;
    this._pointerDown = false;
    this._activePointerId = null;
    try {
      this.deck.releasePointerCapture(e.pointerId);
    } catch (_) {}
    this._release();
  }

  _render() {
    this.deck.dataset.state = this.state;
    const labels = {
      idle: 'Ready',
      inspection: 'Inspection',
      hold: 'Hold…',
      ready: 'Release',
      running: 'Solving',
      stopped: 'Stopped'
    };
    if (this.state === 'inspection' && this._insp >= 15000) {
      this.pill.textContent = 'Inspection +2';
    } else {
      this.pill.textContent = labels[this.state] || this.state;
    }
  }

  setInspection(on) {
    this.inspection = !!on;
    if (this.state !== 'idle' && this.state !== 'stopped') this.reset();
  }

  _keyDown(e) {
    if (e.code === 'Escape') {
      this.reset();
      return;
    }
    if (e.code !== 'Space') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.isLocked()) return;
    e.preventDefault();
    if (e.repeat) return;
    this._press();
  }

  _keyUp(e) {
    if (e.code === 'Space' && !e.repeat) this._release();
  }

  _press() {
    if (this.isLocked()) return;
    switch (this.state) {
      case 'running': {
        const el = performance.now() - this._t0;
        if (el < 100) return;
        this._finish(el);
        break;
      }
      case 'idle':
      case 'stopped':
        if (this.inspection) this._toInspection();
        else this._toHold();
        break;
      case 'inspection':
        this._toHold();
        break;
      default:
        break;
    }
  }

  _release() {
    if (this.state === 'hold' || this.state === 'ready') this._go();
  }

  _toInspection() {
    this._setState('inspection');
    this._i0 = performance.now();
    this._insp = 0;
    this._loop();
  }

  _toHold() {
    this._setState('hold');
    // keep showing remaining inspection time if we came from inspection
    if (!this.inspection || this._insp === 0) {
      this.digits.textContent = '0.00';
    }
    clearTimeout(this._holdT);
    this._holdT = setTimeout(() => {
      if (this.state === 'hold') this._setState('ready');
    }, 500);
  }

  _go() {
    clearTimeout(this._holdT);
    const inspMs = this._insp;
    let forced = null;
    if (this.inspection && inspMs > 15000) {
      forced = inspMs > 17000 ? 'dnf' : '+2';
    }
    if (forced === 'dnf') {
      this._finish(0, forced);
      return;
    }
    this._setState('running');
    this._t0 = performance.now();
    this.onStart();
    this._loop();
    this._pendingForced = forced;
  }

  _finish(rawMs, forcedOverride) {
    cancelAnimationFrame(this._raf);
    const forced = forcedOverride || this._pendingForced || null;
    this._pendingForced = null;
    this._setState('stopped');
    this.digits.style.color = '';
    this.digits.textContent = forced === 'dnf' ? 'DNF' : fmtMs(rawMs);
    this.onFinish({ rawMs, inspectionMs: this._insp, forced });
    this._insp = 0;
  }

  reset() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._holdT);
    this._pendingForced = null;
    this._insp = 0;
    this._pointerDown = false;
    this._activePointerId = null;
    this._setState('idle');
    this.digits.style.color = '';
    this.digits.textContent = '0.00';
  }

  _setState(s) {
    this.state = s;
    this._render();
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      if (this.state === 'running') {
        this.digits.textContent = fmtMs(performance.now() - this._t0);
        this._raf = requestAnimationFrame(step);
      } else if (this.state === 'inspection' || this.state === 'hold' || this.state === 'ready') {
        // keep inspection clock running even while holding
        if (this.inspection && this._i0) {
          this._insp = performance.now() - this._i0;
          const remaining = Math.max(0, Math.ceil((15000 - this._insp) / 1000));
          if (this._insp >= 17000) {
            this._finish(0, 'dnf');
            return;
          }
          // Visual warning as the +2 threshold approaches, and a stronger
          // warning once past it, so a DNF never lands without notice (bug 1.3).
          if (this._insp >= 15000) {
            this.digits.style.color = 'var(--bad)';
          } else {
            this.digits.style.color = '';
          }
          // show remaining seconds during pure inspection; during hold/ready show 0.00 or remaining
          if (this.state === 'inspection') {
            this.digits.textContent = String(remaining);
          }
          this._render();
        }
        this._raf = requestAnimationFrame(step);
      }
    };
    this._raf = requestAnimationFrame(step);
  }
};
