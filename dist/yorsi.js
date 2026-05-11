// Yorsi — Yoshi-inspired platformer, 1-2 players, 10 levels, 5 themes
// Controls: P1 Pijlen+↑spring+↓tong  |  P2 WASD+Wspring+Stong
(function() {
  var W = 960, H = 540, VERSION = 'v1.2';
  var GRAVITY = 850, JUMP_V = -370, FLUTTER_V = -80, MAX_FLUTTER = 0.45;
  var MOVE_SPD = 170, TONGUE_RNG = 55, TONGUE_TIME = 0.25;
  var EGG_SPD = 320, ENEMY_SPD = 45, PLAYER_R = 13;
  var POWERUP_FALL_SPD = 70, POWERUP_DURATION = 8, POWERUP_SPAWN_INTERVAL = 4.5, POWERUP_LIFETIME = 10, POWERUP_W = 22, POWERUP_H = 22;

  var THEME = {
    jungle: { sky: ['#0d2810','#1a4a20','#2d6a3a'], ground:'#3a2a1a', plat:'#5a6a2a', accent:'#6aba4a', ec:'#4a9a3a' },
    desert: { sky: ['#3a2010','#5a3a1a','#8a6a3a'], ground:'#7a5a3a', plat:'#a89858', accent:'#d4a040', ec:'#c04040' },
    snow:   { sky: ['#1a2a4a','#3a5a7a','#6a9aba'], ground:'#b8c8d8', plat:'#d8e8f0', accent:'#8ab8d8', ec:'#6090b8' },
    volcano:{ sky: ['#1a0808','#3a1410','#5a2018'], ground:'#2a1810', plat:'#5a2a1a', accent:'#e04020', ec:'#d03050' },
    sky:    { sky: ['#0a1a3a','#2a4a7a','#4a7aaa'], ground:'#7aaaca', plat:'#b8d8f0', accent:'#f0d840', ec:'#c09830' },
  };
  var THEME_LIST = ['jungle','desert','snow','volcano','sky'];

  // Seeded random
  var _seed = 1;
  function srand(s) { if (s !== undefined) _seed = s; return (_seed = (_seed * 16807) % 2147483647) / 2147483646; }

  // --- Input ----------------------------------------------------------------
  function Input() {
    this.held = {}; this.pressed = {};
    var self = this;
    window.addEventListener('keydown', function(e) {
      if (!self.held[e.code]) self.pressed[e.code] = true;
      self.held[e.code] = true; e.preventDefault();
    });
    window.addEventListener('keyup', function(e) {
      delete self.held[e.code]; e.preventDefault();
    });
  }
  Input.prototype.down = function(c) { return !!this.held[c]; };
  Input.prototype.just = function(c) { return !!this.pressed[c]; };
  Input.prototype.endFrame = function() { this.pressed = {}; };

  // --- Camera ---------------------------------------------------------------
  function Camera() { this.x = 0; this.y = 0; }
  Camera.prototype.follow = function(players, lw) {
    var cx = 0, cy = 0, n = 0;
    for (var i = 0; i < players.length; i++) {
      var p = players[i]; if (p.lives <= 0) continue;
      cx += p.pos.x; cy += p.pos.y; n++;
    }
    if (!n) return; cx /= n; cy /= n;
    this.x = Math.max(0, Math.min(lw - W, cx - W / 2));
    this.y = Math.max(-40, Math.min(40, cy - H / 2));
  };

  // --- Platform -------------------------------------------------------------
  function Platform(r, moving, range, spd) {
    this.r = { x: r.x, y: r.y, w: r.w, h: r.h };
    this.mx = r.x;
    this.moving = moving || false;
    this.range = range || 0;
    this.spd = spd || 0;
    this.dir = 1;
  }
  Platform.prototype.update = function(dt) {
    if (!this.moving) return;
    this.r.x += this.spd * this.dir * dt;
    if (Math.abs(this.r.x - this.mx) >= this.range) this.dir *= -1;
  };

  // --- Coin -----------------------------------------------------------------
  function Coin(x, y) { this.pos = { x: x, y: y }; this.phase = 0; this.taken = false; }
  Coin.prototype.update = function(dt) { this.phase += dt * 3; };

  // --- Enemy ----------------------------------------------------------------
  function Enemy(x, y, range) {
    this.pos = { x: x, y: y }; this.startX = x; this.dir = -1;
    this.range = range || 60; this.alive = true; this.respawn = 0; this.r = 11;
  }
  Enemy.prototype.update = function(dt) {
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) { this.alive = true; this.pos.x = this.startX; }
      return;
    }
    this.pos.x += this.dir * ENEMY_SPD * dt;
    if (Math.abs(this.pos.x - this.startX) >= this.range) this.dir *= -1;
  };

  // --- PowerUp --------------------------------------------------------------
  function PowerUp(x, y, type) {
    this.pos = { x: x, y: y }; this.type = type;
    this.alive = true; this.grounded = false; this.lifetime = POWERUP_LIFETIME; this.phase = 0;
  }
  PowerUp.prototype.update = function(dt, plats) {
    this.phase += dt;
    if (this.grounded) { this.lifetime -= dt; if (this.lifetime <= 0) this.alive = false; return; }
    this.pos.y += POWERUP_FALL_SPD * dt;
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i].r;
      if (this.pos.x + POWERUP_W / 2 > r.x && this.pos.x - POWERUP_W / 2 < r.x + r.w &&
          this.pos.y + POWERUP_W / 2 > r.y && this.pos.y - POWERUP_W / 2 < r.y + r.h) {
        this.pos.y = r.y - POWERUP_W / 2; this.grounded = true; break;
      }
    }
    if (this.pos.y > H + 100) this.alive = false;
  };

  // --- Egg ------------------------------------------------------------------
  function Egg(x, y, dir) {
    this.pos = { x: x, y: y }; this.vel = { x: dir * EGG_SPD, y: -220 };
    this.alive = true; this.bnc = 0;
  }
  Egg.prototype.update = function(dt, plats, enemies, owner) {
    this.vel.y += GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i].r;
      if (this.pos.x + 6 > r.x && this.pos.x - 6 < r.x + r.w &&
          this.pos.y + 6 > r.y && this.pos.y - 6 < r.y + r.h) {
        if (this.vel.y > 0) { this.vel.y = -this.vel.y * 0.4; this.pos.y = r.y - 6; }
        else { this.vel.x = -this.vel.x * 0.4; }
        this.bnc++; if (this.bnc > 3) { this.alive = false; break; }
      }
    }
    for (var j = 0; j < enemies.length; j++) {
      var e = enemies[j];
      if (!e.alive) continue;
      if (Math.hypot(this.pos.x - e.pos.x, this.pos.y - e.pos.y) < 6 + e.r) {
        e.alive = false; e.respawn = 3; owner.score += 200; this.alive = false; break;
      }
    }
    if (this.pos.x < -50 || this.pos.x > 6000 || this.pos.y > 700) this.alive = false;
  };

  // --- Player (Yoshi) -------------------------------------------------------
  function Player(id, x, y, color, saddle, moveL, moveR, jumpKey, actKey) {
    this.pos = { x: x, y: y }; this.vel = { x: 0, y: 0 };
    this.facing = 1; this.grounded = false; this.flutter = 0; this.phase = 0;
    this.hasEgg = false; this.tongue = false; this.tongueT = 0;
    this.lives = 3; this.score = 0; this.invinc = 0;
    this.powerUp = null;
    this.ghostTimer = 0; this.justRevived = false; this._prevLives = 3;
    this.color = color; this.saddle = saddle;
    this.moveL = moveL; this.moveR = moveR; this.jumpKey = jumpKey; this.actKey = actKey;
    this.id = id;
  }
  Player.prototype.update = function(dt, inp, plats, coins, enemies, eggs, lw) {
    // Ghost flight
    if (this.ghostTimer > 0) {
      this.ghostTimer -= dt;
      var mx = 0, my = 0;
      if (inp.down(this.moveL)) mx -= 1;
      if (inp.down(this.moveR)) mx += 1;
      if (inp.down(this.jumpKey)) my -= 1;
      if (inp.down(this.actKey)) my += 1;
      var spd = 150;
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

    var mx = 0;
    if (inp.down(this.moveL)) mx -= 1;
    if (inp.down(this.moveR)) mx += 1;
    if (mx !== 0) this.facing = mx;
    this.vel.x = mx * (this.powerUp && this.powerUp.type === 'speed' ? MOVE_SPD * 1.6 : MOVE_SPD);

    if (inp.just(this.jumpKey) && this.grounded) {
      this.vel.y = this.powerUp && this.powerUp.type === 'highJump' ? JUMP_V * 1.6 : JUMP_V;
      this.grounded = false;
      this.flutter = this.powerUp && this.powerUp.type === 'highJump' ? MAX_FLUTTER * 1.5 : MAX_FLUTTER;
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
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i].r;
      if (this.pos.x + PLAYER_R > r.x && this.pos.x - PLAYER_R < r.x + r.w &&
          this.pos.y + PLAYER_R > r.y && this.pos.y - PLAYER_R < r.y + r.h) {
        var ot  = (this.pos.y + PLAYER_R) - r.y;
        var ob  = (r.y + r.h) - (this.pos.y - PLAYER_R);
        var ol  = (this.pos.x + PLAYER_R) - r.x;
        var orr = (r.x + r.w) - (this.pos.x - PLAYER_R);
        var m = Math.min(ot, ob, ol, orr);
        if (m === ot && this.vel.y >= 0)    { this.pos.y = r.y - PLAYER_R; this.vel.y = 0; this.grounded = true; }
        else if (m === ob && this.vel.y < 0) { this.pos.y = r.y + r.h + PLAYER_R; this.vel.y = 0; }
        else if (m === ol && this.vel.x >= 0) { this.pos.x = r.x - PLAYER_R; this.vel.x = 0; }
        else if (m === orr && this.vel.x <= 0) { this.pos.x = r.x + r.w + PLAYER_R; this.vel.x = 0; }
      }
    }

    // Coins
    for (var k = 0; k < coins.length; k++) {
      var c = coins[k];
      if (c.taken) continue;
      if (Math.hypot(this.pos.x - c.pos.x, this.pos.y - c.pos.y) < PLAYER_R + 7) {
        c.taken = true; this.score += 50;
      }
    }

    // Action
    if (inp.just(this.actKey)) {
      if (this.hasEgg) {
        eggs.push(new Egg(this.pos.x + this.facing * 18, this.pos.y - 4, this.facing));
        this.hasEgg = false;
      } else {
        this.tongue = true; this.tongueT = TONGUE_TIME;
      }
    }
    if (this.tongue) {
      this.tongueT -= dt;
      var tip = { x: this.pos.x + this.facing * TONGUE_RNG, y: this.pos.y - 4 };
      this.tongueTip = tip;
      for (var m = 0; m < enemies.length; m++) {
        var e = enemies[m];
        if (!e.alive) continue;
        if (Math.hypot(tip.x - e.pos.x, tip.y - e.pos.y) < 16) {
          e.alive = false; e.respawn = 3; this.hasEgg = true; this.score += 200; this.tongue = false; break;
        }
      }
      if (this.tongueT <= 0) this.tongue = false;
    }

    // Enemy contact
    for (var n = 0; n < enemies.length; n++) {
      var e2 = enemies[n];
      if (!e2.alive || this.invinc > 0) continue;
      if (Math.hypot(this.pos.x - e2.pos.x, this.pos.y - e2.pos.y) < PLAYER_R + e2.r) {
        if ((this.powerUp && this.powerUp.type === 'star') || (this.vel.y > 0 && this.pos.y < e2.pos.y - e2.r)) {
          e2.alive = false; e2.respawn = 3; this.score += 200;
          if (this.vel.y > 0) this.vel.y = JUMP_V * 0.5;
        } else { this.die(); }
      }
    }

    if (this.pos.x < -50) this.pos.x = -50;
    if (this.pos.x > lw + 50) this.pos.x = lw + 50;
    if (this.pos.y > H + 200) this.die();
    if (this.pos.y < -400) this.pos.y = -400;
  };
  Player.prototype.die = function() {
    if (this.invinc > 0) return;
    this.lives--;
    if (this.lives <= 0) return;
    this.pos.x = 80; this.pos.y = 80; this.vel.x = 0; this.vel.y = 0; this.invinc = 2;
  };
  Player.prototype.draw = function(ctx, cam) {
    if (this.lives <= 0 && this.ghostTimer <= 0) return;
    if (!this.ghostTimer && this.invinc > 0 && Math.floor(this.invinc * 8) % 2 === 0) return;
    var sx = this.pos.x - cam.x, sy = this.pos.y - cam.y;

    ctx.save(); ctx.translate(sx, sy);
    if (this.ghostTimer > 0) ctx.globalAlpha = 0.55;
    if (this.ghostTimer > 0) { ctx.fillStyle = 'rgba(100,150,255,0.15)'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); }

    // Disco effect (only star power-up)
    var origColor = this.color;
    if (this.powerUp && this.powerUp.type === 'star') {
      var hue = (this.powerUp.timer * 120) % 360;
      this.color = 'hsl(' + hue + ', 100%, 60%)';
    }

    // Tail
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(-this.facing * 10, 2, 7, 4, -this.facing * 0.3, 0, Math.PI * 2); ctx.fill();

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
    if (this.powerUp && this.powerUp.type === 'highJump' && !this.grounded) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      for (var pi = 0; pi < 3; pi++) {
        var ax = -7 + pi * 7;
        var ay = 10 + Math.sin(this.phase * 20 + pi * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(ax, ay + 5); ctx.lineTo(ax, ay);
        ctx.lineTo(ax - 3, ay + 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(ax + 3, ay + 2); ctx.stroke();
      }
    }
    if (this.powerUp && this.powerUp.type === 'speed' && Math.abs(this.vel.x) > 10) {
      ctx.strokeStyle = '#fe0';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (var si = 0; si < 2; si++) {
        var lx = -this.facing * 14 - si * 7;
        var ly = -2 + si * 5;
        ctx.beginPath();
        ctx.moveTo(lx, ly - 4); ctx.lineTo(lx - 1, ly);
        ctx.lineTo(lx + 1, ly); ctx.lineTo(lx - 1, ly + 4);
        ctx.stroke();
      }
    }

    if (this.powerUp) this.color = origColor;
    ctx.restore();
  };

  // --- Level Generator ------------------------------------------------------
  function genLevel(num) {
    var theme = THEME_LIST[(num - 1) % 5];
    var diff = 1 + Math.floor((num - 1) / 5);
    srand(num * 1337 + 42);

    var lw = 2000 + num * 200 + srand() * 200;
    var baseY = H - 70;
    var plats = [], enemies = [], coins = [];

    // Ground segments with gaps
    var x = 0;
    while (x < lw) {
      var segW;
      if (x > 0 && diff >= 1 && num >= 2 && srand() < 0.12 * diff) {
        x += 40 + srand() * 40 * diff;
        segW = 200 + srand() * 300;
      } else {
        segW = 300 + srand() * 300;
      }
      segW = Math.min(segW, lw - x);
      if (segW < 20) break;
      plats.push(new Platform({ x: x, y: baseY, w: segW, h: 40 }));
      x += segW;
    }

    // Floating platforms
    var nPlats = 6 + num * 2 + Math.floor(srand() * 4);
    for (var i = 0; i < nPlats; i++) {
      var px = 200 + srand() * (lw - 400);
      var py = baseY - 50 - srand() * 120;
      var pw = 50 + srand() * 80;
      var ph = 14;
      var moving = false, range = 0, spd = 0;
      if (num >= 3 && srand() < 0.2 * diff) { moving = true; range = 30 + srand() * 40; spd = 30 + srand() * 30; }
      plats.push(new Platform({ x: px, y: py, w: pw, h: ph }, moving, range, spd));
    }

    // Enemies
    var nEnemies = 1 + num + Math.floor(srand() * 2);
    for (var j = 0; j < nEnemies; j++) {
      var pi = Math.floor(srand() * plats.length);
      var p = plats[pi];
      var ex = p.r.x + 20 + srand() * (p.r.w - 40);
      var ey = p.r.y - 12;
      var er = Math.min(40, p.r.w / 2 - 5);
      enemies.push(new Enemy(ex, ey, Math.max(20, er)));
    }

    // Coins
    var nCoins = 5 + num * 2 + Math.floor(srand() * 5);
    for (var k = 0; k < nCoins; k++) {
      var pi2 = Math.floor(srand() * plats.length);
      var p2 = plats[pi2];
      coins.push(new Coin(p2.r.x + srand() * p2.r.w, p2.r.y - 20 - srand() * 50));
    }

    return { theme: theme, lw: lw, plats: plats, enemies: enemies, coins: coins, flagX: lw - 120, baseY: baseY };
  }

  // --- Drawing Helpers -------------------------------------------------------
  function drawBg(ctx, theme, cam, lw) {
    var t = THEME[theme];
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, t.sky[0]);
    grad.addColorStop(0.5, t.sky[1]);
    grad.addColorStop(1, t.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    var offset = cam.x * 0.15;
    ctx.fillStyle = t.sky[1];
    for (var i = 0; i < 8; i++) {
      var bx = ((i * 200 + 50 - offset) % (W + 200) + W + 200) % (W + 200) - 100;
      var by = 40 + (i % 3) * 60;
      if (theme === 'snow' || theme === 'sky') {
        ctx.beginPath(); ctx.arc(bx, by, 15 + (i % 4) * 8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(bx, by + 15); ctx.lineTo(bx - 20, by - 5); ctx.lineTo(bx + 20, by - 5);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFlag(ctx, cam, x, baseY) {
    var sx = x - cam.x, sy = baseY - cam.y;
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(sx - 2, sy - 60, 4, 60);
    ctx.fillStyle = '#f0d040';
    ctx.beginPath();
    ctx.moveTo(sx + 2, sy - 55); ctx.lineTo(sx + 30, sy - 45); ctx.lineTo(sx + 2, sy - 35);
    ctx.closePath(); ctx.fill();
  }

  function drawHUD(ctx, players, level, theme) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
    ctx.strokeText('Level ' + level, 12, 26);
    ctx.fillText('Level ' + level, 12, 26);

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var y = 46 + i * 22;
      ctx.strokeText('P' + (i+1) + ': ' + p.score + '  \u2665' + p.lives, 12, y);
      ctx.fillStyle = p.color;
      ctx.fillText('P' + (i+1) + ': ' + p.score + '  \u2665' + p.lives, 12, y);
    }
    ctx.restore();
  }

  // --- Main Game ------------------------------------------------------------
  function YorsiGame(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.inp = new Input();
    this.screen = 'title';
    this.numPlayers = 1;
    this.players = [];
    this.plats = []; this.coins = []; this.enemies = []; this.eggs = []; this.powerUps = [];
    this.cam = new Camera();
    this.level = 1; this.lw = 0; this.flagX = 0; this.baseY = 0; this.theme = 'jungle';
    this.clearTimer = 0; this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL;
    this.titleTime = 0;
    this._last = 0; this._acc = 0;
    canvas.focus();
  }

  YorsiGame.prototype.startLevel = function() {
    var g = genLevel(this.level);
    this.theme = g.theme; this.lw = g.lw; this.flagX = g.flagX;
    this.baseY = g.baseY;
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
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.lives > 0) { p.pos.x = 60 + (p.id - 1) * 80; p.pos.y = 60; p.vel.x = 0; p.vel.y = 0; p.grounded = false; }
    }
  };

  YorsiGame.prototype.update = function(dt) {
    this.titleTime += dt;

    if (this.screen === 'title') {
      if (this.inp.just('Digit1') || this.inp.just('Numpad1') || this.inp.just('Enter')) {
        this.numPlayers = 1; this.level = 1; this.screen = 'playing';
        this.players = []; this.startLevel();
      } else if (this.inp.just('Digit2') || this.inp.just('Numpad2')) {
        this.numPlayers = 2; this.level = 1; this.screen = 'playing';
        this.players = []; this.startLevel();
      }
      this.inp.endFrame();
      return;
    }

    if (this.screen === 'gameOver' || this.screen === 'victory') {
      if (this.inp.just('Enter') || this.inp.just('Space')) {
        this.screen = 'title'; this.players = [];
      }
      this.inp.endFrame(); return;
    }

    if (this.screen === 'levelClear') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        this.level++;
        if (this.level > 10) { this.screen = 'victory'; }
        else { this.screen = 'playing'; this.startLevel(); }
      }
      this.inp.endFrame(); return;
    }

    // Playing
    for (var i = 0; i < this.plats.length; i++) this.plats[i].update(dt);
    for (var j = 0; j < this.coins.length; j++) this.coins[j].update(dt);
    for (var k = 0; k < this.enemies.length; k++) this.enemies[k].update(dt);

    // Power-ups
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL + Math.random() * 2;
      var r2 = Math.random();
      var type;
      if (r2 < 0.4) type = 'highJump';
      else if (r2 < 0.7) type = 'speed';
      else if (r2 < 0.9) type = 'extraCoins';
      else type = 'star';
      this.powerUps.push(new PowerUp(80 + Math.random() * (this.lw - 160), -20, type));
    }
    for (var pi = this.powerUps.length - 1; pi >= 0; pi--) {
      var pu = this.powerUps[pi];
      pu.update(dt, this.plats);
      if (!pu.alive) { this.powerUps.splice(pi, 1); continue; }
      for (var pl = 0; pl < this.players.length; pl++) {
        var pp = this.players[pl];
        if (pp.lives <= 0) continue;
        if (Math.hypot(pp.pos.x - pu.pos.x, pp.pos.y - pu.pos.y) < PLAYER_R + POWERUP_W / 2) {
          pu.alive = false;
          if (pu.type === 'extraCoins') {
            for (var j2 = 0; j2 < 6; j2++) {
              var cx = pu.pos.x + (Math.random() - 0.5) * 200;
              var cy = pu.pos.y - 30 - Math.random() * 80;
              this.coins.push(new Coin(cx, cy));
            }
            pp.score += 100;
          } else {
            pp.powerUp = { type: pu.type, timer: POWERUP_DURATION };
          }
          this.powerUps.splice(pi, 1);
          break;
        }
      }
    }

    for (var m = this.eggs.length - 1; m >= 0; m--) {
      this.eggs[m].update(dt, this.plats, this.enemies, this.players[0]);
      if (!this.eggs[m].alive) this.eggs.splice(m, 1);
    }
    for (var n = 0; n < this.players.length; n++)
      this.players[n].update(dt, this.inp, this.plats, this.coins, this.enemies, this.eggs, this.lw);

    // Ghost system (2-player)
    if (this.numPlayers >= 2) {
      for (var g = 0; g < this.players.length; g++) {
        var gp = this.players[g];
        if (gp.lives < gp._prevLives && gp.ghostTimer === 0) {
          gp.ghostTimer = 5;
          gp.vel.x = 0; gp.vel.y = 0;
          for (var go2 = 0; go2 < this.players.length; go2++) {
            var other2 = this.players[go2];
            if (other2 !== gp && other2.lives > 0) { gp.pos.x = other2.pos.x + (other2.id === 1 ? 30 : -30); gp.pos.y = other2.pos.y; break; }
          }
        }
        gp._prevLives = gp.lives;
        if (gp.justRevived) {
          gp.justRevived = false;
          for (var go = 0; go < this.players.length; go++) {
            var other = this.players[go];
            if (other !== gp && other.lives > 0) {
              gp.pos.x = other.pos.x + (other.id === 1 ? 40 : -40);
              gp.pos.y = other.pos.y - 10;
              break;
            }
          }
        }
      }
    }

    this.cam.follow(this.players, this.lw);

    var aliveCount = 0, ghostCount = 0;
    for (var a = 0; a < this.players.length; a++) {
      if (this.players[a].lives > 0) aliveCount++;
      if (this.players[a].ghostTimer > 0) ghostCount++;
    }
    if (aliveCount === 0 && ghostCount === 0) { this.screen = 'gameOver'; this.inp.endFrame(); return; }

    for (var b = 0; b < this.players.length; b++) {
      var p = this.players[b];
      if (p.lives <= 0) continue;
      if (p.pos.x >= this.flagX) { this.screen = 'levelClear'; this.clearTimer = 2; break; }
    }

    this.inp.endFrame();
  };

  YorsiGame.prototype.render = function() {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    if (this.screen === 'title') { this.drawTitle(ctx); return; }

    drawBg(ctx, this.theme, this.cam, this.lw);

    // Ground
    ctx.fillStyle = THEME[this.theme].ground;
    for (var i = 0; i < this.plats.length; i++) {
      var p = this.plats[i];
      if (p.r.h >= 30) {
        var sx = p.r.x - this.cam.x, sy = p.r.y - this.cam.y;
        ctx.fillRect(sx, sy, p.r.w, p.r.h);
        ctx.fillStyle = THEME[this.theme].plat;
        ctx.fillRect(sx, sy, p.r.w, 4);
        ctx.fillStyle = THEME[this.theme].ground;
      }
    }

    // Platforms
    for (var j = 0; j < this.plats.length; j++) {
      var p2 = this.plats[j];
      if (p2.r.h < 30) {
        var sx2 = p2.r.x - this.cam.x, sy2 = p2.r.y - this.cam.y;
        ctx.fillStyle = THEME[this.theme].plat;
        ctx.fillRect(sx2, sy2, p2.r.w, p2.r.h);
        ctx.fillStyle = THEME[this.theme].accent;
        ctx.fillRect(sx2, sy2, p2.r.w, 3);
      }
    }

    drawFlag(ctx, this.cam, this.flagX, this.baseY);

    // Coins
    for (var k = 0; k < this.coins.length; k++) {
      var c = this.coins[k]; if (c.taken) continue;
      var sx3 = c.pos.x - this.cam.x, sy3 = c.pos.y - this.cam.y + Math.sin(c.phase) * 3;
      ctx.fillStyle = '#f0d040';
      ctx.beginPath(); ctx.arc(sx3, sy3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8a020';
      ctx.beginPath(); ctx.arc(sx3, sy3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8';
      ctx.beginPath(); ctx.arc(sx3 - 1.5, sy3 - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Enemies
    for (var m = 0; m < this.enemies.length; m++) {
      var e = this.enemies[m]; if (!e.alive) continue;
      var sx4 = e.pos.x - this.cam.x, sy4 = e.pos.y - this.cam.y;
      ctx.fillStyle = THEME[this.theme].ec;
      ctx.beginPath(); ctx.arc(sx4, sy4, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222a';
      ctx.fillRect(sx4 - e.r, sy4 - 3, e.r * 2, 5);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx4 - 4, sy4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx4 + 4, sy4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(sx4 - 4 + e.dir, sy4, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx4 + 4 + e.dir, sy4, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // Eggs
    for (var n = 0; n < this.eggs.length; n++) {
      var eg = this.eggs[n];
      var sx5 = eg.pos.x - this.cam.x, sy5 = eg.pos.y - this.cam.y;
      ctx.fillStyle = '#f0f0e8'; ctx.strokeStyle = '#b0a898'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx5, sy5, 4, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Power-ups
    for (var pu = 0; pu < this.powerUps.length; pu++) {
      var p = this.powerUps[pu];
      if (!p.alive) continue;
      var sx6 = p.pos.x - this.cam.x, sy6 = p.pos.y - this.cam.y;
      var bob = Math.sin(p.phase * 3) * 2;
      ctx.save(); ctx.translate(sx6, sy6 + bob);
      var hw = POWERUP_W / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(0, 0, hw + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-hw, -hw, POWERUP_W, POWERUP_H);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-hw, -hw, POWERUP_W, POWERUP_H);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (p.type === 'highJump') {
        ctx.fillStyle = '#4cc';
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(-5, -1); ctx.lineTo(-2, -1); ctx.lineTo(-2, 3);
        ctx.lineTo(2, 3); ctx.lineTo(2, -1); ctx.lineTo(5, -1);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(6, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, 9); ctx.lineTo(5, 9); ctx.stroke();
      } else if (p.type === 'speed') {
        ctx.fillStyle = '#fe0';
        ctx.beginPath();
        ctx.moveTo(2, -9); ctx.lineTo(-3, -1); ctx.lineTo(1, -1); ctx.lineTo(-2, 9);
        ctx.lineTo(5, -1); ctx.lineTo(1, -1);
        ctx.closePath(); ctx.fill();
      } else if (p.type === 'extraCoins') {
        ctx.fillStyle = '#4cf';
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff8';
        ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'star') {
        ctx.fillStyle = '#fd0';
        ctx.beginPath();
        for (var si = 0; si < 5; si++) {
          var a2 = (si * 4 * Math.PI) / 5 - Math.PI / 2;
          var px2 = Math.cos(a2) * 8;
          var py2 = Math.sin(a2) * 8;
          si === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // Players
    for (var t = 0; t < this.players.length; t++) this.players[t].draw(ctx, this.cam);

    drawHUD(ctx, this.players, this.level, this.theme);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px monospace';
    ctx.fillText(VERSION, 6, H - 6);

    if (this.screen === 'levelClear') this.drawOverlay(ctx, 'Level Clear!', '#4f4');
    if (this.screen === 'gameOver') this.drawOverlay(ctx, 'Game Over', '#f44');
    if (this.screen === 'victory') this.drawVictory(ctx);
  };

  YorsiGame.prototype.drawOverlay = function(ctx, text, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillText(text, W / 2, H / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    if (this.screen !== 'levelClear') ctx.fillText('Press ENTER to restart', W / 2, H / 2 + 40);
    ctx.restore();
  };

  YorsiGame.prototype.drawVictory = function(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 48px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
    ctx.strokeText('You Win!', W / 2, H / 2 - 40);
    ctx.fillText('You Win!', W / 2, H / 2 - 40);
    ctx.font = '20px monospace';
    for (var vi = 0; vi < this.players.length; vi++) {
      var vp = this.players[vi];
      ctx.fillStyle = vp.color;
      ctx.fillText('P' + (vi + 1) + ': ' + vp.score + ' punten', W / 2, H / 2 + 10 + vi * 28);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.fillText('Press ENTER to restart', W / 2, H / 2 + 80);
    ctx.restore();
  };

  YorsiGame.prototype.drawTitle = function(ctx) {
    var t = this.titleTime;
    drawBg(ctx, 'sky', { x: 0, y: 0 }, W);

    ctx.fillStyle = '#5a8a4a';
    ctx.fillRect(0, H - 60, W, 60);
    ctx.fillStyle = '#4a7a3a';
    ctx.fillRect(0, H - 60, W, 5);

    var bobY = Math.sin(t * 2) * 4;
    for (var i = 0; i < 2; i++) {
      var bx = 300 + i * 360, by = H - 90 + bobY;
      ctx.save(); ctx.translate(bx, by);
      var col = i === 0 ? '#4bc84b' : '#f080c0';
      var sad = i === 0 ? '#d04040' : '#8040a0';
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

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px monospace';
    ctx.fillStyle = '#4bc84b';
    ctx.strokeStyle = '#2a6a2a'; ctx.lineWidth = 6;
    ctx.strokeText('YORSI', W / 2, 120);
    ctx.fillText('YORSI', W / 2, 120);

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#f0d040';
    ctx.strokeStyle = '#8a7a20'; ctx.lineWidth = 3;
    ctx.strokeText('Yoshi-style Platformer', W / 2, 160);
    ctx.fillText('Yoshi-style Platformer', W / 2, 160);

    ctx.font = '20px monospace';
    ctx.fillStyle = '#fff';
    if (Math.sin(t * 4) > 0) {
      ctx.fillText('Press  1  for 1 Player   |   Press  2  for 2 Players', W / 2, 280);
    }

    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('P1: Pijlen + \u2191(spring) + \u2193(tong)', W / 2, 340);
    ctx.fillText('P2: WASD + W(spring) + S(tong)', W / 2, 362);
    ctx.fillText('Eet vijanden met je tong! Schiet eieren! 10 levels!', W / 2, 400);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('Power-ups vallen uit de lucht: \u2191spring \u26a1snelheid \u25c6munten \u2605ster', W / 2, 430);
    ctx.restore();
  };

  YorsiGame.prototype.loop = function(now) {
    if (!this._last) this._last = now;
    var dt = Math.min(0.033, (now - this._last) / 1000);
    this._last = now;
    this._acc += dt;
    while (this._acc >= 1 / 60) { this.update(1 / 60); this._acc -= 1 / 60; }
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  };
  YorsiGame.prototype.start = function() { requestAnimationFrame(this.loop.bind(this)); };

  // --- Boot ------------------------------------------------------------------
  window.addEventListener('load', function() {
    var canvas = document.getElementById('c');
    if (!canvas) { document.body.innerHTML = '<h1>Canvas not found</h1>'; return; }
    var game = new YorsiGame(canvas);
    game.start();
  });
})();
