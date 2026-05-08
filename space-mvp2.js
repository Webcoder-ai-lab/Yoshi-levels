// Browser-only MVP (space coop) with level progression
// Controls:
// - P1: Move with Arrow keys; Dock with P; Shoot with L
// - P2: Move with WASD; Dock with R; Shoot with E
// Docking -> MiniShip spawned; main ship stays docked
(function () {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const center = { x: W / 2, y: H / 2 };
  const DOCK_R = 70;
  const DOCK = { x: center.x, y: center.y, r: DOCK_R };

  // Level progression state
  let level = 1;
  let levelTransition = false;
  let levelCountdown = 0;
  let enemies = [];
  function spawnLevel(lvl) {
    enemies.length = 0;
    const count = 2 + (lvl - 1);
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      const x = 80 + t * (W - 160);
      const y = 120 + (i % 4) * 28;
      enemies.push({ x, y, r: 12 });
    }
  }

  // Players
  const p1 = { id: 1, pos: { x: 60, y: H - 60 }, color: '#ffff00', speed: 140, docked: false, mini: null, score: 0 };
  const p2 = { id: 2, pos: { x: W - 60, y: H - 60 }, color: '#4da3ff', speed: 140, docked: false, mini: null, score: 0 };

  const bullets = [];
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Init first level
  spawnLevel(level);

  // Helpers
  function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function spawnMiniForPlayer(p) {
    if (p.mini) return;
    p.docked = true;
    p.mini = { owner: p, pos: { x: DOCK.x, y: DOCK.y - 20 }, color: p.color, speed: 180, r: 8, cooldown: 0, lastShot: 0 };
  }

  function shootBullet(owner, x, y) {
    bullets.push({ pos: { x, y }, vel: { x: 0, y: -260 }, ownerId: owner.id, color: owner.color });
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // P1 controls (Arrow keys)
    if (!p1.docked) {
      if (keys['ArrowLeft']) p1.pos.x -= p1.speed * dt;
      if (keys['ArrowRight']) p1.pos.x += p1.speed * dt;
      if (keys['ArrowUp']) p1.pos.y -= p1.speed * dt;
      if (keys['ArrowDown']) p1.pos.y += p1.speed * dt;
      p1.pos.x = clamp(p1.pos.x, 12, W - 12);
      p1.pos.y = clamp(p1.pos.y, 12, H - 12);
      if (dist(p1.pos, DOCK) <= DOCK.r && keys['KeyP']) {
        spawnMiniForPlayer(p1);
      }
    } else if (p1.mini) {
      const m = p1.mini;
      if (keys['ArrowLeft']) m.pos.x -= m.speed * dt;
      if (keys['ArrowRight']) m.pos.x += m.speed * dt;
      if (keys['ArrowUp']) m.pos.y -= m.speed * dt;
      if (keys['ArrowDown']) m.pos.y += m.speed * dt;
      m.pos.x = clamp(m.pos.x, 0, W);
      m.pos.y = clamp(m.pos.y, 0, H);
      if (keys['KeyL'] && (Date.now() - m.lastShot > 250)) {
        shootBullet(p1, m.pos.x, m.pos.y);
        m.lastShot = Date.now();
      }
    }

    // P2 controls (WASD)
    if (!p2.docked) {
      if (keys['KeyA']) p2.pos.x -= p2.speed * dt;
      if (keys['KeyD']) p2.pos.x += p2.speed * dt;
      if (keys['KeyW']) p2.pos.y -= p2.speed * dt;
      if (keys['KeyS']) p2.pos.y += p2.speed * dt;
      p2.pos.x = clamp(p2.pos.x, 12, W - 12);
      p2.pos.y = clamp(p2.pos.y, 12, H - 12);
      if (dist(p2.pos, DOCK) <= DOCK.r && keys['KeyR']) {
        spawnMiniForPlayer(p2);
      }
    } else if (p2.mini) {
      const m = p2.mini;
      if (keys['KeyA']) m.pos.x -= m.speed * dt;
      if (keys['KeyD']) m.pos.x += m.speed * dt;
      if (keys['KeyW']) m.pos.y -= m.speed * dt;
      if (keys['KeyS']) m.pos.y += m.speed * dt;
      m.pos.x = clamp(m.pos.x, 0, W);
      m.pos.y = clamp(m.pos.y, 0, H);
      if (keys['KeyE'] && (Date.now() - m.lastShot > 250)) {
        shootBullet(p2, m.pos.x, m.pos.y);
        m.lastShot = Date.now();
      }
    }

    // Bullet movement & collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (dist(b.pos, { x: e.x, y: e.y }) < 8 + e.r) {
          enemies.splice(j, 1);
          const ownerP = (b.ownerId === 1) ? p1 : p2;
          ownerP.score += 100;
          bullets.splice(i, 1);
          break;
        }
      }
      if (bullets[i] && (bullets[i].pos.x < 0 || bullets[i].pos.x > W || bullets[i].pos.y < 0 || bullets[i].pos.y > H)) {
        bullets.splice(i, 1);
      }
    }

    // Enemies chase the mini if exists else center
    enemies.forEach(e => {
      let target = DOCK;
      if (p1.mini) target = p1.mini.pos;
      if (p2.mini) target = p2.mini.pos;
      const dx = target.x - e.x, dy = target.y - e.y;
      const m = Math.hypot(dx, dy) || 1;
      e.x += (dx / m) * 40 * dt;
      e.y += (dy / m) * 40 * dt;
    });

    // Level progression: if all enemies defeated, wait 2 seconds and go to next level
    if (enemies.length === 0) {
      if (!levelTransition) {
        levelTransition = true;
        levelCountdown = 2; // seconds
      } else {
        levelCountdown -= dt;
        if (levelCountdown <= 0) {
          levelTransition = false;
          level++;
          spawnLevel(level);
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // Dock zone
    ctx.strokeStyle = '#f3d11a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(DOCK.x, DOCK.y, DOCK.r, 0, Math.PI * 2); ctx.stroke();

    // Draw players (always visible main ship unless in a MiniShip)
    if (p1.mini) {
      ctx.fillStyle = p1.mini.color; ctx.beginPath(); ctx.arc(p1.mini.pos.x, p1.mini.pos.y, 8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = p1.color; ctx.beginPath(); ctx.arc(p1.pos.x, p1.pos.y, 12, 0, Math.PI * 2); ctx.fill();
    }

    if (p2.mini) {
      ctx.fillStyle = p2.mini.color; ctx.beginPath(); ctx.arc(p2.mini.pos.x, p2.mini.pos.y, 8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = p2.color; ctx.beginPath(); ctx.arc(p2.pos.x, p2.pos.y, 12, 0, Math.PI * 2); ctx.fill();
    }

    // Bullets
    bullets.forEach(b => { ctx.fillStyle = '#fff'; ctx.fillRect(b.pos.x - 2, b.pos.y - 2, 4, 4); });
    // Enemies
    enemies.forEach(e => { ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); });

    // HUD
    ctx.fillStyle = '#0f0'; ctx.font = '14px monospace';
    ctx.fillText('P1 Score: ' + p1.score, 10, 20);
    ctx.fillText('P2 Score: ' + p2.score, 10, 40);

    // Level overlay during transitions
    if (levelTransition) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = '48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Level ' + level, W / 2, H / 2);
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  loop(performance.now());
})();
