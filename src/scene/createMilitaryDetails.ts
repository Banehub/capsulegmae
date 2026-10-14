
import * as THREE from 'three';
import { GROUND_SIZE } from '../../shared/arena.ts';

const mat = {
  wall: new THREE.MeshStandardMaterial({ color: 0x858b7d, roughness: 0.95 }),
  wallDark: new THREE.MeshStandardMaterial({ color: 0x515a51, roughness: 0.95 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x343e39, roughness: 0.85, metalness: 0.2 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x555e5b, roughness: 0.65, metalness: 0.45 }),
  black: new THREE.MeshStandardMaterial({ color: 0x202725, roughness: 0.85 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x4e5a3e, roughness: 0.9 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xafa081, roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x747a72, roughness: 1 }),
  yellow: new THREE.MeshBasicMaterial({ color: 0xd4a93c }),
  white: new THREE.MeshBasicMaterial({ color: 0xc5c8b7 }),
  window: new THREE.MeshStandardMaterial({
    color: 0x263d40,
    metalness: 0.4,
    roughness: 0.25,
  }),
};

function cube(
  group: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  shadows = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function tube(
  group: THREE.Object3D,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 8),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function signTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#202b25';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#c5a24d';
    ctx.lineWidth = 8;
    ctx.strokeRect(7, 7, 498, 146);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e4dfc7';
    ctx.font = 'bold 45px Arial';
    ctx.fillText(title, 256, 75);
    ctx.font = '24px Arial';
    ctx.fillStyle = '#d5ae4c';
    ctx.fillText(subtitle, 256, 120);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addSign(
  parent: THREE.Object3D,
  title: string,
  subtitle: string,
  x: number,
  y: number,
  z: number,
  width = 4,
): void {
  const texture = signTexture(title, subtitle);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * 0.3125),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  sign.position.set(x, y, z);
  parent.add(sign);
}

function building(
  scene: THREE.Scene,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  title: string,
  subtitle: string,
): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  cube(group, w, h, d, 0, h / 2, 0, mat.wall);
  cube(group, w + 0.7, 0.3, d + 0.7, 0, h + 0.1, 0, mat.roof);

  cube(group, w + 0.15, 0.2, d + 0.15, 0, 0.15, 0, mat.concrete);

  const front = d / 2 + 0.025;

  cube(group, 2, 2.6, 0.09, 0, 1.3, front, mat.black);
  cube(group, 2.3, 0.14, 0.15, 0, 2.7, front + 0.05, mat.metal);

  for (let i = -1; i <= 1; i += 1) {
    if (i === 0) continue;

    const wx = i * (w * 0.29);

    cube(group, 1.3, 1.1, 0.08, wx, h * 0.55, front, mat.window);
    cube(group, 1.45, 0.09, 0.12, wx, h * 0.55, front + 0.06, mat.metal);
    cube(group, 0.08, 1.2, 0.12, wx, h * 0.55, front + 0.06, mat.metal);
  }

  addSign(group, title, subtitle, 0, h - 0.65, front + 0.1, Math.min(w * 0.55, 5));

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const wz = -d * 0.3 + i * d * 0.3;
      cube(group, 0.08, 1.05, 1.2, side * (w / 2 + 0.025), h * 0.55, wz, mat.window);
    }
  }

  for (let i = 0; i < 3; i += 1) {
    const vent = cube(group, 0.9, 0.35, 0.9, -w * 0.3 + i * w * 0.3, h + 0.45, 0, mat.metal);
    vent.castShadow = false;
  }
}

function garage(
  scene: THREE.Scene,
  x: number,
  z: number,
  w: number,
  d: number,
): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  cube(group, w, 5, d, 0, 2.5, 0, mat.wallDark);
  cube(group, w + 0.7, 0.4, d + 0.7, 0, 5.2, 0, mat.roof);

  for (const offset of [-w * 0.26, w * 0.26]) {
    cube(group, w * 0.43, 3.7, 0.12, offset, 1.85, d / 2 + 0.08, mat.metal);

    for (let i = 1; i < 9; i += 1) {
      cube(group, w * 0.41, 0.035, 0.025, offset, i * 0.4, d / 2 + 0.16, mat.black, false);
    }
  }

  addSign(group, 'MOTOR POOL', 'AUTHORIZED PERSONNEL', 0, 4.55, d / 2 + 0.25, 4.8);
}

function sandbagLine(
  scene: THREE.Scene,
  x: number,
  z: number,
  count: number,
  angle = 0,
): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  scene.add(group);

  const geometry = new THREE.SphereGeometry(0.53, 8, 5);

  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < count - row; i += 1) {
      const bag = new THREE.Mesh(geometry, mat.sand);
      bag.scale.set(1, 0.28, 0.62);
      bag.position.set(
        (i - (count - row - 1) / 2) * 0.88,
        0.19 + row * 0.34,
        0,
      );
      bag.castShadow = true;
      bag.receiveShadow = true;
      group.add(bag);
    }
  }
}

function supplyStack(scene: THREE.Scene, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  cube(group, 3.8, 0.16, 1.8, 0, 0.13, 0, mat.sand);

  for (let i = 0; i < 3; i += 1) {
    const px = (i - 1) * 1.12;
    cube(group, 0.95, 0.95, 1.15, px, 0.68, 0, mat.olive);

    for (const side of [-1, 1]) {
      cube(group, 0.08, 0.95, 1.18, px + side * 0.39, 0.68, 0, mat.metal);
    }

    cube(group, 0.98, 0.08, 1.18, px, 1.12, 0, mat.metal);
  }
}

function fuelDepot(scene: THREE.Scene, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  cube(group, 6.5, 0.12, 4, 0, 0.07, 0, mat.concrete);

  for (let i = 0; i < 3; i += 1) {
    const px = (i - 1) * 1.8;
    const barrel = tube(group, 0.48, 1.25, px, 0.7, 0, mat.olive);

    for (const offset of [-0.35, 0.35]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.49, 0.045, 5, 12),
        mat.black,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, 0.7 + offset, 0);
      group.add(ring);
    }

    barrel.castShadow = true;
  }

  cube(group, 6.5, 0.08, 0.08, 0, 0.08, 2, mat.yellow, false);
}

function antenna(scene: THREE.Scene, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  cube(group, 1.4, 0.35, 1.4, 0, 0.18, 0, mat.concrete);
  tube(group, 0.12, 9, 0, 4.7, 0, mat.metal);

  for (const height of [4, 6, 8]) {
    cube(group, 2.6, 0.08, 0.08, 0, height, 0, mat.metal);
    cube(group, 0.08, 0.08, 2.6, 0, height, 0, mat.metal);
  }

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff493b }),
  );
  beacon.position.y = 9.4;
  group.add(beacon);
}

function decals(scene: THREE.Scene): void {
  const group = new THREE.Group();
  scene.add(group);

  const random = (() => {
    let seed = 96321;
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();

  const stainMaterials = Array.from({ length: 4 }, (_, i) =>
    new THREE.MeshBasicMaterial({
      color: i % 2 ? 0x303a32 : 0x47483e,
      transparent: true,
      opacity: 0.09 + i * 0.025,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );

  const stainGeometry = new THREE.CircleGeometry(1, 12);

  for (let i = 0; i < 85; i += 1) {
    const stain = new THREE.Mesh(stainGeometry, stainMaterials[i % 4]);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(random() * 54 - 27, 0.045 + i * 0.00001, random() * 54 - 27);
    stain.scale.set(0.2 + random() * 1.5, 0.15 + random() * 0.7, 1);
    group.add(stain);
  }

  const lineGeometry = new THREE.PlaneGeometry(0.075, 1);

  for (let i = 0; i < 38; i += 1) {
    const mark = new THREE.Mesh(lineGeometry, mat.white);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = (random() - 0.5) * 0.25;
    mark.position.set(random() * 48 - 24, 0.055, random() * 48 - 24);
    mark.scale.set(1, 0.4 + random() * 1.4, 1);
    group.add(mark);
  }

  const drainGeometry = new THREE.BoxGeometry(1.8, 0.018, 0.85);

  for (const [x, z] of [[-21, -18], [21, 18], [-20, 18], [20, -18]]) {
    const grate = new THREE.Group();
    grate.position.set(x, 0, z);
    scene.add(grate);

    const base = new THREE.Mesh(drainGeometry, mat.black);
    base.position.y = 0.035;
    grate.add(base);

    for (let i = -4; i <= 4; i += 1) {
      cube(grate, 0.07, 0.025, 0.78, i * 0.19, 0.055, 0, mat.metal, false);
    }
  }
}

export function createMilitaryDetails(scene: THREE.Scene): void {
  const half = GROUND_SIZE / 2;

  decals(scene);

  // Buildings are beyond the existing playable wall.
  // They are scenery and do not introduce new gameplay colliders.
  building(scene, -17, -half - 11, 13, 10, 5.5, 'BARRACKS', 'SECTOR ALPHA');
  building(scene, 16, -half - 11, 14, 10, 6, 'COMMAND', 'OPERATIONS CENTER');

  garage(scene, -16, half + 10, 15, 10);
  building(scene, 16, half + 10, 13, 10, 5, 'ARMORY', 'SUPPLY DIVISION');

  building(scene, -half - 11, -13, 11, 12, 5, 'MEDICAL', 'FIELD STATION');
  building(scene, half + 11, 13, 11, 12, 5, 'STORAGE', 'DEPOT BRAVO');

  antenna(scene, -half - 5, -half - 5);
  antenna(scene, half + 5, half + 5);

  // Low-profile scenery in the arena corners, away from the main cover.
  sandbagLine(scene, -25, -25, 5, Math.PI / 4);
  sandbagLine(scene, 25, -25, 5, -Math.PI / 4);
  sandbagLine(scene, -25, 25, 5, -Math.PI / 4);
  sandbagLine(scene, 25, 25, 5, Math.PI / 4);

  // Exterior supply equipment beyond the combat boundary.
  supplyStack(scene, -half - 5, 5);
  supplyStack(scene, half + 5, -7);
  fuelDepot(scene, half + 6, -19);
  fuelDepot(scene, -half - 6, 19);
}
