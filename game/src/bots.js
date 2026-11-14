// Bots: the other nine players. Each bot is a body with a head hitbox, a gun, health
// and a small brain: walk a route to a site, hold an angle, engage what it sees,
// and carry the bomb objective. Attackers plant; defenders retake and defuse.
// A bot only shoots what it can see (a ray against the world's walls), after a
// reaction delay, with accuracy that falls off with distance and target speed —
// so stopping, peeking and crossfire matter on both sides.
import * as THREE from 'three';

const BOT_SPEED = 3.4;
const BOT_RADIUS = 0.36;
const BOT_HEIGHT = 1.72;
const REACTION_MIN = 0.45;
const REACTION_MAX = 0.9;
const BURST_MIN = 3;
const BURST_MAX = 6;
const SHOT_GAP = 0.13;
const BURST_PAUSE = 0.9;

const EMBER_NAMES = ['Ash', 'Coal', 'Flint', 'Spark'];
const SLATE_NAMES = ['Rook', 'Vane', 'Moss', 'Pike', 'Wren'];

function makeBody(color) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), suit);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.6;
  head.userData.part = 'head';
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.28), dark);
  legs.position.y = 0.36;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.22, 1.15, -0.25);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.3, 0.34), dark);
  vest.position.y = 1.2;
  group.add(torso, head, legs, gun, vest);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  torso.userData.part = 'body';
  legs.userData.part = 'body';
  return { group, head, torso, legs };
}

export function createBots(scene, world, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const bots = [];
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.85 });
  const enemyTracerMat = new THREE.LineBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.85 });

  function spawnBot(team, name, spawn, role) {
    const color = team === 'ember' ? 0xd98a2b : 0x5a8ab0;
    const { group, head, torso, legs } = makeBody(color);
    group.position.copy(spawn);
    scene.add(group);
    const bot = {
      team, name, role,
      group, head, torso, legs,
      position: group.position,
      yaw: 0, pitch: 0,
      health: 100, alive: true,
      route: [], routeIndex: 0, holdUntil: 0,
      target: null, seenAt: -10, reaction: 0,
      burstLeft: 0, shotTimer: 0, pauseTimer: 0,
      channel: null, channelTime: 0,
      speed: BOT_SPEED * (0.92 + random() * 0.16),
      accuracy: 0.42 + random() * 0.14,
      scanDir: random() * Math.PI * 2,
      lastShotAt: -10,
      mover: new THREE.Vector3(),
    };
    head.userData.bot = bot;
    torso.userData.bot = bot;
    legs.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function spawnRound() {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    const e = world.waypoints.emberSpawn;
    const s = world.waypoints.slateSpawn;
    const emberSpawns = [
      new THREE.Vector3(e.x - 1.5, 0, e.z - 2), new THREE.Vector3(e.x - 1.5, 0, e.z + 2),
      new THREE.Vector3(e.x + 1, 0, e.z - 3), new THREE.Vector3(e.x + 1, 0, e.z + 3),
    ];
    const slateSpawns = [
      new THREE.Vector3(s.x + 1.5, 0, s.z - 2), new THREE.Vector3(s.x + 1.5, 0, s.z + 2),
      new THREE.Vector3(s.x - 1, 0, s.z - 3), new THREE.Vector3(s.x - 1, 0, s.z + 3),
      new THREE.Vector3(s.x, 0, s.z),
    ];
    EMBER_NAMES.forEach((name, i) => spawnBot('ember', name, emberSpawns[i], i === 0 ? 'carrier' : 'rifle'));
    SLATE_NAMES.forEach((name, i) => spawnBot('slate', name, slateSpawns[i], 'rifle'));
    return bots;
  }

  function losClear(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function eyePos(bot) {
    return new THREE.Vector3(bot.position.x, bot.position.y + 1.55, bot.position.z);
  }

  function setRoute(bot, keys) {
    bot.route = keys.map((k) => world.waypoints[k]);
    bot.routeIndex = 0;
    bot.channel = null;
  }

  function moveToward(bot, target, dt, speedScale = 1) {
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = bot.speed * speedScale * dt;
    const nx = bot.position.x + (dx / dist) * Math.min(stepLen, dist);
    const nz = bot.position.z + (dz / dist) * Math.min(stepLen, dist);
    // Axis-separated slide against the world, like the player.
    const probe = new THREE.Box3();
    probe.min.set(nx - BOT_RADIUS, bot.position.y + 0.05, bot.position.z - BOT_RADIUS);
    probe.max.set(nx + BOT_RADIUS, bot.position.y + BOT_HEIGHT - 0.05, bot.position.z + BOT_RADIUS);
    const hitX = world.colliders.some((c) => probe.intersectsBox(c));
    if (!hitX) bot.position.x = nx;
    probe.min.set(bot.position.x - BOT_RADIUS, bot.position.y + 0.05, nz - BOT_RADIUS);
    probe.max.set(bot.position.x + BOT_RADIUS, bot.position.y + BOT_HEIGHT - 0.05, nz + BOT_RADIUS);
    const hitZ = world.colliders.some((c) => probe.intersectsBox(c));
    if (!hitZ) bot.position.z = nz;
    bot.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    bot.group.rotation.y = bot.yaw;
    return dist <= 0.7;
  }

  function addTracer(from, to, enemy) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, enemy ? enemyTracerMat : tracerMat);
    scene.add(line);
    tracers.push({ line, left: 0.09 });
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function aliveOf(team) {
    return bots.filter((b) => b.team === team && b.alive);
  }

  // One bot's brain, run at the fixed step. ctx carries the match: player state,
  // bomb state, time, and callbacks for shots, kills and the bomb.
  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    const now = ctx.time;
    bot.shotTimer -= dt;
    bot.pauseTimer -= dt;

    // Find a visible enemy: the player or the nearest living enemy bot.
    let enemy = null;
    let enemyPos = null;
    const eye = eyePos(bot);
    const candidates = [];
    if (ctx.playerAlive) candidates.push({ pos: new THREE.Vector3(ctx.playerPos.x, ctx.playerPos.y + 1.3, ctx.playerPos.z), kind: 'player', dist: 0 });
    for (const other of bots) {
      if (other.team !== bot.team && other.alive) {
        candidates.push({ pos: new THREE.Vector3(other.position.x, other.position.y + 1.3, other.position.z), kind: 'bot', bot: other, dist: 0 });
      }
    }
    let bestDist = Infinity;
    for (const c of candidates) {
      c.dist = eye.distanceTo(c.pos);
      if (c.dist > 70) continue;
      // Facing: within a 100-degree cone, or very close.
      const to = new THREE.Vector3().subVectors(c.pos, eye).normalize();
      const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      const facing = to.dot(forward);
      if (c.dist > 4 && facing < 0.2) continue;
      if (!losClear(eye, c.pos)) continue;
      if (c.dist < bestDist) { bestDist = c.dist; enemy = c; enemyPos = c.pos; }
    }

    if (enemy) {
      bot.target = enemy;
      bot.seenAt = now;
      bot.reaction = bot.reaction || REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
      // Face the enemy.
      const dx = enemyPos.x - bot.position.x;
      const dz = enemyPos.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.group.rotation.y = bot.yaw;
      // Fire in bursts after the reaction delay.
      if (now - bot.seenAt > bot.reaction && bot.pauseTimer <= 0) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN));
          bot.pauseTimer = 0;
        }
        if (bot.shotTimer <= 0 && bot.burstLeft > 0) {
          bot.shotTimer = SHOT_GAP;
          bot.burstLeft -= 1;
          if (bot.burstLeft <= 0) bot.pauseTimer = BURST_PAUSE;
          bot.lastShotAt = now;
          const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.4, bot.position.z);
          // Hit chance: base accuracy, worse far away and against a moving target.
          const targetSpeed = enemy.kind === 'player' ? ctx.playerSpeed : 2.5;
          const p = Math.max(0.06, bot.accuracy - bestDist * 0.006 - targetSpeed * 0.03);
          const hit = random() < p;
          const headshot = hit && random() < 0.14;
          const end = hit ? enemyPos.clone() : enemyPos.clone().add(new THREE.Vector3((random() - 0.5) * 2, (random() - 0.5) * 1.5, (random() - 0.5) * 2));
          addTracer(from, end, bot.team === 'slate');
          ctx.onBotShot(bot, from, end, hit, headshot, enemy);
        }
      }
    } else {
      bot.target = null;
      bot.reaction = 0;
    }

    // Objective behaviour when nothing is in front of the bot.
    if (!enemy) {
      if (bot.channel) {
        bot.channelTime += dt;
        if (ctx.onChannel(bot, bot.channel, bot.channelTime)) {
          bot.channel = null;
          bot.channelTime = 0;
        }
        return;
      }
      // Carrier plants when it stands on its site; defenders defuse a planted bomb.
      if (bot.team === 'ember' && bot.role === 'carrier' && ctx.bombState === 'carried') {
        const site = ctx.targetSite === 'A' ? world.siteA : world.siteB;
        const d = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
        if (d < site.radius && losClear(eye, new THREE.Vector3(site.x, 1, site.z))) {
          const defendersNear = aliveOf('slate').some((b) => Math.hypot(b.position.x - site.x, b.position.z - site.z) < 9);
          if (!defendersNear) {
            bot.channel = 'plant';
            bot.channelTime = 0;
            return;
          }
        }
      }
      if (bot.team === 'slate' && ctx.bombState === 'planted') {
        const site = ctx.plantedSite === 'A' ? world.siteA : world.siteB;
        const d = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
        if (d < 2.2) {
          bot.channel = 'defuse';
          bot.channelTime = 0;
          return;
        }
      }
      // Walk the route; at the end, hold and scan.
      if (bot.routeIndex < bot.route.length) {
        const arrived = moveToward(bot, bot.route[bot.routeIndex], dt);
        if (arrived) bot.routeIndex += 1;
      } else {
        bot.holdUntil = Math.max(bot.holdUntil, now + 0.5);
        bot.scanDir += dt * 0.5;
        bot.yaw = bot.scanDir;
        bot.group.rotation.y = bot.yaw;
      }
    }
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].left -= dt;
      if (tracers[i].left <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  function hitMeshes() {
    const meshes = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      meshes.push(bot.head, bot.torso, bot.legs);
    }
    return meshes;
  }

  return { bots, spawnRound, setRoute, step, damage, aliveOf, hitMeshes, losClear, eyePos };
}
