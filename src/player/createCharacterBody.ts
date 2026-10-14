
import * as THREE from 'three';
import {
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '../../shared/combat.ts';
import { createCharacterFace } from './createCharacterFace.ts';
import { createCharacterWeapon } from './createCharacterWeapon.ts';

export interface CharacterBody {
  group: THREE.Group;
  body: THREE.Mesh;
  weapon: THREE.Group;
  animate: (elapsed: number, speed: number) => void;
}

export function createCharacterBody(color: number): CharacterBody {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
  });

  const vestMaterial = new THREE.MeshStandardMaterial({
    color: 0x222927,
    roughness: 0.88,
  });

  const fabricMaterial = new THREE.MeshStandardMaterial({
    color: 0x727b69,
    roughness: 0.95,
  });

  const armorMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b463d,
    roughness: 0.85,
  });

  const gloveMaterial = new THREE.MeshStandardMaterial({
    color: 0x171c1c,
    roughness: 0.9,
  });

  const bootMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b2020,
    roughness: 0.9,
  });

  const buckleMaterial = new THREE.MeshStandardMaterial({
    color: 0x777d74,
    metalness: 0.5,
    roughness: 0.6,
  });

  function addBox(
    parent: THREE.Object3D,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material,
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    return mesh;
  }

  function addSphere(
    parent: THREE.Object3D,
    radius: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 9),
      material,
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    return mesh;
  }

  function addSegment(
    parent: THREE.Object3D,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 10),
      material,
    );

    mesh.position.copy(start).add(end).multiplyScalar(0.5);

    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    return mesh;
  }

  function vector(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z);
  }

  // Original capsule body and face.
  // Physics dimensions are deliberately unchanged.
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      PLAYER_RADIUS,
      PLAYER_HALF_HEIGHT * 2,
      8,
      16,
    ),
    bodyMaterial,
  );

  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  group.add(createCharacterFace());

  // Tactical vest stays below the face.
  addBox(
    group,
    0.48,
    0.28,
    0.095,
    0,
    -0.23,
    0.27,
    vestMaterial,
  );

  addBox(
    group,
    0.49,
    0.32,
    0.095,
    0,
    -0.22,
    -0.27,
    vestMaterial,
  );

  // Shoulder straps.
  for (const side of [-1, 1]) {
    addBox(
      group,
      0.085,
      0.38,
      0.1,
      side * 0.225,
      -0.15,
      0.17,
      armorMaterial,
    );

    addBox(
      group,
      0.12,
      0.16,
      0.08,
      side * 0.17,
      -0.25,
      0.34,
      armorMaterial,
    );
  }

  // Front utility pouches.
  for (const x of [-0.15, 0, 0.15]) {
    addBox(
      group,
      0.13,
      0.12,
      0.075,
      x,
      -0.28,
      0.345,
      armorMaterial,
    );

    addBox(
      group,
      0.085,
      0.025,
      0.078,
      x,
      -0.225,
      0.39,
      buckleMaterial,
    );
  }

  // Belt.
  addBox(
    group,
    0.52,
    0.075,
    0.08,
    0,
    -0.4,
    0.22,
    vestMaterial,
  );

  addBox(
    group,
    0.12,
    0.085,
    0.035,
    0,
    -0.4,
    0.275,
    buckleMaterial,
  );

  // Longer legs with pivot joints for walking.
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();

  leftLeg.position.set(-0.155, -0.49, 0);
  rightLeg.position.set(0.155, -0.49, 0);

  group.add(leftLeg, rightLeg);

  function createLeg(leg: THREE.Group): void {
    addSphere(
      leg,
      0.105,
      0,
      0,
      0,
      fabricMaterial,
    );

    addSegment(
      leg,
      vector(0, -0.015, 0),
      vector(0, -0.19, 0.015),
      0.078,
      fabricMaterial,
    );

    addSphere(
      leg,
      0.083,
      0,
      -0.2,
      0.015,
      armorMaterial,
    );

    addSegment(
      leg,
      vector(0, -0.21, 0.015),
      vector(0, -0.32, 0.02),
      0.072,
      fabricMaterial,
    );

    addBox(
      leg,
      0.18,
      0.15,
      0.23,
      0,
      -0.33,
      0.06,
      bootMaterial,
    );

    addBox(
      leg,
      0.22,
      0.055,
      0.3,
      0,
      -0.41,
      0.095,
      gloveMaterial,
    );
  }

  createLeg(leftLeg);
  createLeg(rightLeg);

  // Rifle: its native barrel points -Z.
  // Rotate 180 degrees so it points in the same
  // +Z direction as the capsule's face.
  const weapon = createCharacterWeapon();

  const weaponRest = vector(0.09, -0.12, 0.43);

  weapon.position.copy(weaponRest);
  weapon.rotation.set(0, Math.PI, 0);
  weapon.scale.setScalar(0.48);

  group.add(weapon);

  // Rifle grip points transformed into capsule coordinates.
  // The trigger hand holds the rear grip.
  // The support hand holds the forward handguard.
  const triggerGrip = vector(
    weaponRest.x + 0.025,
    weaponRest.y - 0.48 * 0.2,
    weaponRest.z - 0.48 * 0.2,
  );

  const supportGrip = vector(
    weaponRest.x - 0.025,
    weaponRest.y - 0.48 * 0.055,
    weaponRest.z + 0.48 * 0.45,
  );

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();

  leftArm.position.set(-0.32, 0.045, 0.02);
  rightArm.position.set(0.32, 0.045, 0.02);

  group.add(leftArm, rightArm);

  function createArm(
    arm: THREE.Group,
    side: number,
    worldGrip: THREE.Vector3,
  ): void {
    const shoulder = vector(0, 0, 0);

    const elbow = vector(
      side * 0.105,
      -0.14,
      0.23,
    );

    const hand = worldGrip.clone().sub(arm.position);

    addSphere(
      arm,
      0.12,
      0,
      0,
      0,
      fabricMaterial,
    );

    addSegment(
      arm,
      shoulder,
      elbow,
      0.083,
      fabricMaterial,
    );

    addSphere(
      arm,
      0.085,
      elbow.x,
      elbow.y,
      elbow.z,
      armorMaterial,
    );

    addSegment(
      arm,
      elbow,
      hand,
      0.068,
      fabricMaterial,
    );

    addSphere(
      arm,
      0.088,
      hand.x,
      hand.y,
      hand.z,
      gloveMaterial,
    );

    addBox(
      arm,
      0.125,
      0.075,
      0.13,
      hand.x,
      hand.y - 0.02,
      hand.z,
      gloveMaterial,
    );
  }

  createArm(leftArm, -1, supportGrip);
  createArm(rightArm, 1, triggerGrip);

  // A shared upper-body pivot keeps both arms
  // and the rifle together while moving.
  const weaponRig = new THREE.Group();
  group.add(weaponRig);

  group.remove(weapon);
  group.remove(leftArm);
  group.remove(rightArm);

  weaponRig.add(weapon);
  weaponRig.add(leftArm);
  weaponRig.add(rightArm);

  let walkPhase = 0;
  let movementBlend = 0;

  function animate(delta: number, speed: number): void {
    const dt = Math.min(0.05, Math.max(0, delta));

    const targetMovement = THREE.MathUtils.clamp(
      speed / 4,
      0,
      1,
    );

    movementBlend = THREE.MathUtils.lerp(
      movementBlend,
      targetMovement,
      Math.min(1, dt * 12),
    );

    walkPhase += dt * (7 + movementBlend * 5);

    const swing = Math.sin(walkPhase) * movementBlend;
    const bounce = Math.abs(Math.sin(walkPhase)) * movementBlend;

    // Walking and running.
    leftLeg.rotation.x = swing * 0.58;
    rightLeg.rotation.x = -swing * 0.58;

    leftLeg.rotation.z = -0.035;
    rightLeg.rotation.z = 0.035;

    // Both hands stay on the gun.
    weaponRig.position.y = bounce * 0.018;
    weaponRig.rotation.x = -0.025 + bounce * 0.012;
    weaponRig.rotation.y = Math.sin(walkPhase) * movementBlend * 0.012;
    weaponRig.rotation.z = Math.sin(walkPhase) * movementBlend * 0.01;
  }

  return {
    group,
    body,
    weapon,
    animate,
  };
}
