// Space Station 2P MVP - skeleton (Web Canvas, local coop)
// Controls:
// - Player 1: Arrow keys to move, Dock with L, Shoot with Space
// - Player 2: WASD to move, Dock with E, Shoot with KeyK
// Docking flow: when a player overlaps the central DockZone and presses their dock key,
// a MiniShip is spawned for that player and control shifts to the MiniShip in space.

type Vec2 = { x: number; y: number };

enum GameState {
  Docking,
  InSpace,
  GameOver,
}

enum PlayerId {
  P1 = 1,
  P2 = 2,
}

class InputManager {
  private keys = new Set<string>();
  // Bindings (codes)
  private move: Record<PlayerId, { up: string; down: string; left: string; right: string }>; // movement
  private dock: Record<PlayerId, string>;
  private shoot: Record<PlayerId, string>;

  constructor() {
    // Movement bindings
    this.move = {
      [PlayerId.P1]: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
      [PlayerId.P2]: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
    };
    // Docking bindings (as per updated spec: P1 dock with P, P2 dock with R)
    this.dock = {
      [PlayerId.P1]: 'KeyP', // P1 docks with P
      [PlayerId.P2]: 'KeyR', // P2 docks with R
    } as any;
    // Shooting bindings (updated spec: P1 with L, P2 with E)
    this.shoot = {
      [PlayerId.P1]: 'KeyL', // P1 shoots with L
      [PlayerId.P2]: 'KeyE', // P2 shoots with E
    } as any;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  getMoveDir(pid: PlayerId): Vec2 {
    const dir = { x: 0, y: 0 };
    const m = this.move[pid];
    if (!m) return dir;
    if (this.isDown(m.left)) dir.x -= 1;
    if (this.isDown(m.right)) dir.x += 1;
    if (this.isDown(m.up)) dir.y -= 1;
    if (this.isDown(m.down)) dir.y += 1;
    // Normalize diagonal movement to keep speed consistent
    const mag = Math.hypot(dir.x, dir.y);
    if (mag > 0) {
      dir.x /= mag;
      dir.y /= mag;
    }
    return dir;
  }

  isDockPressed(pid: PlayerId): boolean {
    return this.isDown(this.dock[pid]);
  }

  isShootPressed(pid: PlayerId): boolean {
    return this.isDown(this.shoot[pid]);
  }
}

class DockZone {
  pos: Vec2;
  r: number;
  constructor(x: number, y: number, r: number) {
    this.pos = { x, y };
    this.r = r;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = '#f3d11a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

class Player {
  id: PlayerId;
  pos: Vec2;
  vel: Vec2;
  r: number;
  color: string;
  docked: boolean;
  hasMini: boolean;
  score: number;
  constructor(id: PlayerId, x: number, y: number, r: number, color: string) {
    this.id = id;
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.r = r;
    this.color = color;
    this.docked = false;
    this.hasMini = false;
    this.score = 0;
  }
  update(input: InputManager, dt: number, dockZone: DockZone, canvas: HTMLCanvasElement) {
    if (this.docked) return; // waiting for boarding to complete
    const dir = input.getMoveDir(this.id);
    const speed = 120; // px/s
    this.vel.x = dir.x * speed;
    this.vel.y = dir.y * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    // Clamp to canvas bounds
    this.pos.x = Math.max(this.r, Math.min(canvas.width - this.r, this.pos.x));
    this.pos.y = Math.max(this.r, Math.min(canvas.height - this.r, this.pos.y));
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class MiniShip {
  owner: Player;
  pos: Vec2;
  vel: Vec2;
  r: number;
  color: string;
  constructor(owner: Player, x: number, y: number, color: string) {
    this.owner = owner;
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.r = 8;
    this.color = color;
  }
  update(input: InputManager, dt: number) {
    // MiniShip inherits the same controls as the owner, but a simpler, tighter control
    const dir = input.getMoveDir(this.owner.id);
    const speed = 180;
    this.vel.x = dir.x * speed;
    this.vel.y = dir.y * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Enemy {
  pos: Vec2;
  vel: Vec2;
  r: number = 10;
  color = '#f00';
  hp = 1;
  alive = true;
  constructor(x: number, y: number) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
  }
  update(targets: Vec2[], dt: number) {
    if (targets.length === 0) return;
    // Move toward the closest target (simple AI)
    const t = targets[0];
    const dx = t.x - this.pos.x;
    const dy = t.y - this.pos.y;
    const mag = Math.hypot(dx, dy) || 1;
    const sp = 60;
    this.vel.x = (dx / mag) * sp;
    this.vel.y = (dy / mag) * sp;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: InputManager;
  private dockZone: DockZone;
  private players: [Player, Player];
  private miniShips: MiniShip[] = [];
  private enemies: Enemy[] = [];
  private state: GameState = GameState.Docking;
  private lastTime = 0;
  private acc = 0;
  private static readonly FIXED_DT = 1 / 60;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.input = new InputManager();
    // Dock is centered
    this.dockZone = new DockZone(canvas.width / 2, canvas.height / 2, 60);
    // Two players with distinct colors
    this.players = [
      new Player(PlayerId.P1, 120, canvas.height - 120, 12, '#4db8ff'), // P1 uses Arrow keys + L
      new Player(PlayerId.P2, canvas.width - 120, canvas.height - 120, 12, '#ffd24d'), // P2 uses WASD + E
    ];
    // Seed a couple of enemies
    this.enemies.push(new Enemy(200, 120));
    this.enemies.push(new Enemy(600, 100));
  }

  start() {
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(now: number) {
    if (!this.lastTime) this.lastTime = now;
    const dt = Math.min(0.033, (now - this.lastTime) / 1000);
    this.lastTime = now;
    // Fixed timestep integration
    this.acc += dt;
    while (this.acc >= Game.FIXED_DT) {
      this.update(Game.FIXED_DT);
      this.acc -= Game.FIXED_DT;
    }
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    // Docking phase: update players normally, check for docking presses
    for (const p of this.players) {
      p.update(this.input, dt, this.dockZone, this.canvas);
      // Docking trigger
      if (!p.docked && this.input.isDockPressed(p.id)) {
        const dx = p.pos.x - this.dockZone.pos.x;
        const dy = p.pos.y - this.dockZone.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= this.dockZone.r) {
          p.docked = true;
          // Spawn mini ship near dock zone, in space behind the dock
          const color = p.id === PlayerId.P1 ? '#66ccff' : '#ffcc00';
          const mini = new MiniShip(p, this.dockZone.pos.x, this.dockZone.pos.y, color);
          // Slight offset to place the mini-ship near the dock
          mini.pos.x = this.dockZone.pos.x;
          mini.pos.y = this.dockZone.pos.y - 20;
          this.miniShips.push(mini);
          // After boarding, the player can control the MiniShip in space
          p.hasMini = true;
          // In this MVP we keep the player in place at the dock
        }
      }
    }
    // Update minis
    for (const m of this.miniShips) {
      m.update(this.input, dt);
    }
    // Enemies simple AI follow first player or first mini ship
    const targets: Vec2[] = [];
    if (this.miniShips.length > 0) {
      targets.push(this.miniShips[0].pos);
    } else {
      // Fallback to dock center
      targets.push(this.dockZone.pos);
    }
    for (const e of this.enemies) {
      e.update(targets, dt);
    }
  }

  private render() {
    // Clear
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Dock zone / station (simple placeholder)
    this.dockZone.draw(this.ctx);

    // Draw Players (circles)
    for (const p of this.players) p.draw(this.ctx);
    // Draw Minis
    for (const m of this.miniShips) m.draw(this.ctx);
    // Draw Enemies
    for (const e of this.enemies) e.draw(this.ctx);

    // HUD (scores)
    this.ctx.save();
    this.ctx.fillStyle = '#0f0';
    this.ctx.font = '14px monospace';
    this.ctx.fillText(`P1 Score: ${this.players[0].score}`, 10, 20);
    this.ctx.fillText(`P2 Score: ${this.players[1].score}`, 10, 40);
    this.ctx.restore();
  }
}

// Bootstrapping helper: if the HTML page loaded, start the game.
window.addEventListener('load', () => {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  // Lightweight compatibility: ensure the bundle exists (will be provided by the first real patch)
  // If not, render an informative message
  // @ts-ignore
  const g = new Game(canvas);
  // @ts-ignore
  g.start();
});
