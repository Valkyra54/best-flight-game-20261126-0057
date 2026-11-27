// DELTA POST — gulls circling the dock. One job: a living sky.
// ~24 gulls in one InstancedMesh, flying scripted closed-form circuits
// around the dock and the river mouth. The Boids 3D Lab lesson governs
// the design: at SwiftShader ~10 fps, full O(n^2) boids with a variable
// dt freezes or jitters — fixed circular paths are framerate-independent
// by construction (position is a closed-form function of time, zero
// neighbour queries, zero integration). Wing flap is entirely in the
// vertex shader (Daniel John Morris pattern): per-instance aFlapPhase,
// smoothstep wingtip gradient, tip-flex lag, and a glide gate (~3 s
// flap, ~2 s glide, wings held flat in glide). Gulls are habitat-bound
// (threejs-fauna rule): they never leave the dock / river mouth, so they
// are always where the action is — and a flock circling the dock is a
// natural beacon for the mail-drop mission: fly toward the birds.

import * as THREE from 'three';
import { DOCK_POS, riverX } from './world.js';

const GULL_COUNT = 24;

// ~18-triangle bird, built from explicit vertices: a stretched
// octahedron body, two two-panel wings, a fan tail. White body, grey
// wingtips, flat-shaded. aWing is 0 at the body, 1 at the wingtip — the
// flap shader weights displacement by it.
function buildBirdGeometry() {
  const pos = [];
  const col = [];
  const wing = [];
  const white = [0.93, 0.93, 0.90];
  const grey = [0.55, 0.58, 0.60];
  const dark = [0.25, 0.26, 0.28];
  function tri(a, b, c, color, wA, wB, wC) {
    pos.push(...a, ...b, ...c);
    col.push(...color, ...color, ...color);
    wing.push(wA, wB, wC);
  }
  // Body: stretched octahedron (nose, tail, top, bottom, left, right).
  const nose = [0, 0, 0.55];
  const tail = [0, 0, -0.5];
  const top = [0, 0.16, 0];
  const bot = [0, -0.16, 0];
  const left = [0.16, 0, 0];
  const right = [-0.16, 0, 0];
  tri(nose, top, left, white, 0, 0, 0);
  tri(nose, right, top, white, 0, 0, 0);
  tri(nose, bot, right, white, 0, 0, 0);
  tri(nose, left, bot, white, 0, 0, 0);
  tri(tail, left, top, white, 0, 0, 0);
  tri(tail, top, right, white, 0, 0, 0);
  tri(tail, right, bot, white, 0, 0, 0);
  tri(tail, bot, left, white, 0, 0, 0);
  // Wings: inner panel (root -> mid) + outer panel (mid -> tip), each
  // side. Wingtip vertices carry aWing 1 so the flap bends them most.
  for (const s of [1, -1]) {
    const rootLead = [0.12 * s, 0, 0.25];
    const rootTrail = [0.12 * s, 0, -0.3];
    const midLead = [0.55 * s, 0, 0.15];
    const midTrail = [0.55 * s, 0, -0.2];
    const tip = [1.15 * s, 0, -0.05];
    tri(rootLead, midLead, rootTrail, white, 0.2, 0.6, 0.2);
    tri(rootTrail, midLead, midTrail, white, 0.2, 0.6, 0.6);
    tri(midLead, tip, midTrail, grey, 0.6, 1, 0.6);
    tri(midTrail, tip, [0.85 * s, 0, -0.28], grey, 0.6, 1, 0.85);
  }
  // Tail fan.
  tri([0.08, 0, -0.45], [-0.08, 0, -0.45], [0.14, 0, -0.85], dark, 0, 0, 0.3);
  tri([-0.08, 0, -0.45], [0.08, 0, -0.45], [-0.14, 0, -0.85], dark, 0, 0, 0.3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  geo.computeVertexNormals();
  return geo;
}

const uniforms = { uTime: { value: 0 } };
let gulls = null;
let flock = [];

export function buildGulls(scene) {
  const geo = buildBirdGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  // Flap in the vertex shader: per-instance phase, wingtip gradient,
  // tip-flex lag, glide gate (birds.cafe lesson — a flap-glide cycle
  // reads as behaviour, a looped flap reads as decoration).
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aFlapPhase;\nattribute float aWing;\nuniform float uTime;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float flapGate = smoothstep(0.2, 0.6, sin(uTime * 0.5 + aFlapPhase * 2.7));
          float flap = sin(uTime * 7.0 + aFlapPhase * 6.2831) * flapGate;
          transformed.y += flap * pow(aWing, 1.5) * 0.45;
        }
`,
      );
  };
  gulls = new THREE.InstancedMesh(geo, mat, GULL_COUNT);
  gulls.frustumCulled = false; // positions are rewritten every frame
  const phases = new Float32Array(GULL_COUNT);
  // Two habitat-bound circuits: the dock flock (mail-drop beacon) and a
  // smaller flock over the river mouth (landing-runway sky).
  const circuits = [
    { centre: new THREE.Vector3(DOCK_POS.x, 0, DOCK_POS.z), n: 16, rMin: 35, rMax: 80, hMin: 22, hMax: 42 },
    { centre: new THREE.Vector3(riverX(1000), 0, 1000), n: 8, rMin: 50, rMax: 90, hMin: 30, hMax: 50 },
  ];
  let idx = 0;
  for (const c of circuits) {
    for (let i = 0; i < c.n; i += 1) {
      const seed = (idx * 2654435761) % 100000;
      const rnd = (s) => {
        const x = Math.sin(s * 12.9898) * 43758.5453;
        return x - Math.floor(x);
      };
      flock.push({
        centre: c.centre,
        radius: c.rMin + rnd(seed + 1) * (c.rMax - c.rMin),
        height: c.hMin + rnd(seed + 2) * (c.hMax - c.hMin),
        omega: (rnd(seed + 3) < 0.5 ? -1 : 1) * (0.12 + rnd(seed + 4) * 0.1),
        phase: rnd(seed + 5) * Math.PI * 2,
        bobPhase: rnd(seed + 6) * Math.PI * 2,
      });
      phases[idx] = rnd(seed + 7) * Math.PI * 2;
      idx += 1;
    }
  }
  geo.setAttribute('aFlapPhase', new THREE.InstancedBufferAttribute(phases, 1));
  scene.add(gulls);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function updateGulls(timeSeconds) {
  if (!gulls) return;
  uniforms.uTime.value = timeSeconds;
  for (let i = 0; i < flock.length; i += 1) {
    const b = flock[i];
    const th = b.phase + b.omega * timeSeconds;
    const x = b.centre.x + Math.cos(th) * b.radius;
    const z = b.centre.z + Math.sin(th) * b.radius;
    const y = b.height + Math.sin(timeSeconds * 0.5 + b.bobPhase) * 4;
    // Velocity direction gives the heading; bank into the turn.
    const vx = -Math.sin(th) * b.omega;
    const vz = Math.cos(th) * b.omega;
    const heading = Math.atan2(vx, vz);
    _e.set(0, heading, -0.35 * Math.sign(b.omega), 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    gulls.setMatrixAt(i, _m);
  }
  gulls.instanceMatrix.needsUpdate = true;
}
