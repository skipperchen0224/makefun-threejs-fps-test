// Foundry Yard: an original 52 x 36 m dusk-lit industrial yard. Two bomb sites (A west,
// B east), a mid lane through the furnace hall, and long sightlines down both flanks.
// Every box is a collider for walkers and a surface a bullet stops on. Plain geometry
// only, no models and no textures. Waypoints form the graph bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: name === 'slate' ? 0.45 : 0.04,
    });
  }
  const crate = new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.45, metalness: 0.6 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground and perimeter: 52 x 36 m, 5 m walls, open dusk sky above.
  box(52.4, 0.4, 36.4, 0, -0.2, 0, materials.canvas);
  box(0.4, 5, 36.4, -26.2, 2.5, 0, materials.surface);
  box(0.4, 5, 36.4, 26.2, 2.5, 0, materials.surface);
  box(52.4, 5, 0.4, 0, 2.5, -18.2, materials.surface);
  box(52.4, 5, 0.4, 0, 2.5, 18.2, materials.surface);

  // Furnace hall across mid: two long walls with a gap each side, so mid is a choke
  // with two doors and a window slit above the crates.
  box(0.6, 5, 10, -4, 2.5, -13, materials.surface);
  box(0.6, 5, 10, -4, 2.5, 13, materials.surface);
  box(0.6, 5, 10, 4, 2.5, -13, materials.surface);
  box(0.6, 5, 10, 4, 2.5, 13, materials.surface);
  box(8.6, 1.6, 0.6, 0, 4.2, -8, materials.surface);
  box(8.6, 1.6, 0.6, 0, 4.2, 8, materials.surface);
  // Furnace block in the middle of mid: the map's centrepiece, climbable sightline.
  box(3.2, 3.4, 3.2, 0, 1.7, 0, steel);
  box(0.9, 1.6, 0.9, 0, 4.2, 0, materials.hairline);

  // Site A (west): gantry platform, stacked crates, a container to plant behind.
  box(6, 0.5, 4, -20, 0.25, -10, materials.surface);
  box(2.4, 1.2, 2.4, -22.5, 0.6, -12, crate);
  box(2.4, 1.2, 2.4, -22.5, 1.8, -12, crate);
  box(1.4, 1.1, 3.8, -17, 0.55, -13.5, crate);
  box(6.1, 2.6, 0.3, -23.5, 1.3, -7.2, steel);
  box(1.2, 2.4, 1.2, -19.5, 1.2, -6.5, materials.hairline);
  // Site B (east): pipe racks, a low wall, barrels.
  box(1.4, 1.1, 4.2, 21.5, 0.55, 11, crate);
  box(2.6, 1.1, 1.4, 18, 0.55, 13.5, crate);
  box(6, 1.1, 0.5, 20, 0.55, 7, materials.surface);
  box(0.9, 2.6, 0.9, 23.5, 1.3, 9.5, steel);
  box(0.9, 2.6, 0.9, 23.5, 1.3, 13.5, steel);
  // Flank cover: crates and pillars down both long lanes.
  box(1.6, 1.1, 1.6, -12, 0.55, -15.5, crate);
  box(1.6, 1.1, 1.6, -12, 0.55, 15.5, crate);
  box(1.6, 1.1, 1.6, 12, 0.55, -15.5, crate);
  box(1.6, 1.1, 1.6, 12, 0.55, 15.5, crate);
  box(1.2, 3.4, 1.2, -8, 1.7, -6, materials.hairline);
  box(1.2, 3.4, 1.2, 8, 1.7, 6, materials.hairline);
  box(2.2, 0.9, 1.2, -14, 0.45, 0, crate);
  box(2.2, 0.9, 1.2, 14, 0.45, 0, crate);
  // Spawn cover: low walls at each end.
  box(4, 1.1, 0.6, -24, 0.55, 4, materials.surface);
  box(4, 1.1, 0.6, 24, 0.55, -4, materials.surface);

  // Site markers: a flat amber ring on the ground at A, a slate ring at B, plus a
  // floating letter plate. The bomb only plants inside the ring.
  function siteMarker(x, z, color, letter) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 40), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    group.add(ring);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.1), new THREE.MeshBasicMaterial({ color }));
    plate.position.set(x, 3.4, z);
    group.add(plate);
    return { x, z, radius: 3 };
  }
  const siteA = siteMarker(-21, -11, 0xf0a830, 'A');
  const siteB = siteMarker(21, 11, 0x7fb3d5, 'B');

  // Light: low amber sun from the west, cool dusk fill from the east, warm hemisphere.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a6a4a), new THREE.Color(PALETTE.canvas), 1.25);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb35c), 2.9);
  sun.position.set(-18, 12, 6);
  sun.target.position.set(4, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x5a7a9a), 0.6);
  fill.position.set(16, 10, -8);
  scene.add(fill);
  // Furnace glow: a warm point light over the centre block.
  const glow = new THREE.PointLight(new THREE.Color(0xff7a2a), 30, 18, 1.8);
  glow.position.set(0, 3.4, 0);
  scene.add(glow);

  // Waypoints: the graph bots walk. Nodes carry a position; edges are implicit —
  // a bot walks to the nearest node of its next route leg, then along the leg.
  const waypoints = {
    emberSpawn: new THREE.Vector3(-24, 0, 0),
    slateSpawn: new THREE.Vector3(24, 0, 0),
    midWest: new THREE.Vector3(-8, 0, 0),
    midEast: new THREE.Vector3(8, 0, 0),
    midDoorN: new THREE.Vector3(0, 0, -8),
    midDoorS: new THREE.Vector3(0, 0, 8),
    northLane: new THREE.Vector3(0, 0, -15.5),
    southLane: new THREE.Vector3(0, 0, 15.5),
    siteA: new THREE.Vector3(-21, 0, -11),
    siteAApproach: new THREE.Vector3(-14, 0, -12),
    siteB: new THREE.Vector3(21, 0, 11),
    siteBApproach: new THREE.Vector3(14, 0, 12),
    aHold: new THREE.Vector3(-18, 0, -6),
    bHold: new THREE.Vector3(18, 0, 6),
    midHold: new THREE.Vector3(-6, 0, 0),
  };
  // Named routes: each is a list of waypoint keys from a spawn to a site.
  const routes = {
    toA: ['emberSpawn', 'northLane', 'siteAApproach', 'siteA'],
    toAMid: ['emberSpawn', 'midWest', 'midDoorN', 'siteAApproach', 'siteA'],
    toB: ['emberSpawn', 'southLane', 'siteBApproach', 'siteB'],
    toBMid: ['emberSpawn', 'midWest', 'midDoorS', 'siteBApproach', 'siteB'],
    retakeA: ['slateSpawn', 'northLane', 'siteAApproach', 'siteA'],
    retakeB: ['slateSpawn', 'southLane', 'siteBApproach', 'siteB'],
    retakeMid: ['slateSpawn', 'midEast', 'midWest', 'siteA'],
  };

  return { colliders, shootables, group, siteA, siteB, waypoints, routes };
}
