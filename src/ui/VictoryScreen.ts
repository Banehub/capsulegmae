import * as THREE from 'three';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../../shared/combat.ts';
import type { Standing } from '../../shared/protocol.ts';

const PLACE_LABELS = ['1st', '2nd', '3rd'];
const PODIUM_HEIGHTS = [1.4, 0.95, 0.6];
const PODIUM_X = [0, -1.9, 1.9];
const PODIUM_COLORS = [0xffd447, 0xc0c6d4, 0xcd7f32];

interface PodiumCharacter {
  group: THREE.Group;
  baseY: number;
  phase: number;
}

export class VictoryScreen {
  private root: HTMLElement;
  private titleEl: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rematchBtn: HTMLButtonElement;
  private menuBtn: HTMLButtonElement;

  private characters: PodiumCharacter[] = [];
  private confetti: THREE.Points | null = null;
  private confettiVel: Float32Array | null = null;
  private clock = new THREE.Clock();
  private frame = 0;
  private visible = false;
  private dynamic: THREE.Object3D[] = [];

  constructor(onRematch: () => void, onMenu: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'victory';
    this.root.classList.add('hidden');
    this.root.innerHTML = `
      <div class="victory-title" id="victory-title">Winner!</div>
      <canvas id="victory-canvas"></canvas>
      <div class="victory-buttons">
        <button id="victory-rematch" type="button">Rematch</button>
        <button id="victory-menu" type="button">Main Menu</button>
      </div>
    `;
    document.body.appendChild(this.root);

    this.titleEl = this.root.querySelector('#victory-title')!;
    this.canvas = this.root.querySelector('#victory-canvas')!;
    this.rematchBtn = this.root.querySelector('#victory-rematch')!;
    this.menuBtn = this.root.querySelector('#victory-menu')!;

    this.rematchBtn.addEventListener('click', onRematch);
    this.menuBtn.addEventListener('click', onMenu);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 2.6, 7.5);
    this.camera.lookAt(0, 1.4, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 8, 6);
    this.scene.add(key);

    window.addEventListener('resize', () => this.resize());
  }

  show(standings: Standing[], canRematch: boolean): void {
    this.buildScene(standings);
    this.titleEl.textContent = standings.length > 0
      ? `${standings[0]!.name} Wins!`
      : 'Round Over';
    this.rematchBtn.classList.toggle('hidden', !canRematch);

    this.root.classList.remove('hidden');
    this.visible = true;
    this.resize();
    this.clock.getDelta();
    this.loop();
  }

  hide(): void {
    this.visible = false;
    this.root.classList.add('hidden');
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private buildScene(standings: Standing[]): void {
    for (const obj of this.dynamic) {
      this.scene.remove(obj);
    }
    this.dynamic = [];
    this.characters = [];

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: 0x1b2440 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.dynamic.push(floor);

    const count = Math.min(standings.length, 3);
    for (let i = 0; i < count; i += 1) {
      const standing = standings[i]!;
      const height = PODIUM_HEIGHTS[i]!;
      const x = PODIUM_X[i]!;

      const podium = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, height, 1.4),
        new THREE.MeshStandardMaterial({ color: PODIUM_COLORS[i]! }),
      );
      podium.position.set(x, height / 2, 0);
      this.scene.add(podium);
      this.dynamic.push(podium);

      const placeLabel = makeLabel(`${PLACE_LABELS[i]}  ${standing.name}`);
      placeLabel.position.set(x, height + 1.9, 0);
      this.scene.add(placeLabel);
      this.dynamic.push(placeLabel);

      const character = createCharacter(standing.color);
      const baseY = height + PLAYER_RADIUS + PLAYER_HALF_HEIGHT;
      character.position.set(x, baseY, 0);
      this.scene.add(character);
      this.dynamic.push(character);
      this.characters.push({ group: character, baseY, phase: i * 0.8 });
    }

    this.createConfetti();
  }

  private createConfetti(): void {
    const count = 220;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.confettiVel = new Float32Array(count);
    const palette = [0xffd447, 0xff5d73, 0x5dd1ff, 0x8bff6b, 0xd08bff];

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = Math.random() * 8 + 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      const c = new THREE.Color(palette[i % palette.length]!);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      this.confettiVel[i] = 1 + Math.random() * 2.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true });
    this.confetti = new THREE.Points(geo, mat);
    this.scene.add(this.confetti);
    this.dynamic.push(this.confetti);
  }

  private loop = (): void => {
    if (!this.visible) return;
    this.frame = requestAnimationFrame(this.loop);

    const delta = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    for (const character of this.characters) {
      const jump = Math.abs(Math.sin(t * 3 + character.phase)) * 0.45;
      character.group.position.y = character.baseY + jump;
      character.group.rotation.y = Math.sin(t * 1.5 + character.phase) * 0.3;
    }

    if (this.confetti && this.confettiVel) {
      const pos = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        let y = pos.getY(i) - this.confettiVel[i]! * delta;
        if (y < 0) y = 8 + Math.random() * 2;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 2 + i) * delta * 0.3);
      }
      pos.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function createCharacter(color: number): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HALF_HEIGHT * 2, 8, 16),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.castShadow = true;
  group.add(body);

  const faceZ = PLAYER_RADIUS - 0.02;
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), eyeMat);
    eye.position.set(0.12 * side, 0.32, faceZ);
    group.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), pupilMat);
    pupil.position.set(0.12 * side, 0.32, faceZ + 0.07);
    group.add(pupil);
  }

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.03, 10, 24, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x111111 }),
  );
  smile.position.set(0, 0.14, faceZ);
  smile.rotation.z = Math.PI;
  group.add(smile);

  return group;
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, 6, 20, canvas.width - 12, 56, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3, 0.56, 1);
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
