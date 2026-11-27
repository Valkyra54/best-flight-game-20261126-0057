// DELTA POST — wake ribbon + touchdown spray. One job: make the water
// remember the floats. A white V-strip behind the float sterns: a ring
// buffer of ~40 segments (~2 s of history) rebuilt into one
// BufferGeometry strip whose width tapers with age, one MeshBasicMaterial,
// 1 draw call, 0 textures (Heading Up the River pattern — "from a chase
// camera this sells speed better than anything else"). Plus a small spray
// burst at each float on water touchdown, scaled by vertical speed.

import * as THREE from 'three';
import { DELTA_POST } from './config.js';
import { state, Phases } from './gameState.js';
import { on, Events } from './eventBus.js';
import { isWaterAt } from './world.js';

const MAX_SEGMENTS = 40;
const SEGMENT_LIFE = 2.0; // seconds of history
const SAMPLE_HZ = 20;
const WATER_COLOUR = new THREE.Color(0x2e5f6e);
const WHITE = new THREE.Color(0xffffff);

let strip = null;
let stripGeo = null;
let segments = []; // {lx,lz,rx,rz,heading,speed,t}
let lastSampleAt = -1;
let spray = null;
let sprayGeo = null;
let sprayVel = [];
let sprayLife = [];

const _euler = new THREE.Euler();
const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();

function sternPositions() {
  // Float sterns in local space (aircraft.js: floats at x ±1.15, capsule
  // length 3.6 + caps, centred z 0.2 — stern at z ≈ -1.9).
  _euler.set(-state.pitch, state.heading, -state.roll, 'YXZ');
  _m4.makeRotationFromEuler(_euler);
  const out = [];
  for (const sx of [-1.15, 1.15]) {
    _v.set(sx, -1.05, -1.9).applyMatrix4(_m4);
    out.push({ x: state.position.x + _v.x, z: state.position.z + _v.z });
  }
  return out;
}

export function buildWake(scene) {
  stripGeo = new THREE.BufferGeometry();
  stripGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3));
  stripGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < MAX_SEGMENTS - 1; i += 1) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  stripGeo.setIndex(idx);
  stripGeo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  strip = new THREE.Mesh(stripGeo, mat);
  strip.frustumCulled = false;
  scene.add(strip);

  // Spray pool: 48 points, reused for every touchdown burst.
  sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
  const sprayMat = new THREE.PointsMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    size: 0.9,
    sizeAttenuation: true,
    depthWrite: false,
  });
  spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  for (let i = 0; i < 48; i += 1) {
    sprayVel.push(new THREE.Vector3());
    sprayLife.push(0);
    sprayGeo.attributes.position.setXYZ(i, 0, -100, 0);
  }
  scene.add(spray);

  on(Events.TOUCHDOWN, ({ verticalSpeed }) => {
    // A short white burst at each float, scaled by vertical speed.
    const sterns = sternPositions();
    const power = Math.min(1, 0.4 + (verticalSpeed || 0) / 8);
    let n = 0;
    for (const stern of sterns) {
      for (let k = 0; k < 24 && n < 48; k += 1, n += 1) {
        const a = Math.random() * Math.PI * 2;
        const r = (0.5 + Math.random() * 0.8) * power;
        sprayVel[n].set(Math.cos(a) * r * 2, (2 + Math.random() * 3) * power, Math.sin(a) * r * 2);
        sprayLife[n] = 0.7;
        sprayGeo.attributes.position.setXYZ(n, stern.x, 0.3, stern.z);
      }
    }
  });
}

function rebuildStrip(now) {
  // Drop expired segments, then write the strip oldest -> newest.
  segments = segments.filter((s) => now - s.t < SEGMENT_LIFE);
  const posAttr = stripGeo.attributes.position;
  const colAttr = stripGeo.attributes.color;
  const tmpCol = new THREE.Color();
  let written = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const age = now - s.t;
    // V widens with the speed at sample time, then tapers to nothing
    // as the segment ages out — the taper is what fades the tail, so no
    // per-vertex alpha is needed.
    const widen = (0.3 + age * 1.4) * (1 + s.speed / 40) * (1 - THREE.MathUtils.smoothstep(age, 1.6, 2.0));
    const px = Math.cos(s.heading);
    const pz = -Math.sin(s.heading);
    posAttr.setXYZ(written * 2, s.lx - px * widen, 0.08, s.lz - pz * widen);
    posAttr.setXYZ(written * 2 + 1, s.rx + px * widen, 0.08, s.rz + pz * widen);
    tmpCol.copy(WHITE).lerp(WATER_COLOUR, age / SEGMENT_LIFE);
    colAttr.setXYZ(written * 2, tmpCol.r, tmpCol.g, tmpCol.b);
    colAttr.setXYZ(written * 2 + 1, tmpCol.r, tmpCol.g, tmpCol.b);
    written += 1;
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  stripGeo.setDrawRange(0, Math.max(0, (written - 1) * 6));
}

export function updateWake(dt, timeSeconds) {
  if (!strip) return;
  // Sample the float sterns while on the water and moving.
  const onWater = state.altitudeAgl <= 1.5
    && isWaterAt(state.position.x, state.position.z)
    && state.speed > 3
    && state.phase === Phases.FLYING;
  if (onWater && timeSeconds - lastSampleAt >= 1 / SAMPLE_HZ) {
    lastSampleAt = timeSeconds;
    const [l, r] = sternPositions();
    segments.push({
      lx: l.x, lz: l.z, rx: r.x, rz: r.z,
      heading: state.heading, speed: state.speed, t: timeSeconds,
    });
    if (segments.length > MAX_SEGMENTS) segments.shift();
  }
  rebuildStrip(timeSeconds);

  // Spray particles: rise, fall back, hide when spent.
  const posAttr = sprayGeo.attributes.position;
  for (let i = 0; i < 48; i += 1) {
    if (sprayLife[i] <= 0) continue;
    sprayLife[i] -= dt;
    sprayVel[i].y -= 9.8 * 0.6 * dt;
    const x = posAttr.getX(i) + sprayVel[i].x * dt;
    const y = posAttr.getY(i) + sprayVel[i].y * dt;
    const z = posAttr.getZ(i) + sprayVel[i].z * dt;
    if (sprayLife[i] <= 0 || y <= 0.05) {
      sprayLife[i] = 0;
      posAttr.setXYZ(i, 0, -100, 0);
    } else {
      posAttr.setXYZ(i, x, y, z);
    }
  }
  posAttr.needsUpdate = true;
}
