
import * as THREE from 'three';

export interface WeaponMaterials {
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  olive: THREE.MeshStandardMaterial;
}

function makeTexture(
  base: string,
  seed: number,
  pattern: 'metal' | 'polymer' | 'rubber' | 'paint',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create weapon texture');
  }

  let state = seed >>> 0;

  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 8500; i += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const shade = random() > 0.5 ? 255 : 0;

    ctx.fillStyle = `rgba(${shade},${shade},${shade},${random() * 0.09})`;

    if (pattern === 'metal') {
      ctx.fillRect(x, y, 2 + random() * 24, 0.3 + random());
    } else {
      ctx.fillRect(x, y, 1 + random() * 2, 1 + random() * 2);
    }
  }

  if (pattern === 'rubber') {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;

    for (let x = -256; x < 512; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 256, 256);
      ctx.stroke();
    }
  }

  if (pattern === 'polymer') {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';

    for (let x = 4; x < 256; x += 9) {
      for (let y = 4; y < 256; y += 9) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (pattern === 'paint') {
    for (let i = 0; i < 90; i += 1) {
      ctx.strokeStyle = `rgba(15,15,15,${random() * 0.15})`;
      ctx.lineWidth = random() * 1.5;
      ctx.beginPath();

      const x = random() * 256;
      const y = random() * 256;

      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 15, y + random() * 2);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return texture;
}

export function createWeaponMaterials(): WeaponMaterials {
  return {
    metal: new THREE.MeshStandardMaterial({
      map: makeTexture('#41484c', 1234, 'metal'),
      metalness: 0.82,
      roughness: 0.38,
    }),

    dark: new THREE.MeshStandardMaterial({
      map: makeTexture('#25292b', 2345, 'polymer'),
      metalness: 0.12,
      roughness: 0.88,
    }),

    accent: new THREE.MeshStandardMaterial({
      map: makeTexture('#4e5947', 3456, 'paint'),
      metalness: 0.42,
      roughness: 0.68,
    }),

    rubber: new THREE.MeshStandardMaterial({
      map: makeTexture('#171b1c', 4567, 'rubber'),
      metalness: 0,
      roughness: 0.98,
    }),

    steel: new THREE.MeshStandardMaterial({
      map: makeTexture('#737a7c', 5678, 'metal'),
      metalness: 0.95,
      roughness: 0.28,
    }),

    olive: new THREE.MeshStandardMaterial({
      map: makeTexture('#626b4c', 6789, 'paint'),
      metalness: 0.25,
      roughness: 0.76,
    }),
  };
}
