import * as THREE from 'three';
import { FIRE_COOLDOWN_MS, PLAYER_EYE_HEIGHT } from '../../shared/combat.ts';
import type { ShotEvent, Vec3 } from '../../shared/protocol.ts';
import type { InputManager } from '../input/InputManager.ts';
import type { NetworkClient } from '../network/NetworkClient.ts';
import type { Player } from '../player/Player.ts';
import type { PlayerCamera } from '../player/PlayerCamera.ts';

const BULLET_SPEED = 90;
const BULLET_LIFETIME = 1.2;
const MAX_HOLES = 40;

interface Bullet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
}

let holeTexture: THREE.Texture | null = null;

function getHoleTexture(): THREE.Texture {
  if (holeTexture) return holeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(5,5,8,1)');
  grad.addColorStop(0.5, 'rgba(20,20,25,0.9)');
  grad.addColorStop(0.8, 'rgba(60,50,45,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,15,18,0.7)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i += 1) {
    const a = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
    ctx.stroke();
  }
  holeTexture = new THREE.CanvasTexture(canvas);
  return holeTexture;
}

export class ShootingSystem {
  private bullets: Bullet[] = [];
  private bulletGeometry = new THREE.SphereGeometry(0.08, 8, 8);
  private bulletMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdd33,
    emissive: 0xff9900,
    emissiveIntensity: 2,
  });
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private player: Player;
  private playerCamera: PlayerCamera;
  private input: InputManager;
  private network: NetworkClient | null = null;
  private collidables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private holes: THREE.Mesh[] = [];
  private holeMaterial = new THREE.MeshBasicMaterial({
    map: getHoleTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  private holeGeometry = new THREE.PlaneGeometry(0.4, 0.4);
  private lastShotAt = 0;
  enabled = true;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    player: Player,
    playerCamera: PlayerCamera,
    input: InputManager,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.playerCamera = playerCamera;
    this.input = input;
  }

  setNetwork(network: NetworkClient): void {
    this.network = network;
  }

  setCollidables(objects: THREE.Object3D[]): void {
    this.collidables = objects;
  }

  private placeBulletHole(origin: Vec3, direction: Vec3): void {
    if (this.collidables.length === 0) return;

    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    this.raycaster.set(new THREE.Vector3(origin.x, origin.y, origin.z), dir);
    this.raycaster.far = 100;

    const hits = this.raycaster.intersectObjects(this.collidables, false);
    const hit = hits[0];
    if (!hit) return;

    const decal = new THREE.Mesh(this.holeGeometry, this.holeMaterial);
    decal.position.copy(hit.point);

    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : dir.clone().negate();
    decal.position.addScaledVector(normal, 0.02);
    decal.lookAt(hit.point.clone().add(normal));
    decal.rotateZ(Math.random() * Math.PI);

    this.scene.add(decal);
    this.holes.push(decal);

    if (this.holes.length > MAX_HOLES) {
      const old = this.holes.shift();
      if (old) this.scene.remove(old);
    }
  }

  update(_delta: number): void {
    if (this.enabled && this.player.alive) {
      // Drain click queue, but only fire when cooldown allows — matches server.
      while (this.input.consumeShot()) {
        if (this.tryFire()) break;
      }
      // Hold-to-fire at the same rate.
      if (this.input.isShootHeld()) {
        this.tryFire();
      }
    } else {
      this.input.clearShots();
    }

    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index];
      if (!bullet) continue;

      bullet.mesh.position.addScaledVector(bullet.velocity, _delta);
      bullet.age += _delta;

      if (bullet.age >= BULLET_LIFETIME) {
        this.scene.remove(bullet.mesh);
        this.bullets.splice(index, 1);
      }
    }
  }

  spawnNetworkShot(shot: ShotEvent): void {
    if (shot.shooterId === this.network?.playerId) return;
    this.spawnBullet(shot.origin, shot.direction);
  }

  private tryFire(): boolean {
    const now = performance.now();
    if (now - this.lastShotAt < FIRE_COOLDOWN_MS) return false;
    this.lastShotAt = now;
    this.fireLocal();
    return true;
  }

  private fireLocal(): void {
    // Aim through the crosshair (camera center), so what you see is what hits.
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    const eye = this.player.position.add(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0));
    const aimPoint = this.camera.position.clone().addScaledVector(camDir, 80);

    // Muzzle slightly right of eye for VFX, but direction still goes through aim point.
    const muzzle = eye
      .clone()
      .addScaledVector(this.playerCamera.getRightDirection(), 0.25);

    const direction = aimPoint.sub(muzzle).normalize();

    this.spawnBullet(
      { x: muzzle.x, y: muzzle.y, z: muzzle.z },
      { x: direction.x, y: direction.y, z: direction.z },
    );

    // Push latest position before the shot so hit detection isn't stale.
    const pos = this.player.position;
    this.network?.sendMove({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      facing: this.player.facingAngle,
    });

    // Hit-auth ray: from eye through crosshair (no shoulder bias).
    const hitDir = camDir.clone().normalize();
    this.network?.sendShot({
      origin: { x: eye.x, y: eye.y, z: eye.z },
      direction: { x: hitDir.x, y: hitDir.y, z: hitDir.z },
    });
  }

  private spawnBullet(origin: Vec3, direction: Vec3): void {
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const mesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
    mesh.position.set(origin.x, origin.y, origin.z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      velocity: dir.multiplyScalar(BULLET_SPEED),
      age: 0,
    });

    this.placeBulletHole(origin, direction);
  }
}
