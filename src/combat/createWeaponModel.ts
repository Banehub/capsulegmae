
import * as THREE from 'three';
import type { WeaponId } from '../../shared/weapons.ts';

export interface WeaponModel {
  group: THREE.Group;
  muzzleZ: number;
}

export function createWeaponModel(kind: WeaponId): WeaponModel {
  const group = new THREE.Group();
  const isPistol = kind === 'pistol';
  const isShotgun = kind === 'shotgun';
  const isSniper = kind === 'sniper';
  const isRifle = kind === 'rifle';

  function texture(
    base: string,
    mode: 'steel' | 'polymer' | 'grip' | 'paint',
    seed: number,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);

    let state = seed;
    const rand = () => (
      (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) /
      4294967296
    );

    for (let i = 0; i < 6500; i++) {
      const v = rand() > 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${v},${v},${v},${
        rand() * (mode === 'steel' ? 0.095 : 0.055)
      })`;

      const x = rand() * 256;
      const y = rand() * 256;

      ctx.fillRect(
        x,
        y,
        mode === 'steel' ? 4 + rand() * 20 : 1 + rand() * 2,
        mode === 'steel' ? 0.6 : 1 + rand() * 2,
      );
    }

    if (mode === 'grip') {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;

      for (let i = -256; i < 512; i += 11) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 256, 256);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(i + 256, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();
      }
    }

    if (mode === 'paint') {
      ctx.strokeStyle = 'rgba(210,205,176,0.11)';

      for (let i = 0; i < 110; i++) {
        const x = rand() * 256;
        const y = rand() * 256;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3 + rand() * 16, y);
        ctx.stroke();
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;

    return map;
  }

  const metal = new THREE.MeshStandardMaterial({
    map: texture('#454a4a', 'steel', 10),
    metalness: 0.78,
    roughness: 0.42,
  });

  const black = new THREE.MeshStandardMaterial({
    map: texture('#242727', 'polymer', 20),
    metalness: 0.12,
    roughness: 0.82,
  });

  const rubber = new THREE.MeshStandardMaterial({
    map: texture('#181b1a', 'grip', 30),
    metalness: 0,
    roughness: 0.94,
  });

  const steel = new THREE.MeshStandardMaterial({
    map: texture('#737879', 'steel', 40),
    metalness: 0.92,
    roughness: 0.3,
  });

  const paint = new THREE.MeshStandardMaterial({
    map: texture(isSniper ? '#706b53' : '#515b4a', 'paint', 50),
    metalness: 0.25,
    roughness: 0.75,
  });

  const glass = new THREE.MeshStandardMaterial({
    color: 0x244959,
    metalness: 0.6,
    roughness: 0.13,
    emissive: 0x06131b,
  });

  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  function cylinder(
    r: number,
    len: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 16),
      mat,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  function lens(z: number, y: number, r: number) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), glass);
    mesh.position.set(0, y, z);
    mesh.rotation.y = Math.PI;
    group.add(mesh);
  }

  if (isPistol) {
    box(0.19, 0.14, 0.47, 0, 0.045, -0.16, metal);
    box(0.2, 0.035, 0.42, 0, 0.12, -0.17, black);
    box(0.16, 0.13, 0.32, 0, -0.075, -0.09, black);

    const grip = box(0.14, 0.34, 0.18, 0, -0.25, 0.04, rubber);
    grip.rotation.x = -0.17;

    box(0.17, 0.045, 0.21, 0, -0.43, 0.075, metal);
    cylinder(0.036, 0.34, 0, 0.038, -0.35, steel);

    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        box(0.006, 0.075, 0.014, side * 0.1, 0.055, -i * 0.027, steel);
      }
    }

    box(0.055, 0.055, 0.045, 0, 0.16, 0.015, black);
    box(0.055, 0.06, 0.04, 0, 0.17, -0.35, black);

    box(0.018, 0.12, 0.018, -0.07, -0.15, -0.07, metal);
    box(0.15, 0.02, 0.2, 0, -0.22, -0.07, metal);
  } else {
    const receiverLength = isSniper ? 0.8 : isShotgun ? 0.75 : 0.64;
    const barrelLength = isSniper ? 1.05 : isShotgun ? 0.83 : 0.7;
    const barrelStart = -0.48;
    const barrelCenter = barrelStart - barrelLength / 2;

    box(0.2, 0.2, receiverLength, 0, 0, -0.09, metal);
    box(0.17, 0.085, receiverLength * 0.78, 0, 0.145, -0.11, paint);
    box(0.19, 0.14, isSniper ? 0.62 : 0.5, 0, -0.015, -0.52, black);

    cylinder(
      isShotgun ? 0.055 : 0.038,
      barrelLength,
      0,
      0.015,
      barrelCenter,
      steel,
    );

    if (isShotgun) {
      cylinder(0.035, barrelLength * 0.85, 0, -0.1, barrelCenter + 0.06, metal);
    }

    const grip = box(0.14, 0.32, 0.17, 0, -0.24, 0.18, rubber);
    grip.rotation.x = -0.22;

    box(0.15, 0.14, 0.35, 0, 0.015, 0.39, paint);
    box(0.19, 0.25, 0.075, 0, -0.025, 0.58, rubber);
    box(0.15, 0.025, 0.3, 0, 0.205, -0.19, black);

    for (let i = 0; i < 8; i++) {
      box(0.16, 0.018, 0.023, 0, 0.225, -0.33 + i * 0.047, steel);
    }

    if (isShotgun) {
      box(0.2, 0.16, 0.3, 0, -0.065, -0.69, paint);

      for (let i = 0; i < 5; i++) {
        box(0.205, 0.012, 0.022, 0, -0.15, -0.79 + i * 0.05, rubber);
      }

      box(
        0.1,
        0.1,
        0.07,
        0,
        0.08,
        barrelStart - barrelLength + 0.02,
        black,
      );
    } else {
      const magazine = box(
        0.15,
        isSniper ? 0.23 : 0.38,
        0.19,
        0,
        isSniper ? -0.22 : -0.29,
        -0.12,
        black,
      );

      magazine.rotation.x = -0.15;

      for (let i = 0; i < 5; i++) {
        box(0.153, 0.012, 0.19, 0, -0.17 - i * 0.047, -0.12, metal);
      }
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        box(0.012, 0.018, 0.04, side * 0.105, 0, -0.75 + i * 0.065, steel);
      }
    }

    if (isSniper) {
      cylinder(0.11, 0.47, 0, 0.35, -0.16, black);
      cylinder(0.14, 0.075, 0, 0.35, -0.39, metal);
      cylinder(0.12, 0.09, 0, 0.35, 0.08, metal);
      lens(-0.435, 0.35, 0.098);

      for (const z of [-0.3, -0.02]) {
        box(0.045, 0.14, 0.06, 0, 0.235, z, metal);
      }

      cylinder(
        0.075,
        0.18,
        0,
        0.015,
        barrelStart - barrelLength + 0.04,
        black,
      );
    } else if (isRifle) {
      box(0.14, 0.13, 0.2, 0, 0.3, -0.05, black);
      box(0.08, 0.08, 0.09, 0, 0.4, -0.05, metal);
      lens(-0.155, 0.3, 0.045);
      box(0.08, 0.12, 0.055, 0, 0.2, -0.75, black);
    } else {
      box(0.07, 0.11, 0.06, 0, 0.19, -0.62, black);
      box(0.08, 0.09, 0.06, 0, 0.2, 0.15, black);
    }
  }

  const muzzleZ = isPistol
    ? -0.54
    : -(0.48 + (isSniper ? 1.05 : isShotgun ? 0.83 : 0.7));

  return { group, muzzleZ };
}
