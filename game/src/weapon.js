// Weapons: three guns and a frag grenade. Each gun owns its numbers — damage, rate,
// spread, recoil, magazine — and a small view model. main.js owns the ray, the hit
// and the damage; this module only says whether a round may leave and what it costs.
// Spread punishes firing on the move and in the air; aiming (RMB) tightens it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-9 Rifle', sub: 'Auto · $2700', price: 2700, auto: true,
    damage: 34, headDamage: 100, fireGap: 0.105, reloadTime: 2.1, magSize: 30, reserve: 90,
    spreadStill: 0.0026, spreadMove: 0.03, spreadAir: 0.05, aimSpread: 0.0012,
    recoilPitch: 0.011, recoilYaw: 0.004, range: 90,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', sub: 'Auto · $1500', price: 1500, auto: true,
    damage: 24, headDamage: 72, fireGap: 0.075, reloadTime: 1.7, magSize: 32, reserve: 96,
    spreadStill: 0.005, spreadMove: 0.038, spreadAir: 0.06, aimSpread: 0.0024,
    recoilPitch: 0.007, recoilYaw: 0.005, range: 55,
  },
  pistol: {
    id: 'pistol', name: 'P-9 Pistol', sub: 'Semi · $500', price: 500, auto: false,
    damage: 30, headDamage: 90, fireGap: 0.16, reloadTime: 1.4, magSize: 12, reserve: 48,
    spreadStill: 0.003, spreadMove: 0.028, spreadAir: 0.045, aimSpread: 0.0014,
    recoilPitch: 0.009, recoilYaw: 0.003, range: 45,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

const MUZZLE_TIME = 0.05;

export function createWeapon(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x6b4f2a), roughness: 0.9 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.44), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), dark);
  barrel.position.set(0, 0.02, -0.34);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.16), grip);
  stock.position.set(0, -0.01, 0.28);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), dark);
  mag.position.set(0, -0.12, -0.02);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), dark);
  sight.position.set(0, 0.09, -0.08);
  model.add(receiver, barrel, stock, mag, sight);
  model.position.set(0.24, -0.22, -0.5);
  camera.add(model);

  const muzzle = new THREE.PointLight(new THREE.Color(0xffc46b), 0, 9, 2);
  muzzle.position.set(0, 0, -0.6);
  model.add(muzzle);
  let muzzleLeft = 0;

  const state = {
    id: 'rifle',
    mag: WEAPONS.rifle.magSize,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloading: 0,
    grenades: 1,
    bloom: 0,
  };

  function def() {
    return WEAPONS[state.id];
  }

  function equip(id) {
    if (!WEAPONS[id]) return false;
    state.id = id;
    const d = WEAPONS[id];
    state.mag = d.magSize;
    state.reserve = d.reserve;
    state.cooldown = 0;
    state.reloading = 0;
    state.bloom = 0;
    // The view model changes shape per gun: long rifle, short smg, stubby pistol.
    const scale = id === 'smg' ? 0.8 : id === 'pistol' ? 0.55 : 1;
    model.scale.set(scale, scale, scale);
    return true;
  }

  function buy(id) {
    return equip(id);
  }

  function ready() {
    return state.cooldown <= 0 && state.reloading <= 0 && state.mag > 0;
  }

  function takeRound() {
    if (!ready()) return false;
    state.mag -= 1;
    state.cooldown = def().fireGap;
    state.bloom = Math.min(1, state.bloom + 0.16);
    muzzle.intensity = 14;
    muzzleLeft = MUZZLE_TIME;
    return true;
  }

  function takeGrenade() {
    if (state.grenades <= 0 || state.cooldown > 0) return false;
    state.grenades -= 1;
    state.cooldown = 0.5;
    return true;
  }

  function reload() {
    const d = def();
    if (state.reloading > 0 || state.mag >= d.magSize || state.reserve <= 0) return false;
    state.reloading = d.reloadTime;
    return true;
  }

  function refill() {
    const d = def();
    state.mag = d.magSize;
    state.reserve = d.reserve;
    state.reloading = 0;
    state.cooldown = 0;
    state.grenades = 1;
  }

  // Spread now, in radians: still base, worse moving or airborne, bloom from firing,
  // tighter while aiming. main.js adds it to the shot direction.
  function spread(speed, airborne, aiming) {
    const d = def();
    const move = Math.min(1, speed / 5.4);
    let s = d.spreadStill + (d.spreadMove - d.spreadStill) * move;
    if (airborne) s = Math.max(s, d.spreadAir);
    s += state.bloom * 0.02;
    if (aiming) s = Math.min(s, d.aimSpread + state.bloom * 0.008);
    return s;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.bloom = Math.max(0, state.bloom - dt * 1.4);
    if (muzzleLeft > 0) {
      muzzleLeft -= dt;
      if (muzzleLeft <= 0) muzzle.intensity = 0;
    }
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const d = def();
        const need = d.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        state.reloading = 0;
      }
    }
    // View-model bob and recoil kick, driven by movement and firing.
    model.position.y = -0.22 + Math.sin(performance.now() * 0.004) * 0.0015;
    model.position.z = -0.5 + state.bloom * 0.06;
  }

  return { state, def, equip, buy, ready, takeRound, takeGrenade, reload, refill, spread, step, model };
}
