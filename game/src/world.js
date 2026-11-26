// DELTA POST — the river delta world. One job: build every static piece of
// the setting from a seed, and answer "how high is the ground here?" for
// the flight model. All textures are generated in code (no files, no
// network): the water normal map is a DataTexture built from value noise.

import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.min.js';
import { Water } from 'three/addons/Water.min.js';
import { DELTA_POST } from './config.js';
import { makeValueNoise2D, makeSplitMix64, deriveChild } from './random.js';
import { state } from './gameState.js';

const W = DELTA_POST.world;
const C = DELTA_POST.colors;

function sstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

let noise = makeValueNoise2D(DELTA_POST.seed);

// River centreline: a lazy S-bend down the map, widening into a broad
// mouth at the south where the water runway sits.
export function riverX(z) {
  return (
    W.riverBendAmp1 * Math.sin(z * W.riverBendFreq1) +
    W.riverBendAmp2 * Math.sin(z * W.riverBendFreq2 + W.riverBendPhase2)
  );
}

export function riverWidthAt(z) {
  const widen = sstep(700, 1000, z); // broad mouth for the runway
  return W.riverWidth * (1 + widen * 0.9);
}

export function terrainHeightAt(x, z) {
  const hills = 12 + ((noise.fbm(x * 0.0016, z * 0.0016, 4) + 1) / 2) * W.hillHeight;
  const d = Math.abs(x - riverX(z));
  const half = riverWidthAt(z) / 2;
  const carve = sstep(half + 60, half - 10, d); // 1 inside the river
  return hills * (1 - carve) + -6 * carve;
}

export function isWaterAt(x, z) {
  return terrainHeightAt(x, z) < 0.5;
}

// Fixed mission geography — designed, not random, so every sortie flies
// the same course. Rings climb gently as the river bends south.
export const RING_POSITIONS = [
  { z: -800, y: 34 },
  { z: -560, y: 38 },
  { z: -320, y: 42 },
  { z: -80, y: 46 },
  { z: 160, y: 50 },
  { z: 400, y: 54 },
].map((r) => new THREE.Vector3(riverX(r.z), r.y, r.z));

export const DOCK_POS = new THREE.Vector3(riverX(620) + riverWidthAt(620) / 2 + 22, 1.2, 620);
export const RUNWAY = {
  thresholdZ: 850,
  endZ: 1150,
  headingRad: THREE.MathUtils.degToRad(DELTA_POST.missions.runwayHeadingDeg),
  centreXAt(z) {
    return riverX(z);
  },
};

const SUN_DIR = (() => {
  const el = THREE.MathUtils.degToRad(DELTA_POST.sun.elevationDeg);
  const az = THREE.MathUtils.degToRad(DELTA_POST.sun.azimuthDeg);
  return new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).normalize();
})();

export const sunDirection = SUN_DIR.clone();

// --- Procedural water normal map (DataTexture, generated in code) ---
function generateWaterNormalsTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const n = makeValueNoise2D(777);
  const height = (x, z) => n.fbm(x * 0.09, z * 0.09, 3);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (z * size + x) * 4;
      const dx = height(x + 1, z) - height(x - 1, z);
      const dz = height(x, z + 1) - height(x, z - 1);
      const inv = 1 / Math.hypot(dx, dz, 1);
      data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dz * inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// --- Radial glow sprite texture (sun halo), generated in code ---
function generateGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 225, 170, 0.9)');
  g.addColorStop(0.35, 'rgba(255, 180, 110, 0.35)');
  g.addColorStop(1, 'rgba(255, 150, 80, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const worldRefs = {
  rings: [], // { mesh, material, position, passed }
  papiLights: [], // meshes, order 0..3 (outer..inner)
  packageMesh: null,
  packageChute: null,
  dockTarget: null,
  water: null,
  sky: null,
  sunLight: null,
  sunTarget: null,
};

function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(W.size, W.size, W.terrainSegments, W.terrainSegments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc9a06a);
  const grass = new THREE.Color(0x4d7a3a);
  const deep = new THREE.Color(0x2e5230);
  const mud = new THREE.Color(0x7a5c40);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeightAt(x, z);
    pos.setY(i, h);
    const d = Math.abs(x - riverX(z));
    const half = riverWidthAt(z) / 2;
    if (h < 1.5) tmp.copy(sand).lerp(mud, sstep(1.5, -2, h));
    else if (h < 14) tmp.copy(sand).lerp(grass, sstep(3, 10, h));
    else tmp.copy(grass).lerp(deep, sstep(14, 55, h));
    // A little tonal noise so the ground is not a flat wash.
    const v = 0.92 + 0.16 * noise.noise(x * 0.05, z * 0.05);
    colors[i * 3] = tmp.r * v;
    colors[i * 3 + 1] = tmp.g * v;
    colors[i * 3 + 2] = tmp.b * v;
    void d;
    void half;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function buildSkyAndWater(scene) {
  const sky = new Sky();
  sky.scale.setScalar(6000);
  sky.material.uniforms.turbidity.value = DELTA_POST.sun.turbidity;
  sky.material.uniforms.rayleigh.value = DELTA_POST.sun.rayleigh;
  sky.material.uniforms.mieCoefficient.value = 0.008;
  sky.material.uniforms.mieDirectionalG.value = 0.85;
  sky.material.uniforms.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);
  worldRefs.sky = sky;

  const waterGeo = new THREE.PlaneGeometry(W.size, W.size);
  const water = new Water(waterGeo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: generateWaterNormalsTexture(),
    sunDirection: SUN_DIR.clone(),
    sunColor: 0xffe0b3,
    waterColor: C.water,
    distortionScale: 3.2,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = W.waterLevel;
  scene.add(water);
  worldRefs.water = water;

  // Warm sun halo sprite, parked on the sun direction far away.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: generateGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.position.copy(SUN_DIR).multiplyScalar(4200);
  glow.scale.setScalar(1600);
  scene.add(glow);

  // Hemisphere + key light. The key light follows the plane so shadows
  // stay crisp where the action is.
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x3a5a4a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0005;
  const target = new THREE.Object3D();
  scene.add(target);
  sun.target = target;
  scene.add(sun);
  worldRefs.sunLight = sun;
  worldRefs.sunTarget = target;

  scene.fog = new THREE.FogExp2(C.fog, 0.00045);
}

function buildTrees(scene, rng) {
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 5, 6);
  const canopyGeo = new THREE.ConeGeometry(3.2, 9, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f5d33, roughness: 1 });
  const count = 620;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard += 1;
    const x = rng.range(-1150, 1150);
    const z = rng.range(-1150, 1150);
    const h = terrainHeightAt(x, z);
    if (h < 4) continue; // not on the beach or in the river
    if (Math.abs(x - riverX(z)) < riverWidthAt(z) / 2 + 26) continue;
    if (z > 800 && z < 1200 && Math.abs(x - riverX(z)) < 90) continue; // keep the runway clear
    if (Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z) < 60) continue;
    const scale = rng.range(0.8, 1.7);
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    p.set(x, h + 2.2 * scale, z);
    s.setScalar(scale);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);
    p.y = h + (5 + 4.2) * scale;
    m.compose(p, q, s);
    canopies.setMatrixAt(placed, m);
    placed += 1;
  }
  trunks.count = placed;
  canopies.count = placed;
  trunks.castShadow = true;
  canopies.castShadow = true;
  scene.add(trunks);
  scene.add(canopies);
}

function buildVillage(scene, rng) {
  // Three clusters of stilt huts on the banks. Instanced per part so the
  // whole village costs 4 draw calls.
  const clusters = [
    { x: riverX(-600) - riverWidthAt(-600) / 2 - 34, z: -600 },
    { x: riverX(-150) + riverWidthAt(-150) / 2 + 34, z: -150 },
    { x: riverX(350) - riverWidthAt(350) / 2 - 34, z: 350 },
  ];
  const huts = [];
  for (const c of clusters) {
    const n = 6;
    for (let i = 0; i < n; i += 1) {
      const x = c.x + rng.range(-26, 26);
      const z = c.z + rng.range(-22, 22);
      const h = Math.max(terrainHeightAt(x, z), 1.5);
      huts.push({ x, z, y: h, rot: rng.range(0, Math.PI * 2), s: rng.range(0.85, 1.25) });
    }
  }
  const stiltGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.4, 5);
  const hutGeo = new THREE.BoxGeometry(4.2, 3, 3.6);
  const roofGeo = new THREE.ConeGeometry(3.4, 2.2, 4);
  const winGeo = new THREE.PlaneGeometry(1.1, 0.9);
  const stiltMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 });
  const hutMat = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.9 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffc46b,
    emissive: 0xff9a3c,
    emissiveIntensity: 1.6,
  });
  const stilts = new THREE.InstancedMesh(stiltGeo, stiltMat, huts.length * 4);
  const boxes = new THREE.InstancedMesh(hutGeo, hutMat, huts.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, huts.length);
  const wins = new THREE.InstancedMesh(winGeo, winMat, huts.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const e = new THREE.Euler();
  huts.forEach((hut, i) => {
    q.setFromAxisAngle(up, hut.rot);
    s.setScalar(hut.s);
    // Four stilts at the corners.
    for (let k = 0; k < 4; k += 1) {
      const ox = (k % 2 === 0 ? -1.7 : 1.7) * hut.s;
      const oz = (k < 2 ? -1.4 : 1.4) * hut.s;
      p.set(hut.x + ox, hut.y + 1.2, hut.z + oz);
      m.compose(p, q, s);
      stilts.setMatrixAt(i * 4 + k, m);
    }
    p.set(hut.x, hut.y + 4.4, hut.z);
    m.compose(p, q, s);
    boxes.setMatrixAt(i, m);
    p.set(hut.x, hut.y + 7, hut.z);
    e.set(0, Math.PI / 4, 0);
    q.setFromEuler(e);
    m.compose(p, q, s);
    roofs.setMatrixAt(i, m);
    // Warm window facing the river.
    const toRiver = Math.atan2(riverX(hut.z) - hut.x, hut.z - hut.z + 1);
    e.set(0, hut.rot + toRiver, 0);
    q.setFromEuler(e);
    p.set(hut.x, hut.y + 4.6, hut.z + 1.85 * hut.s);
    m.compose(p, q, s);
    wins.setMatrixAt(i, m);
  });
  stilts.castShadow = true;
  boxes.castShadow = true;
  scene.add(stilts);
  scene.add(boxes);
  scene.add(roofs);
  scene.add(wins);
}

function buildRings(scene) {
  const geo = new THREE.TorusGeometry(DELTA_POST.missions.ringRadius, 0.8, 12, 48);
  RING_POSITIONS.forEach((pos) => {
    const mat = new THREE.MeshStandardMaterial({
      color: C.ringGold,
      emissive: C.ringGold,
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.y = Math.PI / 2; // ring plane faces the flight path
    scene.add(mesh);
    worldRefs.rings.push({ mesh, material: mat, position: pos.clone(), passed: false });
  });
}

function buildDockAndRunway(scene) {
  // Floating dock: platform, posts, hut, red flag, glowing drop target.
  const dock = new THREE.Group();
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(13, 0.6, 9),
    new THREE.MeshStandardMaterial({ color: C.dockWood, roughness: 0.9 }),
  );
  platform.position.y = 0.4;
  platform.castShadow = true;
  platform.receiveShadow = true;
  dock.add(platform);
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.6, 3),
    new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 }),
  );
  hut.position.set(-3.4, 2.2, -1.6);
  hut.castShadow = true;
  dock.add(hut);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }),
  );
  pole.position.set(4.6, 3.4, -3.2);
  dock.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xc23b22, side: THREE.DoubleSide }),
  );
  flag.position.set(5.5, 5.6, -3.2);
  dock.add(flag);
  const target = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.25, 10, 40),
    new THREE.MeshStandardMaterial({
      color: 0xffd76a,
      emissive: 0xffd76a,
      emissiveIntensity: 1.2,
    }),
  );
  target.rotation.x = Math.PI / 2;
  target.position.set(1.5, 0.85, 1.2);
  dock.add(target);
  worldRefs.dockTarget = target;
  dock.position.copy(DOCK_POS);
  scene.add(dock);

  // Runway buoys: two orange lines marking the water lane.
  const buoyGeo = new THREE.SphereGeometry(1.1, 10, 8);
  const buoyMat = new THREE.MeshStandardMaterial({
    color: C.buoyOrange,
    emissive: C.buoyOrange,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });
  const positions = [];
  for (let z = RUNWAY.thresholdZ; z <= RUNWAY.endZ; z += 40) {
    positions.push([RUNWAY.centreXAt(z) - 32, z]);
    positions.push([RUNWAY.centreXAt(z) + 32, z]);
  }
  const buoys = new THREE.InstancedMesh(buoyGeo, buoyMat, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach(([x, z], i) => {
    m.makeTranslation(x, 0.6, z);
    buoys.setMatrixAt(i, m);
  });
  scene.add(buoys);

  // PAPI: 4 light boxes east of the threshold. Red/white per glide path.
  const papiGeo = new THREE.BoxGeometry(1.2, 0.7, 0.9);
  const baseX = RUNWAY.centreXAt(RUNWAY.thresholdZ) + 44;
  for (let i = 0; i < 4; i += 1) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.2,
    });
    const light = new THREE.Mesh(papiGeo, mat);
    light.position.set(baseX, 1.0, RUNWAY.thresholdZ - 6 - i * 4);
    scene.add(light);
    worldRefs.papiLights.push(light);
  }
}

function buildPackage(scene) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.7 }),
  );
  group.add(box);
  const chute = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 1.4, 10, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xff6b1a,
      emissive: 0xff6b1a,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  chute.position.y = 1.6;
  group.add(chute);
  // Oversized on purpose: the parcel is the point of the mail-drop shot
  // and must read at a glance from the chase camera.
  group.scale.setScalar(1.8);
  group.visible = false;
  scene.add(group);
  worldRefs.packageMesh = group;
  worldRefs.packageChute = chute;
}

export function buildWorld(scene, seed) {
  noise = makeValueNoise2D(seed);
  const rng = makeSplitMix64(seed);
  buildTerrain(scene);
  buildSkyAndWater(scene);
  buildTrees(scene, deriveChild(rng, 11));
  buildVillage(scene, deriveChild(rng, 23));
  buildRings(scene);
  buildDockAndRunway(scene);
  buildPackage(scene);
}

export function updateWorld(timeSeconds) {
  if (worldRefs.water) {
    worldRefs.water.material.uniforms.time.value += 1 / 60;
  }
  // Next ring breathes; passed rings go quiet green.
  worldRefs.rings.forEach((ring, i) => {
    if (ring.passed) {
      ring.material.emissive.setHex(0x3fae5a);
      ring.material.emissiveIntensity = 0.35;
      return;
    }
    const isNext = i === state.ringGate;
    ring.material.emissive.setHex(isNext ? C.ringNext : C.ringGold);
    ring.material.emissiveIntensity = isNext ? 1.1 + Math.sin(timeSeconds * 4) * 0.5 : 0.7;
    ring.mesh.position.y = ring.position.y + Math.sin(timeSeconds * 0.8 + i) * 0.6;
  });
  if (worldRefs.dockTarget) {
    const active = state.missionIndex === 1;
    worldRefs.dockTarget.material.emissiveIntensity = active
      ? 1.4 + Math.sin(timeSeconds * 5) * 0.7
      : 0.5;
  }
  // Sun light follows the plane.
  if (worldRefs.sunLight && worldRefs.sunTarget) {
    const p = state.position;
    worldRefs.sunLight.position.set(p.x + SUN_DIR.x * 500, p.y + SUN_DIR.y * 500 + 120, p.z + SUN_DIR.z * 500);
    worldRefs.sunTarget.position.set(p.x, p.y, p.z);
  }
}

// Real PAPI: 4 white = too high, 4 red = too low, 2+2 = on glide path.
export function updatePapi() {
  const p = state.position;
  const papi = worldRefs.papiLights[0];
  if (!papi) return;
  const dx = p.x - papi.position.x;
  const dz = p.z - papi.position.z;
  const dist = Math.hypot(dx, dz);
  const angle = Math.atan2(p.y - 1, Math.max(dist, 1));
  const deg = THREE.MathUtils.radToDeg(angle);
  let whites;
  if (deg > 3.5) whites = 4;
  else if (deg > 3.0) whites = 3;
  else if (deg > 2.5) whites = 2;
  else if (deg > 2.0) whites = 1;
  else whites = 0;
  worldRefs.papiLights.forEach((light, i) => {
    const isWhite = i < whites;
    light.material.emissive.setHex(isWhite ? 0xffffff : 0xff2a1a);
    light.material.color.setHex(isWhite ? 0xffffff : 0xff2a1a);
  });
}
