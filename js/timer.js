window.CubeTimer = class CubeTimer {
  constructor(o) {
    this.digits = o.digits;
    this.deck = o.deck;
    this.pill = o.pill;
    this.onStart = o.onStart || (() => {});
    this.onFinish = o.onFinish || (() => {});
    this.isLocked = o.isLocked || (() => false);
    this.inspection = false;
    this.state = 'idle';
    this._t0 = 0;
    this._i0 = 0;
    this._insp = 0;
    this._holdT = null;
    this._raf = 0;
    this._pendingForced = null;

    document.addEventListener('keydown', e => this._keyDown(e));
    document.addEventListener('keyup', e => this._keyUp(e));
    this.deck.addEventListener('touchstart', e => { e.preventDefault(); this._press(); }, { passive: false });
    this.deck.addEventListener('touchend', e => { e.preventDefault(); this._release(); }, { passive: false });
    this.deck.addEventListener('mousedown', e => { if (e.button === 0) this._press(); });
    document.addEventListener('mouseup', () => this._release());

    this._render();
  }

  _render() {
    this.deck.dataset.state = this.state;
    const label = {
      idle: 'IDLE', inspection: 'INSPECTION', hold: 'HOLD…',
      ready: 'READY', running: 'RUNNING', stopped: 'STOPPED'
    }[this.state] || this.state;
    this.pill.textContent = label;
  }

  setInspection(on) {
    this.inspection = !!on;
    if (this.state !== 'idle' && this.state !== 'stopped') this.reset();
  }

  _keyDown(e) {
    if (e.code === 'Escape') { this.reset(); return; }
    if (e.code !== 'Space') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.isLocked()) return;
    e.preventDefault();
    if (e.repeat) return;
    this._press();
  }

  _keyUp(e) { if (e.code === 'Space' && !e.repeat) this._release(); }

  _press() {
    if (this.isLocked()) return;
    switch (this.state) {
      case 'running': {
        const el = performance.now() - this._t0;
        if (el < 120) return;
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
      default: break;
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
    this.digits.textContent = '0.00';
    clearTimeout(this._holdT);
    this._holdT = setTimeout(() => {
      if (this.state === 'hold') this._setState('ready');
    }, 500);
  }

  _go() {
    clearTimeout(this._holdT);
    const inspMs = this._insp;
    let forced = null;
    if (this.inspection && inspMs > 15000) forced = inspMs > 17000 ? 'dnf' : '+2';
    this._insp = 0;
    if (forced === 'dnf') { this._finish(0, forced); return; }
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
    this.digits.textContent = forced === 'dnf' ? 'DNF' : fmtMs(rawMs);
    this.onFinish({ rawMs, inspectionMs: this._insp, forced });
    this._insp = 0;
  }

  reset() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._holdT);
    this._pendingForced = null;
    this._insp = 0;
    this._setState('idle');
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
      } else if (this.state === 'inspection') {
        this._insp = performance.now() - this._i0;
        this.digits.textContent = String(Math.floor(this._insp / 1000));
        if (this._insp >= 17000) { this._finish(0, 'dnf'); return; }
        if (this._insp >= 15000 && this.pill.textContent !== 'INSPECTION +2')
          this.pill.textContent = 'INSPECTION +2';
        this._raf = requestAnimationFrame(step);
      }
    };
    this._raf = requestAnimationFrame(step);
  }
};
