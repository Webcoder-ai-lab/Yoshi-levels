// Yoshi platformer, 1–2 players, 10 levels, 5 themes
// Controls: P1 Pijlen+↑spring+↓tong  |  P2 WASD+Wspring+Stong

type Theme = 'jungle' | 'desert' | 'snow' | 'volcano' | 'sky';
type Screen = 'title' | 'playing' | 'levelClear' | 'gameOver' | 'victory';

interface Vec2 { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }

const W = 960, H = 540, VERSION = 'v1.3';
const GRAVITY = 850, JUMP_V = -370, FLUTTER_V = -80, MAX_FLUTTER = 0.45;
const MOVE_SPD = 170, TONGUE_RNG = 55, TONGUE_TIME = 0.25;
const EGG_SPD = 320, ENEMY_SPD = 45, PLAYER_H = 28, PLAYER_R = 13;
type PowerUpType = 'highJump' | 'speed' | 'extraCoins' | 'star';
const POWERUP_FALL_SPD = 70, POWERUP_DURATION = 8, POWERUP_SPAWN_INTERVAL = 4.5, POWERUP_LIFETIME = 10, POWERUP_W = 22, POWERUP_H = 22;

const THEME: Record<Theme, { sky: string[]; ground: string; plat: string; accent: string; ec: string }> = {
  jungle: { sky: ['#0d2810','#1a4a20','#2d6a3a'], ground:'#3a2a1a', plat:'#5a6a2a', accent:'#6aba4a', ec:'#4a9a3a' },
  desert: { sky: ['#3a2010','#5a3a1a','#8a6a3a'], ground:'#7a5a3a', plat:'#a89858', accent:'#d4a040', ec:'#c04040' },
  snow:   { sky: ['#1a2a4a','#3a5a7a','#6a9aba'], ground:'#b8c8d8', plat:'#d8e8f0', accent:'#8ab8d8', ec:'#6090b8' },
  volcano:{ sky: ['#1a0808','#3a1410','#5a2018'], ground:'#2a1810', plat:'#5a2a1a', accent:'#e04020', ec:'#d03050' },
  sky:    { sky: ['#0a1a3a','#2a4a7a','#4a7aaa'], ground:'#7aaaca', plat:'#b8d8f0', accent:'#f0d840', ec:'#c09830' },
};

const THEME_LIST: Theme[] = ['jungle','desert','snow','volcano','sky'];

// Seeded random for deterministic level gen
let _seed = 1;
function srand(s?: number) { if (s !== undefined) _seed = s; return (_seed = (_seed * 16807) % 2147483647) / 2147483646; }

// ─── Input ───────────────────────────────────────────────────────────────────
class Input {
  held = new Set<string>();  pressed = new Set<string>();
  constructor() {
    window.addEventListener('keydown', e => { if (!this.held.has(e.code)) this.pressed.add(e.code); this.held.add(e.code); e.preventDefault(); });
    window.addEventListener('keyup',   e => { this.held.delete(e.code); e.preventDefault(); });
  }
  down(c: string) { return this.held.has(c); }
  just(c: string)  { return this.pressed.has(c); }
  endFrame()       { this.pressed.clear(); }
}

// ─── Mobile Input (touch controls) ───────────────────────────────────────────
class MobileInput {
  canvas: HTMLCanvasElement;
  inp: Input;
  game: YoshiGame;
  active = false;

  // Touch tracking
  touchPos = new Map<number, Vec2>();
  touchStart = new Map<number, Vec2>();
  joystickTouch = new Map<string, number>(); // 'j1'|'j2' -> touch identifier
  actionTouch = new Map<string, number>();   // 'a1'|'a2' -> touch identifier

  // Joystick state per zone
  jState = new Map<string, { dx: number; dy: number; wasUp: boolean }>();

  // Action button just-pressed per zone
  actionJust = new Map<string, boolean>();

  constructor(canvas: HTMLCanvasElement, inp: Input, game: YoshiGame) {
    this.canvas = canvas;
    this.inp = inp;
    this.game = game;
    this.setup();
  }

  private canvasPos(t: Touch): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (t.clientX - rect.left) * (W / rect.width),
      y: (t.clientY - rect.top) * (H / rect.height),
    };
  }

  private setup() {
    const c = this.canvas;
    c.addEventListener('touchstart', (e: TouchEvent) => {
      if (!this.active) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const pos = this.canvasPos(t);
        this.touchPos.set(t.identifier, pos);
        this.touchStart.set(t.identifier, { ...pos });
        this.assignTouch(t.identifier, pos);
      }
    });
    c.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.active) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.touchPos.set(t.identifier, this.canvasPos(t));
      }
    });
    c.addEventListener('touchend', (e: TouchEvent) => {
      if (!this.active) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.removeTouch(t.identifier);
      }
    });
    c.addEventListener('touchcancel', (e: TouchEvent) => {
      if (!this.active) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.removeTouch(e.changedTouches[i].identifier);
      }
    });
  }

  private assignTouch(id: number, pos: Vec2) {
    const np = this.game.numPlayers;
    if (np >= 2) {
      // Left half = P2, right half = P1
      if (pos.x < W / 2) {
        // P2: left part = joystick, right part = action
        if (pos.x < W * 0.38 && !this.joystickTouch.has('j2')) {
          this.joystickTouch.set('j2', id);
          if (!this.jState.has('j2')) this.jState.set('j2', { dx: 0, dy: 0, wasUp: false });
        } else if (pos.x >= W * 0.38 && !this.actionTouch.has('a2')) {
          this.actionTouch.set('a2', id);
          this.actionJust.set('a2', true);
        }
      } else {
        // P1: left part = joystick, right part = action
        if (pos.x < W * 0.88 && !this.joystickTouch.has('j1')) {
          this.joystickTouch.set('j1', id);
          if (!this.jState.has('j1')) this.jState.set('j1', { dx: 0, dy: 0, wasUp: false });
        } else if (pos.x >= W * 0.88 && !this.actionTouch.has('a1')) {
          this.actionTouch.set('a1', id);
          this.actionJust.set('a1', true);
        }
      }
    } else {
      // 1-player: left half = joystick, right half = action
      if (pos.x < W / 2 && !this.joystickTouch.has('j1')) {
        this.joystickTouch.set('j1', id);
        if (!this.jState.has('j1')) this.jState.set('j1', { dx: 0, dy: 0, wasUp: false });
      } else if (pos.x >= W / 2 && !this.actionTouch.has('a1')) {
        this.actionTouch.set('a1', id);
        this.actionJust.set('a1', true);
      }
    }
  }

  private removeTouch(id: number) {
    this.touchPos.delete(id);
    this.touchStart.delete(id);
    for (const [sid, tid] of this.joystickTouch) {
      if (tid === id) {
        this.joystickTouch.delete(sid);
        const s = this.jState.get(sid);
        if (s) { s.dx = 0; s.dy = 0; s.wasUp = false; }
      }
    }
    for (const [sid, tid] of this.actionTouch) {
      if (tid === id) {
        this.actionTouch.delete(sid);
        this.actionJust.set(sid, false);
      }
    }
  }

  updateKeys() {
    if (!this.active) return;

    // Update joystick directions
    for (const [sid, tid] of this.joystickTouch) {
      const pos = this.touchPos.get(tid);
      const start = this.touchStart.get(tid);
      const state = this.jState.get(sid);
      if (!pos || !start || !state) continue;

      const dx = pos.x - start.x;
      const dy = pos.y - start.y;
      const deadzone = 15;

      state.dx = Math.abs(dx) > deadzone ? Math.sign(dx) : 0;
      state.dy = Math.abs(dy) > deadzone ? Math.sign(dy) : 0;
    }

    // Clear mobile-managed keys from held (keyboard keys stay intact)
    const managed = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
    for (const k of managed) this.inp.held.delete(k);

    // Apply joystick states to virtual keys
    for (const [sid, state] of this.jState) {
      const isP1 = sid === 'j1';
      const keys = isP1
        ? { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', act: 'ArrowDown' }
        : { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', act: 'KeyS' };

      if (state.dx < 0) this.inp.held.add(keys.left);
      if (state.dx > 0) this.inp.held.add(keys.right);
      if (state.dy > 0) this.inp.held.add(keys.down); // ghost down

      // Jump: held for flutter, just-pressed on transition
      const upNow = state.dy < 0;
      if (upNow) {
        if (!state.wasUp) this.inp.pressed.add(keys.up);
        this.inp.held.add(keys.up);
      }
      state.wasUp = upNow;
    }

    // Apply action button just-pressed
    for (const [sid, val] of this.actionJust) {
      if (val) {
        const isP1 = sid === 'a1';
        this.inp.pressed.add(isP1 ? 'ArrowDown' : 'KeyS');
        this.actionJust.set(sid, false);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.game.numPlayers >= 2) {
      // P2 (left half)
      this.drawJoystick(ctx, W * 0.17, H * 0.75, 'j2', 'P2');
      this.drawActionBtn(ctx, W * 0.44, H * 0.75, 'a2');
      // P1 (right half)
      this.drawJoystick(ctx, W * 0.62, H * 0.75, 'j1', 'P1');
      this.drawActionBtn(ctx, W * 0.92, H * 0.75, 'a1');
    } else {
      this.drawJoystick(ctx, W * 0.17, H * 0.75, 'j1', 'P1');
      this.drawActionBtn(ctx, W * 0.85, H * 0.75, 'a1');
    }

    ctx.restore();
  }

  private drawJoystick(ctx: CanvasRenderingContext2D, cx: number, cy: number, sid: string, label: string) {
    const state = this.jState.get(sid);
    const baseR = 55;

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, baseR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Direction indicator
    let kx = cx, ky = cy;
    if (state && (state.dx !== 0 || state.dy !== 0)) {
      const maxDist = 30;
      kx += state.dx * maxDist;
      ky += state.dy * maxDist;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(kx, ky, 20, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '11px monospace';
    ctx.fillText(label, cx, cy - baseR - 12);
  }

  private drawActionBtn(ctx: CanvasRenderingContext2D, cx: number, cy: number, sid: string) {
    const r = 32;
    const pressed = this.actionJust.get(sid);

    ctx.fillStyle = pressed ? 'rgba(255,80,80,0.5)' : 'rgba(255,80,80,0.25)';
    ctx.strokeStyle = 'rgba(255,80,80,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('TONG', cx, cy - 5);
    ctx.font = '10px monospace';
    ctx.fillText('EI', cx, cy + 10);
  }
}

// ─── Camera ──────────────────────────────────────────────────────────────────
class Camera { x = 0; y = 0;
  follow(players: Player[], lw: number) {
    let cx = 0, cy = 0, n = 0;
    for (const p of players) { if (p.lives <= 0) continue; cx += p.pos.x; cy += p.pos.y; n++; }
    if (n === 0) return;
    cx /= n; cy /= n;
    this.x = Math.max(0, Math.min(lw - W, cx - W / 2));
    this.y = Math.max(-40, Math.min(40, cy - H / 2));
  }
}

// ─── Platform ────────────────────────────────────────────────────────────────
class Platform {
  r: Rect; moving = false; mx = 0; range = 0; spd = 0; dir = 1;
  constructor(r: Rect, moving = false, range = 0, spd = 0) {
    this.r = { ...r }; this.mx = r.x; this.moving = moving; this.range = range; this.spd = spd;
  }
  update(dt: number) {
    if (!this.moving) return;
    this.r.x += this.spd * this.dir * dt;
    if (Math.abs(this.r.x - this.mx) >= this.range) this.dir *= -1;
  }
}

// ─── Coin ────────────────────────────────────────────────────────────────────
class Coin { pos: Vec2; phase = 0; taken = false;
  constructor(x: number, y: number) { this.pos = { x, y }; }
  update(dt: number) { this.phase += dt * 3; }
}

// ─── Enemy ───────────────────────────────────────────────────────────────────
class Enemy {
  pos: Vec2; startX: number; dir = -1; range = 60; alive = true; respawn = 0; r = 11;
  constructor(x: number, y: number, range: number) { this.pos = { x, y }; this.startX = x; this.range = range; }
  update(dt: number) {
    if (!this.alive) { this.respawn -= dt; if (this.respawn <= 0) { this.alive = true; this.pos.x = this.startX; } return; }
    this.pos.x += this.dir * ENEMY_SPD * dt;
    if (Math.abs(this.pos.x - this.startX) >= this.range) this.dir *= -1;
  }
}

// ─── PowerUp ─────────────────────────────────────────────────────────────────
class PowerUp {
  pos: Vec2; type: PowerUpType; alive = true; grounded = false;
  lifetime = POWERUP_LIFETIME; phase = 0;
  constructor(x: number, y: number, type: PowerUpType) {
    this.pos = { x, y }; this.type = type;
  }
  update(dt: number, plats: Platform[]) {
    this.phase += dt;
    if (this.grounded) { this.lifetime -= dt; if (this.lifetime <= 0) this.alive = false; return; }
    this.pos.y += POWERUP_FALL_SPD * dt;
    for (const p of plats) {
      const r = p.r;
      if (this.pos.x + POWERUP_W / 2 > r.x && this.pos.x - POWERUP_W / 2 < r.x + r.w &&
          this.pos.y + POWERUP_W / 2 > r.y && this.pos.y - POWERUP_W / 2 < r.y + r.h) {
        this.pos.y = r.y - POWERUP_W / 2; this.grounded = true; break;
      }
    }
    if (this.pos.y > H + 100) this.alive = false;
  }
}

// ─── Egg ─────────────────────────────────────────────────────────────────────
class Egg {
  pos: Vec2; vel: Vec2; alive = true; bnc = 0;
  constructor(x: number, y: number, dir: number) { this.pos = { x, y }; this.vel = { x: dir * EGG_SPD, y: -220 }; }
  update(dt: number, plats: Platform[], enemies: Enemy[], owner: Player) {
    this.vel.y += GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    for (const p of plats) {
      const r = p.r;
      if (this.pos.x + 6 > r.x && this.pos.x - 6 < r.x + r.w && this.pos.y + 6 > r.y && this.pos.y - 6 < r.y + r.h) {
        if (this.vel.y > 0) { this.vel.y = -this.vel.y * 0.4; this.pos.y = r.y - 6; }
        else { this.vel.x = -this.vel.x * 0.4; }
        this.bnc++; if (this.bnc > 3) { this.alive = false; break; }
      }
    }
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(this.pos.x - e.pos.x, this.pos.y - e.pos.y) < 6 + e.r) {
        e.alive = false; e.respawn = 3; owner.score += 200; this.alive = false; break;
      }
    }
    if (this.pos.x < -50 || this.pos.x > 6000 || this.pos.y > 700) this.alive = false;
  }
}

// ─── Player (Yoshi) ──────────────────────────────────────────────────────────
class Player {
  pos: Vec2; vel: Vec2; facing = 1; grounded = false; flutter = 0;
  hasEgg = false; tongue = false; tongueT = 0; tongueTip?: Vec2;
  lives = 3; score = 0; invinc = 0; color: string; saddle: string; phase = 0;
  moveL: string; moveR: string; jumpKey: string; actKey: string;
  powerUp: { type: PowerUpType; timer: number } | null = null;
  ghostTimer = 0; justRevived = false; _prevLives = 3;

  constructor(id: number, x: number, y: number, color: string, saddle: string,
              moveL: string, moveR: string, jumpKey: string, actKey: string) {
    this.pos = { x, y }; this.vel = { x: 0, y: 0 };
    this.color = color; this.saddle = saddle;
    this.moveL = moveL; this.moveR = moveR; this.jumpKey = jumpKey; this.actKey = actKey;
  }

  update(dt: number, inp: Input, plats: Platform[], coins: Coin[], enemies: Enemy[], eggs: Egg[], lw: number) {
    // Ghost flight (before lives check)
    if (this.ghostTimer > 0) {
      this.ghostTimer -= dt;
      let mx = 0, my = 0;
      if (inp.down(this.moveL)) mx -= 1;
      if (inp.down(this.moveR)) mx += 1;
      if (inp.down(this.jumpKey)) my -= 1;
      if (inp.down(this.actKey)) my += 1;
      const spd = 150;
      this.pos.x += mx * spd * dt;
      this.pos.y += my * spd * dt;
      if (this.pos.x < -50) this.pos.x = -50;
      if (this.pos.x > lw + 50) this.pos.x = lw + 50;
      if (this.pos.y > H + 200) this.pos.y = H + 200;
      if (this.pos.y < -400) this.pos.y = -400;
      if (this.ghostTimer <= 0) { if (this.lives <= 0) this.lives = 1; this.invinc = 2; this.ghostTimer = 0; this.justRevived = true; }
      this.phase += dt;
      return;
    }

    if (this.lives <= 0) return;
    if (this.invinc > 0) this.invinc -= dt;

    // Power-up timer
    if (this.powerUp) {
      this.powerUp.timer -= dt;
      if (this.powerUp.timer <= 0) this.powerUp = null;
    }
    this.phase += dt;

    let mx = 0;
    if (inp.down(this.moveL)) mx -= 1;
    if (inp.down(this.moveR)) mx += 1;
    if (mx !== 0) this.facing = mx;
    this.vel.x = mx * (this.powerUp?.type === 'speed' ? MOVE_SPD * 1.6 : MOVE_SPD);

    if (inp.just(this.jumpKey) && this.grounded) {
      this.vel.y = this.powerUp?.type === 'highJump' ? JUMP_V * 1.6 : JUMP_V;
      this.grounded = false;
      this.flutter = this.powerUp?.type === 'highJump' ? MAX_FLUTTER * 1.5 : MAX_FLUTTER;
    }

    if (inp.down(this.jumpKey) && !this.grounded && this.flutter > 0 && this.vel.y > FLUTTER_V) {
      this.vel.y = FLUTTER_V; this.flutter -= dt;
    }
    if (this.grounded) this.flutter = MAX_FLUTTER;

    this.vel.y += GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // Platform collision
    this.grounded = false;
    for (const p of plats) {
      const r = p.r;
      if (this.pos.x + PLAYER_R > r.x && this.pos.x - PLAYER_R < r.x + r.w &&
          this.pos.y + PLAYER_R > r.y && this.pos.y - PLAYER_R < r.y + r.h) {
        const ot = (this.pos.y + PLAYER_R) - r.y;
        const ob = (r.y + r.h) - (this.pos.y - PLAYER_R);
        const ol = (this.pos.x + PLAYER_R) - r.x;
        const orr = (r.x + r.w) - (this.pos.x - PLAYER_R);
        const m = Math.min(ot, ob, ol, orr);
        if (m === ot && this.vel.y >= 0) { this.pos.y = r.y - PLAYER_R; this.vel.y = 0; this.grounded = true; }
        else if (m === ob && this.vel.y < 0) { this.pos.y = r.y + r.h + PLAYER_R; this.vel.y = 0; }
        else if (m === ol && this.vel.x >= 0) { this.pos.x = r.x - PLAYER_R; this.vel.x = 0; }
        else if (m === orr && this.vel.x <= 0) { this.pos.x = r.x + r.w + PLAYER_R; this.vel.x = 0; }
      }
    }

    // Coins
    for (const c of coins) {
      if (c.taken) continue;
      if (Math.hypot(this.pos.x - c.pos.x, this.pos.y - c.pos.y) < PLAYER_R + 7) {
        c.taken = true; this.score += 50;
      }
    }

    // Action
    if (inp.just(this.actKey)) {
      if (this.hasEgg) { eggs.push(new Egg(this.pos.x + this.facing * 18, this.pos.y - 4, this.facing)); this.hasEgg = false; }
      else { this.tongue = true; this.tongueT = TONGUE_TIME; this.tongueTip = undefined; }
    }
    if (this.tongue) {
      this.tongueT -= dt;
      const tip: Vec2 = { x: this.pos.x + this.facing * TONGUE_RNG, y: this.pos.y - 4 };
      this.tongueTip = tip;
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.hypot(tip.x - e.pos.x, tip.y - e.pos.y) < 16) {
          e.alive = false; e.respawn = 3; this.hasEgg = true; this.score += 200; this.tongue = false; break;
        }
      }
      if (this.tongueT <= 0) this.tongue = false;
    }

    // Enemy contact
    for (const e of enemies) {
      if (!e.alive || this.invinc > 0) continue;
      if (Math.hypot(this.pos.x - e.pos.x, this.pos.y - e.pos.y) < PLAYER_R + e.r) {
        if (this.powerUp?.type === 'star' || (this.vel.y > 0 && this.pos.y < e.pos.y - e.r)) {
          e.alive = false; e.respawn = 3; this.score += 200;
          if (this.vel.y > 0) this.vel.y = JUMP_V * 0.5;
        } else { this.die(); }
      }
    }

    // Bounds
    if (this.pos.x < -50) this.pos.x = -50;
    if (this.pos.x > lw + 50) this.pos.x = lw + 50;
    if (this.pos.y > H + 200) this.die();
    if (this.pos.y < -400) this.pos.y = -400;
  }

  die() {
    if (this.invinc > 0) return;
    this.lives--;
    if (this.lives <= 0) return;
    this.pos.x = 80; this.pos.y = 80; this.vel.x = 0; this.vel.y = 0; this.invinc = 2;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (this.lives <= 0 && this.ghostTimer <= 0) return;
    if (!this.ghostTimer && this.invinc > 0 && Math.floor(this.invinc * 8) % 2 === 0) return;
    const sx = this.pos.x - cam.x, sy = this.pos.y - cam.y;

    ctx.save(); ctx.translate(sx, sy);
    if (this.ghostTimer > 0) ctx.globalAlpha = 0.55;
    if (this.ghostTimer > 0) { ctx.fillStyle = 'rgba(100,150,255,0.15)'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); }

    // Disco effect (only star power-up)
    const origColor = this.color;
    if (this.powerUp?.type === 'star') {
      const hue = (this.powerUp.timer * 120) % 360;
      this.color = `hsl(${hue}, 100%, 60%)`;
    }

    // Tail
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(-this.facing * 10, 2, 7, 4, 0, 0.3, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath(); ctx.ellipse(0, -2, 13, 11, 0, 0, Math.PI * 2); ctx.fill();

    // Saddle
    ctx.fillStyle = this.saddle;
    ctx.beginPath(); ctx.ellipse(0, -11, 9, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(this.facing * 8, -11, 8, 7, 0, 0, Math.PI * 2); ctx.fill();

    // Snout
    ctx.beginPath(); ctx.ellipse(this.facing * 14, -9, 5, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.facing * 10, -14, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(this.facing * 11, -14, 2, 0, Math.PI * 2); ctx.fill();

    // Nostril
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(this.facing * 17, -9, 1.5, 0, Math.PI * 2); ctx.fill();

    // Legs
    ctx.fillStyle = this.saddle;
    const legY = this.grounded ? 6 : this.vel.y > 0 ? 9 : 3;
    ctx.fillRect(-7, 6, 4, 6); ctx.fillRect(3, 6, 4, 6);

    // Tongue
    if (this.tongue && this.tongueTip) {
      ctx.strokeStyle = '#e85050';
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.facing * 14, -8);
      ctx.lineTo(this.tongueTip.x - cam.x - sx, this.tongueTip.y - cam.y - sy);
      ctx.stroke();
    }

    // Egg
    if (this.hasEgg) {
      ctx.fillStyle = '#f0f0e8'; ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, -20, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Power-up particle effects
    if (this.powerUp?.type === 'highJump' && !this.grounded) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const ax = -7 + i * 7;
        const ay = 10 + Math.sin(this.phase * 20 + i * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(ax, ay + 5); ctx.lineTo(ax, ay);
        ctx.lineTo(ax - 3, ay + 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(ax + 3, ay + 2); ctx.stroke();
      }
    }
    if (this.powerUp?.type === 'speed' && Math.abs(this.vel.x) > 10) {
      ctx.strokeStyle = '#fe0';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const lx = -this.facing * 14 - i * 7;
        const ly = -2 + i * 5;
        ctx.beginPath();
        ctx.moveTo(lx, ly - 4); ctx.lineTo(lx - 1, ly);
        ctx.lineTo(lx + 1, ly); ctx.lineTo(lx - 1, ly + 4);
        ctx.stroke();
      }
    }

    if (this.powerUp) this.color = origColor;
    ctx.restore();
  }
}

// ─── Level Generator ─────────────────────────────────────────────────────────
function genLevel(num: number) {
  const theme = THEME_LIST[(num - 1) % 5];
  const diff = 1 + Math.floor((num - 1) / 5);
  srand(num * 1337 + 42);

  const lw = 2000 + num * 200 + srand() * 200;
  const baseY = H - 70;
  const plats: Platform[] = [];
  const enemies: Enemy[] = [];
  const coins: Coin[] = [];

  // Ground segments — with gaps starting level 2
  let x = 0;
  while (x < lw) {
    let segW: number;
    if (x > 0 && diff >= 1 && num >= 2 && srand() < 0.12 * diff) {
      // Gap
      const gapW = 40 + srand() * 40 * diff;
      x += gapW;
      segW = 200 + srand() * 300;
    } else {
      segW = 300 + srand() * 300;
    }
    segW = Math.min(segW, lw - x);
    if (segW < 20) break;
    plats.push(new Platform({ x, y: baseY, w: segW, h: 40 }));
    x += segW;
  }

  // Platforms above
  const nPlats = 6 + num * 2 + Math.floor(srand() * 4);
  for (let i = 0; i < nPlats; i++) {
    const px = 200 + srand() * (lw - 400);
    const py = baseY - 50 - srand() * 120;
    const pw = 50 + srand() * 80;
    const ph = 14;
    // Moving platform?
    let moving = false, range = 0, spd = 0;
    if (num >= 3 && srand() < 0.2 * diff) { moving = true; range = 30 + srand() * 40; spd = 30 + srand() * 30; }
    plats.push(new Platform({ x: px, y: py, w: pw, h: ph }, moving, range, spd));
  }

  // Enemies
  const nEnemies = 1 + num + Math.floor(srand() * 2);
  for (let i = 0; i < nEnemies; i++) {
    const pi = Math.floor(srand() * plats.length);
    const p = plats[pi];
    const ex = p.r.x + 20 + srand() * (p.r.w - 40);
    const ey = p.r.y - 12;
    const er = Math.min(40, p.r.w / 2 - 5);
    enemies.push(new Enemy(ex, ey, Math.max(20, er)));
  }

  // Coins
  const nCoins = 5 + num * 2 + Math.floor(srand() * 5);
  for (let i = 0; i < nCoins; i++) {
    const pi = Math.floor(srand() * plats.length);
    const p = plats[pi];
    const cx = p.r.x + srand() * p.r.w;
    const cy = p.r.y - 20 - srand() * 50;
    coins.push(new Coin(cx, cy));
  }

  return { theme, lw, plats, enemies, coins, flagX: lw - 120 };
}

// ─── Drawing Helpers ─────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, theme: Theme, cam: Camera, lw: number) {
  const t = THEME[theme];

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, t.sky[0]);
  grad.addColorStop(0.5, t.sky[1]);
  grad.addColorStop(1, t.sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Parallax decoration (simple shapes)
  ctx.save();
  const offset = cam.x * 0.15;
  ctx.fillStyle = t.sky[1];
  for (let i = 0; i < 8; i++) {
    const bx = ((i * 200 + 50 - offset) % (W + 200) + W + 200) % (W + 200) - 100;
    const by = 40 + (i % 3) * 60;
    if (theme === 'snow' || theme === 'sky') {
      ctx.beginPath(); ctx.arc(bx, by, 15 + (i % 4) * 8, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 'volcano') {
      ctx.beginPath();
      ctx.moveTo(bx, by + 20); ctx.lineTo(bx - 15, by - 10); ctx.lineTo(bx + 15, by - 10);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(bx, by + 15); ctx.lineTo(bx - 20, by - 5); ctx.lineTo(bx + 20, by - 5);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

function drawFlag(ctx: CanvasRenderingContext2D, cam: Camera, x: number, baseY: number) {
  const sx = x - cam.x, sy = baseY - cam.y;
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(sx - 2, sy - 60, 4, 60);
  ctx.fillStyle = '#f0d040';
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy - 55); ctx.lineTo(sx + 30, sy - 45); ctx.lineTo(sx + 2, sy - 35);
  ctx.closePath(); ctx.fill();
}

function drawHUD(ctx: CanvasRenderingContext2D, players: Player[], level: number, theme: Theme) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeText(`Level ${level}`, 12, 26);
  ctx.fillText(`Level ${level}`, 12, 26);

  const t = THEME[theme];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const y = 46 + i * 22;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText(`P${i+1}: ${p.score}  ♥${p.lives}`, 12, y);
    ctx.fillStyle = p.color;
    ctx.fillText(`P${i+1}: ${p.score}  ♥${p.lives}`, 12, y);
  }
  ctx.restore();
}

// ─── Main Game ───────────────────────────────────────────────────────────────
class YoshiGame {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  inp = new Input();
  mobile: MobileInput;
  controlMode: 'pc' | 'mobile' = 'pc';
  screen: Screen = 'title'; numPlayers = 1;

  players: Player[] = [];
  plats: Platform[] = []; coins: Coin[] = []; enemies: Enemy[] = []; eggs: Egg[] = [];
  powerUps: PowerUp[] = [];
  cam = new Camera();
  level = 1; lw = 0; flagX = 0; baseY = 0; theme: Theme = 'jungle';
  clearTimer = 0; powerUpSpawnTimer = 0;

  // Title bob
  titleTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.mobile = new MobileInput(canvas, this.inp, this);
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      if (this.screen === 'title') {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const tx = (e.touches[0].clientX - rect.left) * (W / rect.width);
        const ty = (e.touches[0].clientY - rect.top) * (H / rect.height);
        // Toggle mode button (top-right area) — always works
        if (tx > W - 160 && ty > 50 && ty < 100) {
          this.controlMode = this.controlMode === 'pc' ? 'mobile' : 'pc';
          this.mobile.active = this.controlMode === 'mobile';
          return;
        }
        // In PC mode, only the toggle button works via touch
        if (this.controlMode !== 'mobile') return;
        // Start game: left half = 1P, right half = 2P
        this.level = 1; this.screen = 'playing';
        this.players = [];
        // Clear any ghost touches that MobileInput may have already assigned
        this.mobile.touchPos.clear();
        this.mobile.touchStart.clear();
        this.mobile.joystickTouch.clear();
        this.mobile.actionTouch.clear();
        this.mobile.jState.clear();
        this.mobile.actionJust.clear();
        this.startLevel();
      } else if (this.screen === 'gameOver' || this.screen === 'victory') {
        if (this.controlMode !== 'mobile') return;
        e.preventDefault();
        this.screen = 'title';
        this.players = [];
      }
    }, { passive: false });
    canvas.focus();
    this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL;
  }

  startLevel() {
    const g = genLevel(this.level);
    this.theme = g.theme; this.lw = g.lw; this.flagX = g.flagX;
    this.baseY = H - 70;
    this.plats = g.plats;
    this.enemies = g.enemies;
    this.coins = g.coins;
    this.eggs = [];
    this.powerUps = [];
    this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL;

    if (this.players.length === 0) {
      this.players.push(new Player(1, 60, 60, '#4bc84b', '#d04040', 'ArrowLeft','ArrowRight','ArrowUp','ArrowDown'));
    }
    if (this.numPlayers >= 2 && this.players.length < 2) {
      this.players.push(new Player(2, 140, 60, '#f080c0', '#8040a0', 'KeyA','KeyD','KeyW','KeyS'));
    }
    for (const p of this.players) {
      if (p.lives > 0) { p.pos.x = 60 + (p.id - 1) * 80; p.pos.y = 60; p.vel.x = 0; p.vel.y = 0; p.grounded = false; }
    }
  }

  update(dt: number) {
    this.titleTime += dt;
    if (this.screen === 'title') {
      if (this.inp.just('KeyM')) {
        this.controlMode = this.controlMode === 'pc' ? 'mobile' : 'pc';
        this.mobile.active = this.controlMode === 'mobile';
      }
      if (this.inp.just('Digit1') || this.inp.just('Numpad1') || this.inp.just('Enter')) {
        this.numPlayers = 1; this.level = 1; this.screen = 'playing';
        this.players = [];
        this.startLevel();
      } else if (this.inp.just('Digit2') || this.inp.just('Numpad2')) {
        this.numPlayers = 2; this.level = 1; this.screen = 'playing';
        this.players = [];
        this.startLevel();
      }
      this.inp.endFrame();
      return;
    }

    if (this.screen === 'gameOver' || this.screen === 'victory') {
      if (this.inp.just('Enter') || this.inp.just('Space')) {
        this.screen = 'title';
        this.players = [];
      }
      this.mobile.updateKeys();
      this.inp.endFrame();
      return;
    }

    if (this.screen === 'levelClear') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        this.level++;
        if (this.level > 10) { this.screen = 'victory'; }
        else { this.screen = 'playing'; this.startLevel(); }
      }
      this.mobile.updateKeys();
      this.inp.endFrame();
      return;
    }

    // Playing
    this.mobile.updateKeys();
    for (const p of this.plats) p.update(dt);
    for (const c of this.coins) c.update(dt);
    for (const e of this.enemies) e.update(dt);

    // Power-ups
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL + Math.random() * 2;
      const r = Math.random();
      let type: PowerUpType;
      if (r < 0.4) type = 'highJump';
      else if (r < 0.7) type = 'speed';
      else if (r < 0.9) type = 'extraCoins';
      else type = 'star';
      this.powerUps.push(new PowerUp(80 + Math.random() * (this.lw - 160), -20, type));
    }
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.update(dt, this.plats);
      if (!pu.alive) { this.powerUps.splice(i, 1); continue; }
      for (const p of this.players) {
        if (p.lives <= 0) continue;
        if (Math.hypot(p.pos.x - pu.pos.x, p.pos.y - pu.pos.y) < PLAYER_R + POWERUP_W / 2) {
          pu.alive = false;
          if (pu.type === 'extraCoins') {
            for (let j = 0; j < 6; j++) {
              const cx = pu.pos.x + (Math.random() - 0.5) * 200;
              const cy = pu.pos.y - 30 - Math.random() * 80;
              this.coins.push(new Coin(cx, cy));
            }
            p.score += 100;
          } else {
            p.powerUp = { type: pu.type, timer: POWERUP_DURATION };
          }
          this.powerUps.splice(i, 1);
          break;
        }
      }
    }

    for (let i = this.eggs.length - 1; i >= 0; i--) {
      this.eggs[i].update(dt, this.plats, this.enemies, this.players[0]);
      if (!this.eggs[i].alive) this.eggs.splice(i, 1);
    }
    for (const p of this.players) p.update(dt, this.inp, this.plats, this.coins, this.enemies, this.eggs, this.lw);

    // Ghost system (2-player)
    if (this.numPlayers >= 2) {
      for (const p of this.players) {
        if (p.lives < p._prevLives && p.ghostTimer === 0) {
          p.ghostTimer = 5;
          p.vel.x = 0; p.vel.y = 0;
          for (const other of this.players) {
            if (other !== p && other.lives > 0) { p.pos.x = other.pos.x + (other.id === 1 ? 30 : -30); p.pos.y = other.pos.y; break; }
          }
        }
        p._prevLives = p.lives;
        if (p.justRevived) {
          p.justRevived = false;
          for (const other of this.players) {
            if (other !== p && other.lives > 0) {
              p.pos.x = other.pos.x + (other.id === 1 ? 40 : -40);
              p.pos.y = other.pos.y - 10;
              break;
            }
          }
        }
      }
    }

    this.cam.follow(this.players, this.lw);

    // Check level clear
    let aliveCount = 0, ghostCount = 0;
    for (const p of this.players) { if (p.lives > 0) aliveCount++; if (p.ghostTimer > 0) ghostCount++; }
    if (aliveCount === 0 && ghostCount === 0) { this.screen = 'gameOver'; this.inp.endFrame(); return; }

    for (const p of this.players) {
      if (p.lives <= 0) continue;
      if (p.pos.x >= this.flagX) {
        this.screen = 'levelClear';
        this.clearTimer = 2;
        break;
      }
    }

    this.inp.endFrame();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    if (this.screen === 'title') {
      this.drawTitle(ctx);
      return;
    }

    drawBg(ctx, this.theme, this.cam, this.lw);

    // Ground line
    ctx.fillStyle = THEME[this.theme].ground;
    ctx.fillRect(0, 0, W, H);

    // Redraw bg below ground for ground color
    drawBg(ctx, this.theme, this.cam, this.lw);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, this.baseY + 40 - this.cam.y);
    ctx.clip();
    drawBg(ctx, this.theme, this.cam, this.lw);
    ctx.restore();

    // Ground
    ctx.fillStyle = THEME[this.theme].ground;
    for (const p of this.plats) {
      if (p.r.h >= 30) { // ground segments
        const sx = p.r.x - this.cam.x, sy = p.r.y - this.cam.y;
        ctx.fillRect(sx, sy, p.r.w, p.r.h);
        ctx.fillStyle = THEME[this.theme].plat;
        ctx.fillRect(sx, sy, p.r.w, 4);
        ctx.fillStyle = THEME[this.theme].ground;
      }
    }

    // Platforms
    for (const p of this.plats) {
      if (p.r.h < 30) {
        const sx = p.r.x - this.cam.x, sy = p.r.y - this.cam.y;
        ctx.fillStyle = THEME[this.theme].plat;
        ctx.fillRect(sx, sy, p.r.w, p.r.h);
        ctx.fillStyle = THEME[this.theme].accent;
        ctx.fillRect(sx, sy, p.r.w, 3);
      }
    }

    // Flag
    drawFlag(ctx, this.cam, this.flagX, this.baseY);

    // Coins
    for (const c of this.coins) {
      if (c.taken) continue;
      const sx = c.pos.x - this.cam.x, sy = c.pos.y - this.cam.y + Math.sin(c.phase) * 3;
      ctx.fillStyle = '#f0d040';
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8a020';
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8';
      ctx.beginPath(); ctx.arc(sx - 1.5, sy - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const sx = e.pos.x - this.cam.x, sy = e.pos.y - this.cam.y;
      ctx.fillStyle = THEME[this.theme].ec;
      ctx.beginPath(); ctx.arc(sx, sy, e.r, 0, Math.PI * 2); ctx.fill();
      // Mask band
      ctx.fillStyle = '#222a';
      ctx.fillRect(sx - e.r, sy - 3, e.r * 2, 5);
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx - 4, sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 4, sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(sx - 4 + e.dir * 1, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 4 + e.dir * 1, sy, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // Eggs
    for (const e of this.eggs) {
      const sx = e.pos.x - this.cam.x, sy = e.pos.y - this.cam.y;
      ctx.fillStyle = '#f0f0e8';
      ctx.strokeStyle = '#b0a898';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx, sy, 4, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Power-ups
    for (const pu of this.powerUps) {
      if (!pu.alive) continue;
      const sx = pu.pos.x - this.cam.x, sy = pu.pos.y - this.cam.y;
      const bob = Math.sin(pu.phase * 3) * 2;
      ctx.save(); ctx.translate(sx, sy + bob);
      const hw = POWERUP_W / 2;
      // Background glow
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(0, 0, hw + 4, 0, Math.PI * 2); ctx.fill();
      // Box
      ctx.fillStyle = '#222';
      ctx.fillRect(-hw, -hw, POWERUP_W, POWERUP_H);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-hw, -hw, POWERUP_W, POWERUP_H);
      // Icon
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (pu.type === 'highJump') {
        // Up arrow with stripes
        ctx.fillStyle = '#4cc';
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(-5, -1); ctx.lineTo(-2, -1); ctx.lineTo(-2, 3);
        ctx.lineTo(2, 3); ctx.lineTo(2, -1); ctx.lineTo(5, -1);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(6, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, 9); ctx.lineTo(5, 9); ctx.stroke();
      } else if (pu.type === 'speed') {
        // Lightning bolt
        ctx.fillStyle = '#fe0';
        ctx.beginPath();
        ctx.moveTo(2, -9); ctx.lineTo(-3, -1); ctx.lineTo(1, -1); ctx.lineTo(-2, 9);
        ctx.lineTo(5, -1); ctx.lineTo(1, -1);
        ctx.closePath(); ctx.fill();
      } else if (pu.type === 'extraCoins') {
        // Diamond
        ctx.fillStyle = '#4cf';
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff8';
        ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill();
      } else if (pu.type === 'star') {
        // Golden star
        ctx.fillStyle = '#fd0';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          const px = Math.cos(a) * 8;
          const py = Math.sin(a) * 8;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // Players
    for (const p of this.players) p.draw(ctx, this.cam);

    // HUD
    drawHUD(ctx, this.players, this.level, this.theme);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px monospace';
    ctx.fillText(VERSION, 6, H - 6);

    // Overlays
    if (this.screen === 'levelClear') this.drawOverlay(ctx, 'Level Clear!', '#4f4');
    if (this.screen === 'gameOver') this.drawOverlay(ctx, 'Game Over', '#f44');
    if (this.screen === 'victory') this.drawVictory(ctx);
    this.mobile.draw(ctx);
  }

  drawOverlay(ctx: CanvasRenderingContext2D, text: string, color: string) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillText(text, W / 2, H / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    const sub = this.screen === 'levelClear' ? '' : 'Press ENTER to restart';
    if (sub) ctx.fillText(sub, W / 2, H / 2 + 40);
    ctx.restore();
  }

  drawVictory(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 48px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeText('You Win!', W / 2, H / 2 - 40);
    ctx.fillText('You Win!', W / 2, H / 2 - 40);
    ctx.font = '20px monospace';
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      ctx.fillStyle = p.color;
      ctx.fillText(`P${i + 1}: ${p.score} punten`, W / 2, H / 2 + 10 + i * 28);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.fillText('Press ENTER to restart', W / 2, H / 2 + 80);
    ctx.restore();
  }

  drawTitle(ctx: CanvasRenderingContext2D) {
    const t = this.titleTime;
    drawBg(ctx, 'sky', { x: 0, y: 0 } as Camera, W);

    // Ground
    ctx.fillStyle = '#5a8a4a';
    ctx.fillRect(0, H - 60, W, 60);
    ctx.fillStyle = '#4a7a3a';
    ctx.fillRect(0, H - 60, W, 5);

    // Decorative Yoshi characters
    const bobY = Math.sin(t * 2) * 4;
    for (let i = 0; i < 2; i++) {
      const bx = 300 + i * 360, by = H - 90 + bobY;
      ctx.save(); ctx.translate(bx, by);
      const col = i === 0 ? '#4bc84b' : '#f080c0';
      const sad = i === 0 ? '#d04040' : '#8040a0';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -2, 14, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sad;
      ctx.beginPath(); ctx.ellipse(0, -12, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(8, -12, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(10, -15, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(11, -15, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sad;
      ctx.fillRect(-6, 4, 4, 6); ctx.fillRect(2, 4, 4, 6);
      ctx.restore();
    }

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px monospace';
    ctx.fillStyle = '#4bc84b';
    ctx.strokeStyle = '#2a6a2a';
    ctx.lineWidth = 6;
    ctx.strokeText('YORSI', W / 2, 120);
    ctx.fillText('YORSI', W / 2, 120);

    // Subtitle
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#f0d040';
    ctx.strokeStyle = '#8a7a20';
    ctx.lineWidth = 3;
    ctx.strokeText('Yoshi-style Platformer', W / 2, 160);
    ctx.fillText('Yoshi-style Platformer', W / 2, 160);

    // PC/Mobile toggle button (top-right)
    ctx.save();
    const modeBtnX = W - 150, modeBtnY = 55, modeBtnW = 140, modeBtnH = 36;
    const isMobile = this.controlMode === 'mobile';
    ctx.fillStyle = isMobile ? 'rgba(80,200,80,0.3)' : 'rgba(80,80,200,0.3)';
    ctx.strokeStyle = isMobile ? '#4c4' : '#44c';
    ctx.lineWidth = 2;
    ctx.fillRect(modeBtnX, modeBtnY, modeBtnW, modeBtnH);
    ctx.strokeRect(modeBtnX, modeBtnY, modeBtnW, modeBtnH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isMobile ? 'MOBILE' : 'PC', modeBtnX + modeBtnW / 2, modeBtnY + modeBtnH / 2);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('tik om te wisselen', modeBtnX + modeBtnW / 2, modeBtnY + modeBtnH + 14);
    ctx.restore();

    // Menu
    if (isMobile) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#4c4';
      const blink = Math.sin(t * 4) > 0;
      if (blink) {
        ctx.fillText('Tik links voor 1 speler  |  Tik rechts voor 2 spelers', W / 2, 280);
      }
      ctx.font = '14px monospace';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Linkerhelft = joystick  |  Rechterhelft = actieknop (tong/ei)', W / 2, 320);
      ctx.fillText('P2 links  |  P1 rechts (2-spelermodus)', W / 2, 340);
      ctx.fillText('Joystick: ← → lopen, ↑ springen  |  Knop: tong/ei', W / 2, 370);
      ctx.restore();
    } else {
      ctx.font = '20px monospace';
      ctx.fillStyle = '#fff';
      const blink = Math.sin(t * 4) > 0;
      if (blink) {
        ctx.fillText('Druk  1  voor 1 speler   |   Druk  2  voor 2 spelers', W / 2, 280);
      }

      // Controls
      ctx.font = '14px monospace';
      ctx.fillStyle = '#aaa';
      ctx.fillText('P1: Pijlen + ↑(spring) + ↓(tong)', W / 2, 340);
      ctx.fillText('P2: WASD + W(spring) + S(tong)', W / 2, 362);
      ctx.fillText('Eet vijanden met je tong! Schiet eieren! 10 levels!', W / 2, 400);

      // Power-up info
      ctx.font = '13px monospace';
      ctx.fillStyle = '#888';
      ctx.fillText('Power-ups vallen uit de lucht: ↑spring ⚡snelheid ◆munten ★ster', W / 2, 430);
    }
    ctx.restore();
  }

  loop = (now: number) => {
    if (!this._last) this._last = now;
    const dt = Math.min(0.033, (now - this._last) / 1000);
    this._last = now;
    this._acc += dt;
    while (this._acc >= 1 / 60) { this.update(1 / 60); this._acc -= 1 / 60; }
    this.render();
    requestAnimationFrame(this.loop);
  };
  private _last = 0;
  private _acc = 0;

  start() { requestAnimationFrame(this.loop); }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  if (!canvas) { document.body.innerHTML = '<h1>Canvas not found</h1>'; return; }
  const game = new YoshiGame(canvas);
  game.start();
});
