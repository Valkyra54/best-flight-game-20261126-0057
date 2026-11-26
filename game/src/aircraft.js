// DELTA POST — the seaplane. One job: build the aircraft from primitives
// and pose it from the shared state every frame. The design is original:
// a red-and-cream high-wing floatplane, "mail plane" livery, not a copy
// of any reference model.

import * as THREE from 'three';
import { DELTA_POST } from './config.js';
import { state } from './gameState.js';

const C = DELTA_POST.colors;

export function buildAircraft() {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: C.planeRed, roughness: 0.45, metalness: 0.25 });
  const cream = new THREE.MeshStandardMaterial({ color: C.planeCream, roughness: 0.55, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: C.planeDark, roughness: 0.4, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2e3a, roughness: 0.15, metalness: 0.7 });

  // Fuselage: tapered tube along Z, nose toward +Z.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.2, 12), red);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0.1, 0);
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 12), cream);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.1, 3.3);
  nose.castShadow = true;
  group.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 10), red);
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.position.set(0, 0.35, -3.4);
  group.add(tailCone);

  // Cabin glass.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 1.6), glass);
  cabin.position.set(0, 0.75, 1.2);
  group.add(cabin);

  // High wing: two halves with a slight dihedral, cream on top.
  const wingGeo = new THREE.BoxGeometry(5.6, 0.18, 1.7);
  const wingL = new THREE.Mesh(wingGeo, cream);
  wingL.position.set(-2.8, 1.05, 0.4);
  wingL.rotation.z = 0.06;
  wingL.castShadow = true;
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, cream);
  wingR.position.set(2.8, 1.05, 0.4);
  wingR.rotation.z = -0.06;
  wingR.castShadow = true;
  group.add(wingR);
  // Wing struts.
  const strutGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6);
  for (const sx of [-1.6, 1.6]) {
    const strut = new THREE.Mesh(strutGeo, dark);
    strut.position.set(sx, 0.35, 0.4);
    strut.rotation.z = sx > 0 ? -0.5 : 0.5;
    group.add(strut);
  }

  // Tail: horizontal stabiliser + vertical fin.
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.0), cream);
  hStab.position.set(0, 0.55, -3.9);
  group.add(hStab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.1), red);
  fin.position.set(0, 1.1, -3.9);
  group.add(fin);

  // Floats: two long capsules under the belly, with struts.
  const floatGeo = new THREE.CapsuleGeometry(0.38, 3.6, 4, 10);
  for (const sx of [-1.15, 1.15]) {
    const float = new THREE.Mesh(floatGeo, cream);
    float.rotation.x = Math.PI / 2;
    float.position.set(sx, -1.05, 0.2);
    float.castShadow = true;
    group.add(float);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), dark);
    strut.position.set(sx, -0.45, 0.9);
    strut.rotation.z = sx > 0 ? -0.35 : 0.35;
    group.add(strut);
    const strut2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), dark);
    strut2.position.set(sx, -0.45, -0.6);
    strut2.rotation.z = sx > 0 ? 0.35 : -0.35;
    group.add(strut2);
  }

  // Propeller: hub + two blades at the nose.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.22, 2.4, 0.08);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.4 });
  const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
  prop.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade2);
  prop.position.set(0, 0.1, 4.1);
  group.add(prop);

  // Navigation lights: red port, green starboard, white tail.
  const navGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const navL = new THREE.Mesh(navGeo, new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
  navL.position.set(-5.6, 1.05, 0.4);
  group.add(navL);
  const navR = new THREE.Mesh(navGeo, new THREE.MeshStandardMaterial({ color: 0x22ff44, emissive: 0x22ff44, emissiveIntensity: 2 }));
  navR.position.set(5.6, 1.05, 0.4);
  group.add(navR);
  const navT = new THREE.Mesh(navGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }));
  navT.position.set(0, 0.55, -4.4);
  group.add(navT);

  group.rotation.order = 'YXZ'; // yaw, pitch, roll — aircraft convention
  return { group, prop };
}

export function poseAircraft(aircraft, dt) {
  const { group, prop } = aircraft;
  group.position.set(state.position.x, state.position.y, state.position.z);
  group.rotation.y = state.heading;
  group.rotation.x = -state.pitch;
  group.rotation.z = -state.roll;
  // Prop spins with throttle; a gentle idle spin even at rest.
  const spinRate = 4 + state.throttle * 46;
  prop.rotation.z += spinRate * dt;
}
