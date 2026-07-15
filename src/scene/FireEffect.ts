import * as THREE from 'three';

let sharedTexture: THREE.Texture | null = null;

function getFireTexture(): THREE.Texture {
  if (sharedTexture) return sharedTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  grad.addColorStop(0.6, 'rgba(255,90,20,0.5)');
  grad.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

export class FireEffect {
  readonly points: THREE.Points;
  private count: number;
  private velocities: Float32Array;
  private lifetimes: Float32Array;
  private ages: Float32Array;
  private origin: THREE.Vector3;
  private radius: number;

  constructor(origin: THREE.Vector3, count = 90, radius = 1.1, scale = 1) {
    this.origin = origin.clone();
    this.count = count;
    this.radius = radius;
    this.velocities = new Float32Array(count);
    this.lifetimes = new Float32Array(count);
    this.ages = new Float32Array(count);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      this.resetParticle(i, positions, colors, true);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.9 * scale,
      map: getFireTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  private resetParticle(
    i: number,
    positions: Float32Array,
    colors: Float32Array,
    randomAge: boolean,
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * this.radius;
    positions[i * 3] = this.origin.x + Math.cos(angle) * r;
    positions[i * 3 + 1] = this.origin.y + Math.random() * 0.3;
    positions[i * 3 + 2] = this.origin.z + Math.sin(angle) * r;

    colors[i * 3] = 1;
    colors[i * 3 + 1] = 0.6 + Math.random() * 0.3;
    colors[i * 3 + 2] = 0.15;

    this.velocities[i] = 1.5 + Math.random() * 2.5;
    this.lifetimes[i] = 0.8 + Math.random() * 1.2;
    this.ages[i] = randomAge ? Math.random() * this.lifetimes[i]! : 0;
  }

  update(delta: number): void {
    const positions = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const posArr = positions.array as Float32Array;
    const colArr = colors.array as Float32Array;

    for (let i = 0; i < this.count; i += 1) {
      this.ages[i]! += delta;
      if (this.ages[i]! >= this.lifetimes[i]!) {
        this.resetParticle(i, posArr, colArr, false);
        continue;
      }

      posArr[i * 3 + 1] += this.velocities[i]! * delta;
      posArr[i * 3] += Math.sin((this.ages[i]! + i) * 3) * delta * 0.15;

      const lifeRatio = this.ages[i]! / this.lifetimes[i]!;
      // Fade from yellow to red as it rises.
      colArr[i * 3 + 1] = (0.7 - lifeRatio * 0.6);
      colArr[i * 3 + 2] = 0.12 * (1 - lifeRatio);
    }

    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }
}
