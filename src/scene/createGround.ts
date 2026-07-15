import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ARENA_HALF, ARENA_OBSTACLES, GROUND_SIZE } from '../../shared/arena.ts';
import type { PhysicsWorld } from '../physics/PhysicsWorld.ts';

export interface Obstacle {
  mesh: THREE.Mesh;
}

export function createGround(
  scene: THREE.Scene,
  physicsWorld: PhysicsWorld,
): THREE.Mesh[] {
  const collidables: THREE.Mesh[] = [];

  // Dark, wet-looking reflective floor to match the cinematic art.
  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2a3348,
    roughness: 0.45,
    metalness: 0.45,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  collidables.push(groundMesh);

  const groundBody = physicsWorld.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  physicsWorld.world.createCollider(
    RAPIER.ColliderDesc.cuboid(GROUND_SIZE / 2, 0.1, GROUND_SIZE / 2).setTranslation(0, -0.1, 0),
    groundBody,
  );

  // Faint blue grid so the floor still reads with depth.
  const grid = new THREE.GridHelper(GROUND_SIZE, 40, 0x2a4a7a, 0x151d2e);
  (grid.material as THREE.Material).opacity = 0.3;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.011;
  scene.add(grid);

  addBoundary(scene);
  collidables.push(...addWalls(scene, physicsWorld));

  return collidables;
}

function addBoundary(scene: THREE.Scene): void {
  // Glowing red danger line marking the edge of the playable mat.
  const edge = ARENA_HALF;
  const points = [
    new THREE.Vector3(-edge, 0.05, -edge),
    new THREE.Vector3(edge, 0.05, -edge),
    new THREE.Vector3(edge, 0.05, edge),
    new THREE.Vector3(-edge, 0.05, edge),
    new THREE.Vector3(-edge, 0.05, -edge),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xff2a2a }),
  );
  scene.add(line);

  // Wider translucent red band just inside the line for a glow strip.
  const bandMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  });
  const bandWidth = 0.6;
  const segments = [
    { x: 0, z: -edge, w: edge * 2, d: bandWidth },
    { x: 0, z: edge, w: edge * 2, d: bandWidth },
    { x: -edge, z: 0, w: bandWidth, d: edge * 2 },
    { x: edge, z: 0, w: bandWidth, d: edge * 2 },
  ];
  for (const s of segments) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), bandMat);
    band.rotation.x = -Math.PI / 2;
    band.position.set(s.x, 0.03, s.z);
    scene.add(band);
  }
}

function addWalls(scene: THREE.Scene, physicsWorld: PhysicsWorld): THREE.Mesh[] {
  const half = GROUND_SIZE / 2;
  const wallHeight = 4;
  const wallThickness = 1;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a2233,
    roughness: 0.85,
    metalness: 0.2,
  });
  const meshes: THREE.Mesh[] = [];

  const configs = [
    { x: 0, z: -half, w: GROUND_SIZE, d: wallThickness },
    { x: 0, z: half, w: GROUND_SIZE, d: wallThickness },
    { x: -half, z: 0, w: wallThickness, d: GROUND_SIZE },
    { x: half, z: 0, w: wallThickness, d: GROUND_SIZE },
  ];

  for (const c of configs) {
    const geo = new THREE.BoxGeometry(c.w, wallHeight, c.d);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(c.x, wallHeight / 2, c.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    meshes.push(mesh);

    const body = physicsWorld.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, wallHeight / 2, c.z),
    );
    physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.cuboid(c.w / 2, wallHeight / 2, c.d / 2),
      body,
    );
  }

  return meshes;
}

export function createObstacles(
  scene: THREE.Scene,
  physicsWorld: PhysicsWorld,
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const edgeColors = [0xff5c2d, 0x2f6bff, 0xffb02d, 0x2f6bff];

  ARENA_OBSTACLES.forEach(({ pos, size }, index) => {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4558,
      roughness: 0.5,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Inset panel look with a darker inner face.
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(size[0] * 0.7, size[1] * 0.7, size[2] * 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x252b38,
        roughness: 0.7,
        metalness: 0.4,
      }),
    );
    panel.position.set(pos[0], pos[1], pos[2]);
    scene.add(panel);

    // Glowing edge outline crate look.
    const edgeColor = edgeColors[index % edgeColors.length]!;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: edgeColor }),
    );
    edges.position.copy(mesh.position);
    scene.add(edges);

    const glowMat = new THREE.MeshStandardMaterial({
      color: edgeColor,
      emissive: edgeColor,
      emissiveIntensity: 1.6,
    });
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(size[0] * 0.92, 0.07, size[2] * 0.92),
      glowMat,
    );
    glow.position.set(pos[0], pos[1] + size[1] / 2 + 0.02, pos[2]);
    scene.add(glow);

    const body = physicsWorld.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]),
    );
    physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2),
      body,
    );

    obstacles.push({ mesh });
  });

  return obstacles;
}
