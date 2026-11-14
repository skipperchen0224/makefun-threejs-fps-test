// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. The player fights with four Ember bots against five Slate bots across rounds;
// the charge must be planted at A or B, or the other team eliminated.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createMatch, PLANT_SECONDS, DEFUSE_SECONDS } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const weapon = createWeapon(camera);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(world.colliders, { x: -24, z: 0, yaw: -Math.PI / 2 });

const raycaster = new THREE.Raycaster();
raycaster.far = 95;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let started = false;
let buyOpen = false;
let spectating = null;
let plantProgress = 0;
let shake = 0;
let targetSite = 'A';
let lastBeepSecond = -1;
const markerHoldMs = shot ? 4000 : 90;
const grenades = [];
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 });

// The planted charge and the dropped charge, as small boxes with a blinking light.
const bombMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.45, 0.25, 0.3),
  new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.5, emissive: 0x550000 }),
);
bombMesh.visible = false;
scene.add(bombMesh);
const bombLight = new THREE.PointLight(new THREE.Color(0xff2a2a), 0, 8, 2);
scene.add(bombLight);

const match = createMatch(onMatchEvent);

function onMatchEvent(type, data) {
  if (type === 'roundStart') {
    setupRound();
    hud.showBanner(`Round ${data.round}`, targetSite === 'A' ? 'Charge to plant: Site A' : 'Charge to plant: Site B');
  } else if (type === 'live') {
    hud.showBanner('Go', 'Plant the charge or eliminate Slate');
  } else if (type === 'roundEnd') {
    const won = data.winner === 'ember';
    hud.showBanner(won ? 'Round won' : 'Round lost', data.reason);
    if (won) audio.roundWin(); else audio.roundLose();
    bombMesh.visible = false;
    bombLight.intensity = 0;
    hud.clearBomb();
    spectating = null;
  } else if (type === 'matchEnd') {
    const won = data.winner === 'ember';
    const text = data.winner === 'draw'
      ? `Draw — ${data.scoreEmber} : ${data.scoreSlate}`
      : `${won ? 'Ember wins the match' : 'Slate wins the match'} — ${data.scoreEmber} : ${data.scoreSlate}`;
    hud.showOverlay('matchEnd', text);
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (type === 'planted') {
    const site = data.site === 'A' ? world.siteA : world.siteB;
    bombMesh.position.set(site.x, 0.15, site.z);
    bombMesh.visible = true;
    hud.setBombPlanted(data.fuse);
    audio.plantBeep();
  } else if (type === 'bombDropped') {
    bombMesh.position.set(data.pos.x, 0.15, data.pos.z);
    bombMesh.visible = true;
  } else if (type === 'bombPickedUp') {
    bombMesh.visible = false;
  }
}

function setupRound() {
  targetSite = random() < 0.5 ? 'A' : 'B';
  const other = targetSite === 'A' ? 'B' : 'A';
  player.reset({ x: -24, z: 0, yaw: -Math.PI / 2 });
  player.state.armor = 0;
  weapon.refill();
  spectating = null;
  plantProgress = 0;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  bots.spawnRound();
  const ember = bots.bots.filter((b) => b.team === 'ember');
  const slate = bots.bots.filter((b) => b.team === 'slate');
  const toTarget = targetSite === 'A' ? ['toA', 'toAMid'] : ['toB', 'toBMid'];
  const toOther = other === 'A' ? ['toA', 'toAMid'] : ['toB', 'toBMid'];
  bots.setRoute(ember[0], world.routes[toTarget[Math.floor(random() * 2)]]);
  bots.setRoute(ember[1], world.routes[toOther[Math.floor(random() * 2)]]);
  bots.setRoute(ember[2], world.routes[toTarget[Math.floor(random() * 2)]]);
  bots.setRoute(ember[3], ['emberSpawn', 'midWest']);
  bots.setRoute(slate[0], ['slateSpawn', 'northLane', 'siteAApproach', 'siteA']);
  bots.setRoute(slate[1], ['slateSpawn', 'southLane', 'siteBApproach', 'siteB']);
  bots.setRoute(slate[2], ['slateSpawn', 'northLane', 'aHold']);
  bots.setRoute(slate[3], ['slateSpawn', 'southLane', 'bHold']);
  bots.setRoute(slate[4], ['slateSpawn', 'midEast']);
  hud.setHealth(100, 0);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.state.id);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.scoreEmber, match.state.scoreSlate, match.state.round);
  hud.clearBomb();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (!buyOpen && match.state.phase !== 'matchEnd') {
    if (!player.state.alive) hud.showOverlay('dead', '');
    else hud.showOverlay(started ? 'paused' : 'start', '');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (match.state.phase === 'matchEnd') {
    match.startMatch();
    setupRound();
  }
  if (!player.state.alive) {
    spectating = bots.aliveOf('ember')[0] || null;
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

const ownedGuns = new Set(['rifle', 'pistol']);

hud.onBuy((id) => {
  if (match.state.phase !== 'buy') return;
  if (id === 'grenade') {
    const r = match.buyGrenade();
    if (r.ok) weapon.state.grenades += 1;
  } else if (id === 'armor') {
    const r = match.buyArmor();
    if (r.ok) player.state.armor = 100;
  } else {
    const r = match.buyWeapon(id, weapon.state.id);
    if (r.ok) { weapon.equip(id); ownedGuns.add(id); }
  }
  hud.renderBuy(match.state.money, weapon.state.id);
  hud.setMoney(match.state.money);
  hud.setWeapon(weapon.state.id);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  audio.click();
});

function syncCamera() {
  if (spectating) {
    camera.position.set(spectating.position.x, spectating.position.y + 1.55, spectating.position.z);
    camera.rotation.set(0, spectating.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state;
  let sx = 0;
  let sy = 0;
  if (shake > 0) {
    sx = (random() - 0.5) * shake * 0.05;
    sy = (random() - 0.5) * shake * 0.05;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + sy, body.yaw + sx, 0, 'YXZ');
  const targetFov = body.aiming ? 55 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function addTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat);
  scene.add(line);
  tracers.push({ line, left: 0.07 });
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = world.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const muzzlePos = camera.position.clone().add(direction.clone().multiplyScalar(0.6));
  if (hit) {
    addTracer(muzzlePos, hit.point);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const part = hit.object.userData.part;
      const d = weapon.def();
      const dmg = part === 'head' ? d.headDamage : d.damage;
      const killed = bots.damage(bot, dmg, part);
      hud.hitMarker(killed, markerHoldMs);
      if (killed) {
        match.awardKill();
        hud.feed('You', bot.name, part === 'head');
        audio.kill();
        if (bot.role === 'carrier' && match.state.bomb === 'carried' && match.state.carrier === 'bot') {
          match.dropBomb(bot.position);
        }
      } else {
        audio.hit();
      }
    }
  } else {
    addTracer(muzzlePos, camera.position.clone().add(direction.clone().multiplyScalar(60)));
  }
  audio.shot(weapon.state.id);
  const d = weapon.def();
  player.recoil(d.recoilPitch + random() * 0.004, (random() * 2 - 1) * d.recoilYaw);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setCrosshairSpread(spread * 900);
  return true;
}

function throwGrenade() {
  if (!weapon.takeGrenade()) return;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.6, metalness: 0.4 }),
  );
  mesh.position.copy(camera.position).add(direction.clone().multiplyScalar(0.5));
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: 1.6,
  });
  audio.click();
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const pos = g.mesh.position;
  audio.explosion();
  shake = 1.2;
  const flash = new THREE.PointLight(new THREE.Color(0xffa040), 60, 14, 1.5);
  flash.position.copy(pos);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 180);
  const victims = [];
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - pos.x, bot.position.y + 1 - pos.y, bot.position.z - pos.z);
    if (d < 6.5) victims.push({ bot, d });
  }
  for (const { bot, d } of victims) {
    const dmg = Math.max(15, Math.round(110 * (1 - d / 6.5)));
    const killed = bots.damage(bot, dmg, 'body');
    if (killed) {
      match.awardKill();
      hud.feed('You', bot.name, false);
      if (bot.role === 'carrier' && match.state.bomb === 'carried') match.dropBomb(bot.position);
    }
  }
  const pd = Math.hypot(player.state.position.x - pos.x, player.state.position.y + 1 - pos.y, player.state.position.z - pos.z);
  if (pd < 6.5 && player.state.alive) {
    const dmg = Math.max(10, Math.round(90 * (1 - pd / 6.5)));
    player.damage(dmg);
    hud.damageFlash();
    hud.setHealth(player.state.health, player.state.armor);
    audio.hurt();
    if (!player.state.alive) onPlayerDeath();
  }
}

function onPlayerDeath() {
  match.state.deaths += 1;
  hud.showOverlay('dead', '');
  if (document.pointerLockElement) document.exitPointerLock();
  if (match.state.carrier === 'player' && match.state.bomb === 'carried') {
    match.dropBomb(player.state.position);
  }
}

function botShotCtx() {
  return {
    time: elapsed,
    playerPos: player.state.position,
    playerAlive: player.state.alive,
    playerSpeed: player.groundSpeed(),
    bombState: match.state.bomb,
    targetSite,
    plantedSite: match.state.bombSite,
    onBotShot(bot, from, end, hit, headshot, enemy) {
      audio.enemyShot();
      if (!hit || !enemy) return;
      if (enemy.kind === 'player') {
        if (!player.state.alive) return;
        const dmg = headshot ? 55 : 22 + Math.floor(random() * 10);
        player.damage(dmg);
        hud.damageFlash();
        hud.setHealth(player.state.health, player.state.armor);
        audio.hurt();
        if (!player.state.alive) onPlayerDeath();
      } else if (enemy.bot && enemy.bot.alive) {
        const dmg = headshot ? 70 : 26;
        const killed = bots.damage(enemy.bot, dmg, headshot ? 'head' : 'body');
        if (killed) {
          hud.feed(bot.name, enemy.bot.name, headshot);
          if (enemy.bot.role === 'carrier' && match.state.bomb === 'carried' && match.state.carrier === 'bot') {
            match.dropBomb(enemy.bot.position);
          }
        }
      }
    },
    onChannel(bot, kind, t) {
      if (kind === 'plant') {
        const site = Math.hypot(bot.position.x - world.siteA.x, bot.position.z - world.siteA.z) < Math.hypot(bot.position.x - world.siteB.x, bot.position.z - world.siteB.z) ? 'A' : 'B';
        if (t >= PLANT_SECONDS) {
          match.plant(site);
          return true;
        }
        if (Math.floor(t * 2) !== lastBeepSecond) {
          lastBeepSecond = Math.floor(t * 2);
          audio.plantBeep();
        }
        return false;
      }
      if (kind === 'defuse') {
        if (t >= DEFUSE_SECONDS) {
          match.defuse();
          return true;
        }
        return false;
      }
      return false;
    },
  };
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 2.5);
  const alive = {
    ember: (player.state.alive ? 1 : 0) + bots.aliveOf('ember').length,
    slate: bots.aliveOf('slate').length,
  };
  match.step(dt, alive);

  if (match.state.phase === 'buy') {
    // Freeze time: nobody moves or shoots, but the weapon may finish a reload.
    weapon.step(dt);
    hud.step(dt);
    return;
  }
  if (match.state.phase === 'live') {
    player.step(dt, input.state.keys);
    player.state.aiming = input.state.aiming && player.state.alive;
    weapon.step(dt);
    bots.step(dt, botShotCtx());

    // Dropped charge: anyone on Ember walking over it picks it up.
    if (match.state.bomb === 'dropped' && match.state.bombPos) {
      const bp = match.state.bombPos;
      if (player.state.alive && Math.hypot(player.state.position.x - bp.x, player.state.position.z - bp.z) < 1.6) {
        match.pickupBomb(true);
      } else {
        for (const b of bots.aliveOf('ember')) {
          if (Math.hypot(b.position.x - bp.x, b.position.z - bp.z) < 1.6) {
            match.pickupBomb(false);
            break;
          }
        }
      }
    }

    // Planting: the carrier holds E inside a site ring.
    if (match.state.bomb === 'carried' && match.state.carrier === 'player' && player.state.alive) {
      const site = Math.hypot(player.state.position.x - world.siteA.x, player.state.position.z - world.siteA.z) < Math.hypot(player.state.position.x - world.siteB.x, player.state.position.z - world.siteB.z) ? world.siteA : world.siteB;
      const siteName = site === world.siteA ? 'A' : 'B';
      const d = Math.hypot(player.state.position.x - site.x, player.state.position.z - site.z);
      if (d < site.radius && input.state.keys.has('KeyE')) {
        plantProgress += dt;
        hud.showPrompt(`Planting the charge at Site ${siteName} — hold E`, plantProgress / PLANT_SECONDS);
        if (Math.floor(plantProgress * 2) !== lastBeepSecond) {
          lastBeepSecond = Math.floor(plantProgress * 2);
          audio.plantBeep();
        }
        if (plantProgress >= PLANT_SECONDS) {
          match.plant(siteName);
          plantProgress = 0;
          hud.hidePrompt();
        }
      } else {
        plantProgress = 0;
        hud.hidePrompt();
      }
    } else {
      hud.hidePrompt();
    }

    // Grenades fly, bounce once, and blow on their fuse.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const next = g.mesh.position.clone().add(g.vel.clone().multiplyScalar(dt));
      const probe = new THREE.Box3();
      probe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
      probe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
      if (world.colliders.some((c) => probe.intersectsBox(c))) {
        g.vel.multiplyScalar(-0.35);
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        audio.bounce();
      } else {
        g.mesh.position.copy(next);
      }
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        grenades.splice(i, 1);
        explodeGrenade(g);
      }
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].left -= dt;
      if (tracers[i].left <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    // Planted charge blinks and counts down on the HUD.
    if (match.state.bomb === 'planted') {
      hud.setBombPlanted(match.state.fuse);
      bombLight.intensity = 6 + 6 * Math.sin(elapsed * 8);
      bombLight.position.copy(bombMesh.position).add(new THREE.Vector3(0, 0.5, 0));
    }
  }
  hud.step(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.state.alive && !spectating) player.look(look.x, look.y);
    if (input.state.firing && player.state.alive && !spectating && weapon.ready() && match.state.phase === 'live') {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed(), !player.state.onGround, player.state.aiming));
    }
    if (input.state.keys.has('KeyR') && player.state.alive) {
      if (weapon.reload()) { audio.reload(); hud.setAmmo(weapon.state.mag, weapon.state.reserve); }
    }
    if (input.takePressed('KeyG') && player.state.alive && match.state.phase === 'live') throwGrenade();
    if (input.takePressed('KeyB') && match.state.phase === 'buy') {
      buyOpen = !buyOpen;
      if (buyOpen) {
        hud.renderBuy(match.state.money, weapon.state.id);
        hud.showBuy(true);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        hud.showBuy(false);
        input.requestLock();
      }
    }
    // Number keys buy while the menu is open; 1/2/3 also swap weapons mid-round.
    for (const [code, id] of [['Digit1', 'rifle'], ['Digit2', 'smg'], ['Digit3', 'pistol']]) {
      if (input.takePressed(code)) {
        if (buyOpen) {
          const r = match.buyWeapon(id, weapon.state.id);
          if (r.ok) { weapon.equip(id); ownedGuns.add(id); }
          hud.renderBuy(match.state.money, weapon.state.id);
          hud.setMoney(match.state.money);
          hud.setWeapon(weapon.state.id);
          hud.setAmmo(weapon.state.mag, weapon.state.reserve);
        } else if (match.state.phase === 'live' && weapon.state.id !== id) {
          // Swapping mid-round only works for a gun already owned this round.
          if (id === 'pistol' || ownedGuns.has(id)) weapon.equip(id);
          hud.setWeapon(weapon.state.id);
          hud.setAmmo(weapon.state.mag, weapon.state.reserve);
        }
      }
    }
    if (input.takePressed('Digit4') && buyOpen) {
      const r = match.buyGrenade();
      if (r.ok) weapon.state.grenades += 1;
      hud.renderBuy(match.state.money, weapon.state.id);
    }
    if (input.takePressed('Digit5') && buyOpen) {
      const r = match.buyArmor();
      if (r.ok) player.state.armor = 100;
      hud.renderBuy(match.state.money, weapon.state.id);
      hud.setHealth(player.state.health, player.state.armor);
    }
    let accumulator = frameAccumulator;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    frameAccumulator = accumulator;
    syncCamera();
    input.endFrame();
  }
  renderer.render(scene, camera);
}

let frameAccumulator = 0;
let lastTime = performance.now();

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  match.startMatch();
  setupRound();
  // Buy phase skipped for the capture: jump straight into the live round.
  match.state.phase = 'live';
  match.state.phaseTime = 100;
  if (name === 'start') {
    player.state.position.set(-23, 0, 0);
    player.state.yaw = -Math.PI / 2;
    player.state.pitch = 0.01;
    hud.showOverlay('start', '');
    syncCamera();
    paintTwiceThenReady();
    return;
  }
  if (name === 'play') {
    // Mid-round firefight: player on mid lane, an enemy in the sights, one kill.
    // The sightline passes north of the furnace block, clear of the mid walls.
    player.state.position.set(-8, 0, 0);
    settle(150);
    const enemy = bots.bots.find((b) => b.team === 'slate' && b.alive);
    if (enemy) {
      enemy.position.set(6, 0, -4);
      enemy.group.position.copy(enemy.position);
      tmpVec.set(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
      aimAt(tmpVec);
      for (let i = 0; i < 4 && enemy.alive; i += 1) {
        shoot(0);
        settle(6);
      }
      settle(20);
    }
    hud.setScore(0, 0, 1);
    hud.setHealth(player.state.health, player.state.armor);
    paintTwiceThenReady();
    return;
  }
  // end: the round is won — charge planted at A, banner up, Ember ahead.
  match.state.scoreEmber = 1;
  match.state.round = 1;
  const site = world.siteA;
  bombMesh.position.set(site.x, 0.15, site.z);
  bombMesh.visible = true;
  match.state.bomb = 'planted';
  match.state.bombSite = 'A';
  player.state.position.set(-12, 0, -6);
  settle(240);
  match.state.fuse = 28;
  tmpVec.set(site.x, 1.2, site.z);
  aimAt(tmpVec);
  hud.setScore(1, 0, 1);
  hud.setBombPlanted(28);
  hud.showBanner('Round won', 'The charge detonated — Site A is ours.');
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

match.startMatch();
setupRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
