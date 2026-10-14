
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ARENA_HALF, ARENA_OBSTACLES, GROUND_SIZE } from '../../shared/arena.ts';
import type { PhysicsWorld } from '../physics/PhysicsWorld.ts';

export interface Obstacle {
  mesh: THREE.Mesh;
}

const materials = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x777b72, roughness: 0.96 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x464c49, roughness: 0.96 }),
  concreteLight: new THREE.MeshStandardMaterial({ color: 0x92958a, roughness: 0.95 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x555f42, roughness: 0.88, metalness: 0.16 }),
  oliveDark: new THREE.MeshStandardMaterial({ color: 0x343d30, roughness: 0.9, metalness: 0.2 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x666d6b, roughness: 0.56, metalness: 0.65 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x292f30, roughness: 0.65, metalness: 0.6 }),
  sand: new THREE.MeshStandardMaterial({ color: 0x9b8e6d, roughness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x242625, roughness: 0.95 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xd5a73d, roughness: 0.82 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd5d6c8, roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: 0x963c32, roughness: 0.82 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xacc8c6,
    metalness: 0.3,
    roughness: 0.3,
    transparent: true,
    opacity: 0.7,
  }),
};

function box(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  shadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  segments = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material,
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return mesh;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to create ground texture');
  }

  const random = seededRandom(1527);

  ctx.fillStyle = '#77786e';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 18000; i += 1) {
    const shade = Math.floor(65 + random() * 110);
    ctx.fillStyle = `rgba(${shade},${shade},${shade - 5},${random() * 0.16})`;
    ctx.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1 + random() * 3);
  }

  ctx.strokeStyle = 'rgba(35,39,36,0.35)';
  ctx.lineWidth = 3;

  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  for (let i = 0; i < 25; i += 1) {
    const x = random() * 512;
    const y = random() * 512;

    ctx.strokeStyle = 'rgba(40,42,37,0.18)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + random() * 45 - 22, y + random() * 40 - 20);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return texture;
}

function createMarkings(scene: THREE.Scene): void {
  const group = new THREE.Group();
  scene.add(group);

  const edge = ARENA_HALF;

  for (const side of [-1, 1]) {
    box(group, edge * 2, 0.012, 0.12, 0, 0.025, side * edge, materials.yellow, false);
    box(group, 0.12, 0.012, edge * 2, side * edge, 0.025, 0, materials.yellow, false);
  }

  for (let i = -22; i <= 22; i += 4) {
    box(group, 0.12, 0.012, 1.6, 0, 0.025, i, materials.white, false);
  }

  for (const x of [-19, 19]) {
    for (let z = -22; z <= 22; z += 5) {
      box(group, 0.16, 0.012, 2.5, x, 0.026, z, materials.yellow, false);
    }
  }

  for (const z of [-19, 19]) {
    for (let x = -22; x <= 22; x += 5) {
      box(group, 2.5, 0.012, 0.16, x, 0.026, z, materials.yellow, false);
    }
  }
}

function createWallDetails(scene: THREE.Scene): void {
  const group = new THREE.Group();
  scene.add(group);

  const half = GROUND_SIZE / 2;

  for (let i = -27; i <= 27; i += 6) {
    for (const side of [-1, 1]) {
      const z = side * (half - 0.46);
      const x = side * (half - 0.46);

      box(group, 0.35, 4.7, 0.25, i, 2.35, z, materials.concreteDark);
      box(group, 0.25, 4.7, 0.35, x, 2.35, i, materials.concreteDark);
    }
  }

  for (const side of [-1, 1]) {
    const edge = side * (half - 0.42);

    box(group, GROUND_SIZE - 2, 0.24, 0.35, 0, 3.65, edge, materials.concreteLight);
    box(group, 0.35, 0.24, GROUND_SIZE - 2, edge, 3.65, 0, materials.concreteLight);

    box(group, GROUND_SIZE - 2, 0.12, 0.1, 0, 1.1, edge - side * 0.22, materials.concreteDark);
    box(group, 0.1, 0.12, GROUND_SIZE - 2, edge - side * 0.22, 1.1, 0, materials.concreteDark);
  }
}

function createWatchtower(scene: THREE.Scene, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  const metal = materials.darkMetal;

  for (const px of [-0.85, 0.85]) {
    for (const pz of [-0.85, 0.85]) {
      box(group, 0.17, 5.8, 0.17, px, 2.9, pz, metal);
    }
  }

  box(group, 2.3, 0.22, 2.3, 0, 5.1, 0, materials.metal);
  box(group, 2.8, 0.22, 2.8, 0, 7.3, 0, materials.oliveDark);

  for (const side of [-1, 1]) {
    box(group, 2.3, 0.9, 0.12, 0, 5.75, side * 1.08, materials.olive);
    box(group, 0.12, 0.9, 2.3, side * 1.08, 5.75, 0, materials.olive);
  }

  for (const px of [-0.9, 0.9]) {
    for (const pz of [-0.9, 0.9]) {
      box(group, 0.12, 1.5, 0.12, px, 6.55, pz, metal);
    }
  }

  box(group, 0.15, 0.15, 2.1, 0, 6.9, 0, materials.darkMetal);
  box(group, 2.1, 0.15, 0.15, 0, 6.9, 0, materials.darkMetal);

  const lamp = new THREE.PointLight(0xffe4ac, 9, 18, 2);
  lamp.position.set(0, 6.9, 0);
  group.add(lamp);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe7b0 }),
  );
  bulb.position.set(0, 6.85, 0);
  group.add(bulb);
}

function createFloodlight(scene: THREE.Scene, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  cylinder(group, 0.12, 6, 0, 3, 0, materials.darkMetal);
  box(group, 1.8, 0.15, 0.15, 0, 6, 0, materials.metal);

  for (const offset of [-0.6, 0.6]) {
    box(group, 0.75, 0.5, 0.2, offset, 6, 0.1, materials.darkMetal);
    box(group, 0.6, 0.36, 0.025, offset, 6, 0.215, materials.white, false);
  }

  const light = new THREE.SpotLight(0xfff1cb, 28, 35, Math.PI / 4, 0.65, 1.5);
  light.position.set(0, 6, 0);
  light.target.position.set(-x * 0.45, 0, -z * 0.45);
  scene.add(light.target);
  group.add(light);
}

function createPerimeter(scene: THREE.Scene): void {
  createWallDetails(scene);

  for (const [x, z] of [
    [-26, -26],
    [26, -26],
    [-26, 26],
    [26, 26],
  ]) {
    createWatchtower(scene, x, z);
  }

  createFloodlight(scene, -28, 0);
  createFloodlight(scene, 28, 0);
  createFloodlight(scene, 0, -28);
  createFloodlight(scene, 0, 28);
}

function createGroundDetails(scene: THREE.Scene): void {
  const random = seededRandom(73421);
  const group = new THREE.Group();
  scene.add(group);

  for (let i = 0; i < 140; i += 1) {
    const x = random() * 56 - 28;
    const z = random() * 56 - 28;
    const width = 0.1 + random() * 0.5;
    const depth = 0.1 + random() * 0.5;

    box(
      group,
      width,
      0.008,
      depth,
      x,
      0.014,
      z,
      random() > 0.5 ? materials.concreteDark : materials.sand,
      false,
    );
  }

  for (const [x, z] of [
    [-24, -14],
    [24, 15],
    [-18, 24],
    [18, -24],
  ]) {
    const pad = new THREE.Group();
    pad.position.set(x, 0, z);
    scene.add(pad);

    box(pad, 2.5, 0.04, 2.5, 0, 0.03, 0, materials.concreteDark, false);
    box(pad, 2.1, 0.015, 0.12, 0, 0.06, -0.8, materials.yellow, false);
    box(pad, 2.1, 0.015, 0.12, 0, 0.06, 0.8, materials.yellow, false);
  }
}

function createContainerVisual(
  parent: THREE.Object3D,
  size: [number, number, number],
  index: number,
): void {
  const [w, h, d] = size;

  const color = index % 3 === 0 ? materials.olive : index % 3 === 1 ? materials.metal : materials.oliveDark;

  box(parent, w, h, d, 0, 0, 0, color);

  const alongX = w >= d;

  if (alongX) {
    const count = Math.max(2, Math.floor(w / 0.55));

    for (let i = 1; i < count; i += 1) {
      const x = -w / 2 + (w * i) / count;
      for (const side of [-1, 1]) {
        box(parent, 0.045, h * 0.88, 0.055, x, 0, side * (d / 2 + 0.015), materials.darkMetal, false);
      }
    }
  } else {
    const count = Math.max(2, Math.floor(d / 0.55));

    for (let i = 1; i < count; i += 1) {
      const z = -d / 2 + (d * i) / count;
      for (const side of [-1, 1]) {
        box(parent, 0.055, h * 0.88, 0.045, side * (w / 2 + 0.015), 0, z, materials.darkMetal, false);
      }
    }
  }

  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
    for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) {
      box(parent, 0.13, h, 0.13, x, 0, z, materials.darkMetal);
    }
  }

  box(parent, w * 0.9, 0.045, d * 0.9, 0, h / 2 + 0.01, 0, materials.darkMetal);

  for (const side of [-1, 1]) {
    box(parent, w * 0.6, 0.09, 0.035, 0, h * 0.3, side * (d / 2 + 0.025), materials.yellow, false);
  }
}

function createConcreteBarrier(
  parent: THREE.Object3D,
  size: [number, number, number],
): void {
  const [w, h, d] = size;

  box(parent, w, h, d, 0, 0, 0, materials.concrete);

  box(parent, w, 0.12, d, 0, h / 2 - 0.06, 0, materials.concreteLight);
  box(parent, w, 0.15, 0.035, 0, h * 0.18, d / 2 + 0.02, materials.yellow, false);
  box(parent, w, 0.15, 0.035, 0, -h * 0.18, d / 2 + 0.02, materials.rubber, false);

  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    box(parent, 0.09, h * 0.65, 0.04, x, 0, d / 2 + 0.03, materials.concreteDark, false);
  }
}

function createSupplyCrate(
  parent: THREE.Object3D,
  size: [number, number, number],
): void {
  const [w, h, d] = size;

  box(parent, w, h, d, 0, 0, 0, materials.oliveDark);

  for (const y of [-h * 0.34, h * 0.34]) {
    box(parent, w + 0.025, 0.1, d + 0.025, 0, y, 0, materials.metal);
  }

  for (const x of [-w * 0.36, w * 0.36]) {
    box(parent, 0.09, h, d + 0.03, x, 0, 0, materials.metal);
  }

  box(parent, w * 0.45, 0.08, 0.035, 0, 0, d / 2 + 0.025, materials.yellow, false);
}

function addWalls(scene: THREE.Scene, physicsWorld: PhysicsWorld): THREE.Mesh[] {
  const half = GROUND_SIZE / 2;
  const wallHeight = 4;
  const wallThickness = 1;
  const meshes: THREE.Mesh[] = [];

  const configs = [
    { x: 0, z: -half, w: GROUND_SIZE, d: wallThickness },
    { x: 0, z: half, w: GROUND_SIZE, d: wallThickness },
    { x: -half, z: 0, w: wallThickness, d: GROUND_SIZE },
    { x: half, z: 0, w: wallThickness, d: GROUND_SIZE },
  ];

  for (const config of configs) {
    const mesh = box(
      scene,
      config.w,
      wallHeight,
      config.d,
      config.x,
      wallHeight / 2,
      config.z,
      materials.concrete,
    );

    meshes.push(mesh);

    const body = physicsWorld.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        config.x,
        wallHeight / 2,
        config.z,
      ),
    );

    physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        config.w / 2,
        wallHeight / 2,
        config.d / 2,
      ),
      body,
    );
  }

  return meshes;
}

export function createGround(
  scene: THREE.Scene,
  physicsWorld: PhysicsWorld,
): THREE.Mesh[] {
  const collidables: THREE.Mesh[] = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({
      map: createGroundTexture(),
      roughness: 0.97,
      metalness: 0.02,
    }),
  );

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  collidables.push(ground);

  const groundBody = physicsWorld.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed(),
  );

  physicsWorld.world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      GROUND_SIZE / 2,
      0.1,
      GROUND_SIZE / 2,
    ).setTranslation(0, -0.1, 0),
    groundBody,
  );

  createMarkings(scene);
  createGroundDetails(scene);
  createPerimeter(scene);

  collidables.push(...addWalls(scene, physicsWorld));

  return collidables;
}

export function createObstacles(
  scene: THREE.Scene,
  physicsWorld: PhysicsWorld,
): Obstacle[] {
  const obstacles: Obstacle[] = [];

  ARENA_OBSTACLES.forEach(({ pos, size }, index) => {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);
    scene.add(group);

    if (index % 3 === 0) {
      createSupplyCrate(group, size);
    } else if (index % 3 === 1) {
      createConcreteBarrier(group, size);
    } else {
      createContainerVisual(group, size, index);
    }

    const collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      new THREE.MeshBasicMaterial({ visible: false }),
    );

    collisionMesh.position.set(pos[0], pos[1], pos[2]);
    collisionMesh.updateMatrixWorld(true);
    scene.add(collisionMesh);

    const body = physicsWorld.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        pos[0],
        pos[1],
        pos[2],
      ),
    );

    physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        size[0] / 2,
        size[1] / 2,
        size[2] / 2,
      ),
      body,
    );

    obstacles.push({ mesh: collisionMesh });
  });

  return obstacles;
}
