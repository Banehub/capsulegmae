
import * as THREE from 'three';

export function createCharacterWeapon(): THREE.Group {
  const weapon = new THREE.Group();

  const metal = new THREE.MeshStandardMaterial({
    color: 0x28313e,
    metalness: 0.65,
    roughness: 0.35,
  });

  const dark = new THREE.MeshStandardMaterial({
    color: 0x111722,
    metalness: 0.3,
    roughness: 0.65,
  });

  const accent = new THREE.MeshStandardMaterial({
    color: 0x258fe6,
    metalness: 0.4,
    roughness: 0.3,
    emissive: 0x08253c,
  });

  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material,
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    weapon.add(mesh);

    return mesh;
  };

  // Main rifle body
  addBox(0.18, 0.16, 0.55, 0, 0, 0, metal);

  // Upper receiver
  addBox(
    0.14, 0.06, 0.4,
    0, 0.11, -0.04,
    accent,
  );

  // Front handguard
  addBox(
    0.14, 0.12, 0.38,
    0, -0.02, -0.45,
    dark,
  );

  // Barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.035,
      0.04,
      0.5,
      12,
    ),
    metal,
  );

  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.82);
  barrel.castShadow = true;

  weapon.add(barrel);

  // Muzzle
  addBox(
    0.09, 0.09, 0.12,
    0, 0, -1.1,
    dark,
  );

  // Magazine
  const magazine = addBox(
    0.12, 0.32, 0.17,
    0, -0.23, -0.05,
    dark,
  );

  magazine.rotation.x = -0.15;

  // Grip
  const grip = addBox(
    0.11, 0.25, 0.13,
    0, -0.2, 0.2,
    dark,
  );

  grip.rotation.x = -0.2;

  // Stock
  addBox(
    0.13, 0.13, 0.35,
    0, 0, 0.42,
    metal,
  );

  // Rear sight
  addBox(
    0.07, 0.13, 0.07,
    0, 0.18, -0.2,
    dark,
  );

  // Sight accent
  addBox(
    0.09, 0.04, 0.1,
    0, 0.26, -0.2,
    accent,
  );

  // Muzzle flash
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd044,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(
      0.12,
      0.35,
      6,
    ),
    flashMaterial,
  );

  flash.rotation.x = -Math.PI / 2;
  flash.position.z = -1.27;
  flash.visible = false;
  flash.name = 'muzzleFlash';

  weapon.add(flash);

  // Size of the weapon
  weapon.scale.setScalar(0.45);

  // Position on the capsule's right side
  weapon.position.set(
    0.38,
    0.05,
    0.3,
  );

  // Rotate rifle to face the capsule's forward direction (+Z)
  weapon.rotation.y = Math.PI;

  return weapon;
}
