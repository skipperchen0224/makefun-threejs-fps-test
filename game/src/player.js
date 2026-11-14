// Player movement and health: acceleration, friction, gravity, crouch and jump,
// resolved as a box against the world's colliders one axis at a time, so a wall never
// swallows the player. Health lives here; damage and death are main.js's job.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const AIM_SPEED = 3.1;
const GROUND_ACCEL = 46;
const AIR_ACCEL = 10;
const GRAVITY = 22;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders, spawn) {
  const player = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    aiming: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    const scale = player.aiming ? 0.55 : 1;
    player.yaw -= dx * sensitivity * scale;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity * scale));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function groundSpeed() {
    return Math.hypot(player.velocity.x, player.velocity.z);
  }

  // Damage: armour absorbs 60% of each hit until it breaks. Returns the damage taken.
  function damage(amount) {
    if (!player.alive) return 0;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest * 0.6);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.health = Math.max(0, player.health - rest);
    if (player.health <= 0) player.alive = false;
    return rest;
  }

  function reset(spawnPoint) {
    player.position.set(spawnPoint.x, 0, spawnPoint.z);
    player.velocity.set(0, 0, 0);
    player.yaw = spawnPoint.yaw ?? 0;
    player.pitch = 0;
    player.health = 100;
    player.alive = true;
    player.crouching = false;
    player.height = STAND_HEIGHT;
    player.eye = STAND_EYE;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : player.aiming ? AIM_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const stop = Math.max(0, 1 - 9 * dt);
      player.velocity.x *= stop;
      player.velocity.z *= stop;
    }

    // Vertical: jump, then gravity, then land on the floor (y = 0).
    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.position.y += player.velocity.y * dt;
    if (player.position.y <= 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }

    // Horizontal, one axis at a time against the colliders.
    player.position.x += player.velocity.x * dt;
    if (overlaps(player.position.x, player.position.y, player.position.z, player.height, 0.02)) {
      player.position.x -= player.velocity.x * dt;
      player.velocity.x = 0;
    }
    player.position.z += player.velocity.z * dt;
    if (overlaps(player.position.x, player.position.y, player.position.z, player.height, 0.02)) {
      player.position.z -= player.velocity.z * dt;
      player.velocity.z = 0;
    }
    // Stay inside the yard.
    player.position.x = Math.max(-25.4, Math.min(25.4, player.position.x));
    player.position.z = Math.max(-17.4, Math.min(17.4, player.position.z));
  }

  return { state: player, look, recoil, step, damage, reset, groundSpeed };
}
