
import * as THREE from 'three';
import {
  MAX_HEALTH,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '../../shared/combat.ts';
import type { PlayerSnapshot } from '../../shared/protocol.ts';
import { createCharacterFace } from './createCharacterFace.ts';
import { createCharacterWeapon } from './createCharacterWeapon.ts';

export class RemotePlayer {
  readonly id: string;
  readonly mesh: THREE.Group;

  name: string;
  health = MAX_HEALTH;
  alive = true;
  isBot = false;
  color: number;

  private visual: THREE.Mesh;
  private label: THREE.Sprite;
  private weapon: THREE.Group;
  private targetPos = new THREE.Vector3();
  private targetFacing = 0;

  constructor(
    scene: THREE.Scene,
    snapshot: PlayerSnapshot,
  ) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.color = snapshot.color;
    this.health = snapshot.health;
    this.alive = snapshot.alive;
    this.isBot = snapshot.isBot;

    this.mesh = new THREE.Group();

    const geo = new THREE.CapsuleGeometry(
      PLAYER_RADIUS,
      PLAYER_HALF_HEIGHT * 2,
      8,
      16,
    );

    const mat = new THREE.MeshStandardMaterial({
      color: snapshot.color,
    });

    this.visual = new THREE.Mesh(geo, mat);
    this.visual.castShadow = true;

    this.mesh.add(this.visual);
    this.mesh.add(createCharacterFace());

    this.weapon = createCharacterWeapon();
    this.mesh.add(this.weapon);

    this.label = createNameLabel(this.labelText());
    this.label.position.y = 1.4;

    this.mesh.add(this.label);

    this.mesh.position.set(
      snapshot.x,
      snapshot.y,
      snapshot.z,
    );

    this.mesh.rotation.y = snapshot.facing;

    this.targetPos.copy(this.mesh.position);
    this.targetFacing = snapshot.facing;

    scene.add(this.mesh);

    this.applyAliveState();
  }

  applySnapshot(snapshot: PlayerSnapshot): void {
    this.name = snapshot.name;
    this.health = snapshot.health;
    this.alive = snapshot.alive;
    this.isBot = snapshot.isBot;

    this.targetPos.set(
      snapshot.x,
      snapshot.y,
      snapshot.z,
    );

    this.targetFacing = snapshot.facing;

    this.updateLabel();
    this.applyAliveState();
  }

  setHealth(
    health: number,
    alive: boolean,
  ): void {
    this.health = health;
    this.alive = alive;

    this.updateLabel();
    this.applyAliveState();
  }

  update(delta: number): void {
    const t = Math.min(1, delta * 12);

    this.mesh.position.lerp(
      this.targetPos,
      t,
    );

    let angleDiff =
      this.targetFacing - this.mesh.rotation.y;

    while (angleDiff > Math.PI) {
      angleDiff -= Math.PI * 2;
    }

    while (angleDiff < -Math.PI) {
      angleDiff += Math.PI * 2;
    }

    this.mesh.rotation.y += angleDiff * t;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);

    this.mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        for (const material of materials) {
          material.dispose();
        }
      }

      if (object instanceof THREE.Sprite) {
        const material = object.material;

        material.map?.dispose();
        material.dispose();
      }
    });
  }

  private labelText(): string {
    const status = this.alive
      ? String(this.health)
      : 'OUT';

    const botTag = this.isBot
      ? 'BOT '
      : '';

    return `${botTag}${this.name} (${status})`;
  }

  private updateLabel(): void {
    const canvas = (
      this.label.material as THREE.SpriteMaterial
    ).map?.image as HTMLCanvasElement | undefined;

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 20, canvas.width, 40);

    ctx.fillStyle = '#fff';
    ctx.font = '28px system-ui';
    ctx.textAlign = 'center';

    ctx.fillText(
      this.labelText(),
      canvas.width / 2,
      48,
    );

    const map = (
      this.label.material as THREE.SpriteMaterial
    ).map;

    if (map) {
      map.needsUpdate = true;
    }
  }

  private applyAliveState(): void {
    this.mesh.visible = this.alive;
  }
}

function createNameLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');

  canvas.width = 256;
  canvas.height = 64;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 20, canvas.width, 40);

  ctx.fillStyle = '#fff';
  ctx.font = '28px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, 48);

  const texture = new THREE.CanvasTexture(canvas);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  });

  const sprite = new THREE.Sprite(material);

  sprite.scale.set(2.2, 0.55, 1);

  return sprite;
}
