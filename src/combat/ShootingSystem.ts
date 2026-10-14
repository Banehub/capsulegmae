import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT } from '../../shared/combat.ts';
import {
  WEAPONS,
  WEAPON_IDS,
  type WeaponId,
} from '../../shared/weapons.ts';
import type {
  ShotEvent,
  Vec3,
} from '../../shared/protocol.ts';
import type { InputManager } from '../input/InputManager.ts';
import type { NetworkClient } from '../network/NetworkClient.ts';
import type { Player } from '../player/Player.ts';
import type { PlayerCamera } from '../player/PlayerCamera.ts';

interface Bullet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
}

interface WeaponAmmo {
  ammo: number;
  reserve: number;
}

const BULLET_SPEED = 90;
const SNIPER_BULLET_SPEED = 600;
const BULLET_LIFETIME = 1.2;
const MAX_HOLES = 40;

export class ShootingSystem {
  enabled = true;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private player: Player;
  private playerCamera: PlayerCamera;
  private input: InputManager;
  private network: NetworkClient | null = null;

  private weaponId: WeaponId = 'rifle';
  private weapon = new THREE.Group();
  private muzzleFlash = new THREE.Group();
  private muzzleAnchor = new THREE.Object3D();

  private states = {} as Record<WeaponId, WeaponAmmo>;

  private lastShotAt = 0;
  private serverControlled = false;
  private reloading = false;
  private reloadTimer = 0;
  private weaponRecoil = 0;
  private muzzleTimer = 0;
  private animationTime = 0;

  private bullets: Bullet[] = [];
  private collidables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private holes: THREE.Mesh[] = [];

  private bulletGeometry = new THREE.SphereGeometry(
    0.055,
    8,
    8,
  );

  private bulletMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcc33,
  });

  private holeGeometry = new THREE.PlaneGeometry(
    0.22,
    0.22,
  );

  private holeMaterial = new THREE.MeshBasicMaterial({
    color: 0x171717,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  private hud: HTMLDivElement;
  private title: HTMLDivElement;
  private ammoText: HTMLDivElement;
  private statusText: HTMLDivElement;
  private slotsText: HTMLDivElement;

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

    for (const id of WEAPON_IDS) {
      const config = WEAPONS[id];

      this.states[id] = {
        ammo: config.magazineSize,
        reserve: config.reserveAmmo,
      };
    }

    this.camera.add(this.weapon);
    this.createWeaponModel();

    this.hud = document.createElement('div');

    Object.assign(this.hud.style, {
      position: 'fixed',
      bottom: '65px',
      right: '24px',
      zIndex: '35',
      minWidth: '185px',
      padding: '15px 20px',
      borderRadius: '12px',
      background: 'rgba(8,14,24,0.88)',
      border: '1px solid rgba(255,255,255,0.16)',
      color: '#fff',
      fontFamily: 'Arial, sans-serif',
      pointerEvents: 'none',
      display: 'none',
    });

    this.title = document.createElement('div');
    this.ammoText = document.createElement('div');
    this.statusText = document.createElement('div');
    this.slotsText = document.createElement('div');

    Object.assign(this.title.style, {
      fontSize: '12px',
      letterSpacing: '2px',
      color: '#93c5fd',
      marginBottom: '8px',
    });

    Object.assign(this.ammoText.style, {
      fontSize: '29px',
      fontWeight: 'bold',
    });

    Object.assign(this.statusText.style, {
      fontSize: '11px',
      color: '#facc15',
      marginTop: '6px',
    });

    Object.assign(this.slotsText.style, {
      fontSize: '10px',
      color: '#9ca3af',
      marginTop: '12px',
      lineHeight: '1.7',
      whiteSpace: 'pre-line',
    });

    this.hud.append(
      this.title,
      this.ammoText,
      this.statusText,
      this.slotsText,
    );

    document.body.appendChild(this.hud);

    this.updateHud();
  }

  setNetwork(network: NetworkClient): void {
    this.network = network;
    this.serverControlled = true;

    network.onWeaponState = (state) => {
      if (this.weaponId !== state.weaponId) {
        this.weaponId = state.weaponId;
        this.createWeaponModel();
      }

      this.states[state.weaponId] = {
        ammo: state.ammo,
        reserve: state.reserve,
      };

      this.reloading = state.reloading;

      this.reloadTimer = Math.max(
        0,
        (state.reloadEndAt - Date.now()) / 1000,
      );

      this.updateHud();
    };
  }

  setCollidables(objects: THREE.Object3D[]): void {
    this.collidables = objects;
  }

  private createWeaponModel(): void {
    for (const child of [...this.weapon.children]) {
      this.weapon.remove(child);

      child.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();

          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          for (const material of materials) {
            material.dispose();
          }
        }
      });
    }

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

      this.weapon.add(mesh);

      return mesh;
    };

    const isPistol = this.weaponId === 'pistol';
    const isShotgun = this.weaponId === 'shotgun';
    const isSniper = this.weaponId === 'sniper';

    const bodyLength = isPistol
      ? 0.3
      : isShotgun
        ? 0.75
        : isSniper
          ? 0.85
          : 0.65;

    const barrelLength = isPistol
      ? 0.22
      : isShotgun
        ? 0.65
        : isSniper
          ? 0.9
          : 0.55;

    const bodyHeight = isPistol ? 0.14 : 0.17;

    addBox(
      0.19,
      bodyHeight,
      bodyLength,
      0,
      0,
      -0.1,
      metal,
    );

    addBox(
      0.14,
      0.06,
      bodyLength * 0.7,
      0,
      0.11,
      -0.13,
      accent,
    );

    if (!isPistol) {
      addBox(
        0.15,
        0.12,
        bodyLength * 0.6,
        0,
        -0.015,
        -0.5,
        dark,
      );
    }

    const barrelCenter =
      -0.1 - bodyLength / 2 - barrelLength / 2 + 0.08;

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(
        isShotgun ? 0.055 : 0.035,
        isShotgun ? 0.06 : 0.04,
        barrelLength,
        12,
      ),
      metal,
    );

    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, barrelCenter);
    barrel.castShadow = true;

    this.weapon.add(barrel);

    const muzzleZ = barrelCenter - barrelLength / 2;

    addBox(
      isShotgun ? 0.13 : 0.1,
      isShotgun ? 0.13 : 0.1,
      0.1,
      0,
      0,
      muzzleZ,
      dark,
    );

    const grip = addBox(
      0.12,
      0.28,
      0.15,
      0,
      -0.22,
      0.12,
      dark,
    );

    grip.rotation.x = -0.2;

    if (!isPistol) {
      const magazine = addBox(
        0.13,
        isShotgun ? 0.12 : 0.32,
        0.18,
        0,
        isShotgun ? -0.14 : -0.24,
        -0.12,
        dark,
      );

      magazine.rotation.x = -0.15;

      addBox(
        0.13,
        0.14,
        0.35,
        0,
        -0.015,
        0.4,
        metal,
      );
    }

    if (isSniper) {
      addBox(
        0.15,
        0.16,
        0.42,
        0,
        0.25,
        -0.15,
        dark,
      );

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.085,
          0.085,
          0.2,
          16,
        ),
        accent,
      );

      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.25, -0.4);

      this.weapon.add(lens);
    } else {
      addBox(
        0.08,
        0.13,
        0.08,
        0,
        0.2,
        -0.2,
        dark,
      );
    }

    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(
        isShotgun ? 0.25 : 0.15,
        isShotgun ? 0.65 : 0.5,
        6,
      ),
      flashMaterial,
    );

    flash.rotation.x = -Math.PI / 2;
    flash.position.z = -0.2;

    this.muzzleFlash = new THREE.Group();
    this.muzzleFlash.position.z = muzzleZ - 0.05;
    this.muzzleFlash.add(flash);
    this.muzzleFlash.visible = false;

    this.weapon.add(this.muzzleFlash);

    this.muzzleAnchor = new THREE.Object3D();
    this.muzzleAnchor.position.set(0, 0, muzzleZ - 0.08);

    this.weapon.add(this.muzzleAnchor);

    this.weapon.scale.setScalar(
      isPistol ? 0.7 : isSniper ? 0.58 : 0.65,
    );

    this.weapon.position.set(
      isPistol ? 0.38 : 0.42,
      -0.34,
      -0.65,
    );

    this.weapon.rotation.set(0, 0, 0);

    this.weaponRecoil = 0;
    this.muzzleTimer = 0;
  }

  private switchWeapon(id: WeaponId): void {
    if (this.weaponId === id) return;

    this.weaponId = id;

    this.network?.selectWeapon(id);

    this.reloading = false;
    this.reloadTimer = 0;
    this.lastShotAt = 0;

    this.createWeaponModel();
    this.updateHud();
  }

  private updateHud(): void {
    const config = WEAPONS[this.weaponId];
    const state = this.states[this.weaponId];

    this.title.textContent = config.name;

    this.ammoText.textContent =
      `${state.ammo} / ${state.reserve}`;

    this.statusText.textContent = this.reloading
      ? 'RELOADING...'
      : state.ammo === 0
        ? 'PRESS R TO RELOAD'
        : 'R TO RELOAD';

    this.slotsText.textContent =
      '1 PISTOL  •  2 RIFLE\n3 SHOTGUN  •  4 SNIPER';
  }

  private startReload(): void {
    const config = WEAPONS[this.weaponId];
    const state = this.states[this.weaponId];

    if (
      this.reloading ||
      state.ammo >= config.magazineSize ||
      state.reserve <= 0
    ) {
      return;
    }

    this.network?.reloadWeapon();

    this.reloading = true;
    this.reloadTimer = config.reloadSeconds;

    this.input.clearShots();
    this.updateHud();
  }

  private finishReload(): void {
    const config = WEAPONS[this.weaponId];
    const state = this.states[this.weaponId];

    const amount = Math.min(
      config.magazineSize - state.ammo,
      state.reserve,
    );

    if (!this.serverControlled) {
      state.ammo += amount;
      state.reserve -= amount;
    }

    this.reloading = false;
    this.reloadTimer = 0;

    this.updateHud();
  }

  resetWeapon(): void {
    for (const id of WEAPON_IDS) {
      const config = WEAPONS[id];

      this.states[id] = {
        ammo: config.magazineSize,
        reserve: config.reserveAmmo,
      };
    }

    this.reloading = false;
    this.reloadTimer = 0;
    this.lastShotAt = 0;
    this.weaponRecoil = 0;

    this.switchWeapon('rifle');
    this.updateHud();
  }

  private getMuzzlePosition(): THREE.Vector3 {
    const firstPerson =
      this.playerCamera.getMode() === 'local' &&
      this.playerCamera.getPerspective() === 'first';

    if (firstPerson) {
      this.camera.updateMatrixWorld(true);

      return this.muzzleAnchor.getWorldPosition(
        new THREE.Vector3(),
      );
    }

    this.player.mesh.updateMatrixWorld(true);

    return this.player.mesh.localToWorld(
      new THREE.Vector3(0.38, 0.05, 0.82),
    );
  }

  private getAimPoint(): THREE.Vector3 {
    this.camera.updateMatrixWorld(true);

    const direction = new THREE.Vector3();

    this.camera.getWorldDirection(direction);

    this.raycaster.set(
      this.camera.getWorldPosition(new THREE.Vector3()),
      direction.normalize(),
    );

    this.raycaster.far = 100;

    const hits = this.raycaster.intersectObjects(
      this.collidables,
      false,
    );

    if (hits.length > 0) {
      return hits[0]!.point.clone();
    }

    return this.camera
      .getWorldPosition(new THREE.Vector3())
      .addScaledVector(direction, 100);
  }

  private placeBulletHole(
    origin: Vec3,
    direction: Vec3,
  ): void {
    if (this.collidables.length === 0) return;

    const dir = new THREE.Vector3(
      direction.x,
      direction.y,
      direction.z,
    ).normalize();

    this.raycaster.set(
      new THREE.Vector3(
        origin.x,
        origin.y,
        origin.z,
      ),
      dir,
    );

    this.raycaster.far = 100;

    const hit = this.raycaster.intersectObjects(
      this.collidables,
      false,
    )[0];

    if (!hit) return;

    const normal = hit.face
      ? hit.face.normal
          .clone()
          .transformDirection(hit.object.matrixWorld)
      : dir.clone().negate();

    const hole = new THREE.Mesh(
      this.holeGeometry,
      this.holeMaterial,
    );

    hole.position.copy(hit.point);
    hole.position.addScaledVector(normal, 0.02);

    hole.lookAt(
      hit.point.clone().add(normal),
    );

    this.scene.add(hole);
    this.holes.push(hole);

    if (this.holes.length > MAX_HOLES) {
      const old = this.holes.shift();

      if (old) {
        this.scene.remove(old);
      }
    }
  }

  private spawnBullet(
    origin: Vec3,
    direction: Vec3,
    weaponId: WeaponId,
  ): void {
    const dir = new THREE.Vector3(
      direction.x,
      direction.y,
      direction.z,
    ).normalize();

    const mesh = new THREE.Mesh(
      this.bulletGeometry,
      this.bulletMaterial,
    );

    mesh.position.set(
      origin.x,
      origin.y,
      origin.z,
    );

    this.scene.add(mesh);

    const speed =
      weaponId === 'sniper'
        ? SNIPER_BULLET_SPEED
        : BULLET_SPEED;

    this.bullets.push({
      mesh,
      velocity: dir.multiplyScalar(speed),
      age: 0,
    });

    this.placeBulletHole(origin, direction);
  }

  private fireLocal(): void {
    this.camera.updateMatrixWorld(true);

    const muzzle = this.getMuzzlePosition();
    const aimPoint = this.getAimPoint();
    const config = WEAPONS[this.weaponId];

    const pos = this.player.position;

    const eye = pos.clone().add(
      new THREE.Vector3(
        0,
        PLAYER_EYE_HEIGHT,
        0,
      ),
    );

    // Server hit detection begins at the player's eye.
    // Aim toward the same crosshair target as the visual bullet.
    const serverDirection = aimPoint
      .clone()
      .sub(eye)
      .normalize();

    for (
      let i = 0;
      i < config.pellets;
      i += 1
    ) {
      const direction = aimPoint
        .clone()
        .sub(muzzle)
        .normalize();

      // Sniper must be perfectly accurate.
      if (this.weaponId !== 'sniper') {
        direction.x +=
          (Math.random() - 0.5) * config.spread;

        direction.y +=
          (Math.random() - 0.5) * config.spread;

        direction.z +=
          (Math.random() - 0.5) * config.spread;
      }

      direction.normalize();

      this.spawnBullet(
        {
          x: muzzle.x,
          y: muzzle.y,
          z: muzzle.z,
        },
        {
          x: direction.x,
          y: direction.y,
          z: direction.z,
        },
        this.weaponId,
      );
    }

    this.network?.sendMove({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      facing: this.player.facingAngle,
    });

    this.network?.sendShot({
      origin: {
        x: eye.x,
        y: eye.y,
        z: eye.z,
      },
      direction: {
        x: serverDirection.x,
        y: serverDirection.y,
        z: serverDirection.z,
      },
    });
  }

  private tryFire(): boolean {
    if (
      !this.enabled ||
      !this.player.alive ||
      this.reloading
    ) {
      return false;
    }

    const config = WEAPONS[this.weaponId];
    const state = this.states[this.weaponId];

    if (state.ammo <= 0) {
      this.startReload();
      return false;
    }

    const now = performance.now();

    if (
      now - this.lastShotAt <
      config.fireCooldownMs
    ) {
      return false;
    }

    this.lastShotAt = now;

    if (!this.serverControlled) {
      state.ammo -= 1;
    }

    this.weaponRecoil = Math.min(
      1.5,
      this.weaponRecoil + config.recoil,
    );

    this.muzzleTimer = 0.075;

    this.fireLocal();
    this.updateHud();

    return true;
  }

  update(delta: number): void {
    const active =
      this.enabled &&
      this.player.alive;

    const firstPerson =
      active &&
      this.playerCamera.getMode() === 'local' &&
      this.playerCamera.getPerspective() === 'first';

    this.weapon.visible = firstPerson;
    this.hud.style.display = active ? 'block' : 'none';

    if (active) {
      for (const id of WEAPON_IDS) {
        const code = `Digit${WEAPONS[id].slot}`;

        if (this.input.consumeKeyPress(code)) {
          this.switchWeapon(id);
        }
      }

      if (this.input.consumeKeyPress('KeyR')) {
        this.startReload();
      }

      if (this.reloading) {
        this.reloadTimer -= delta;

        if (
          this.reloadTimer <= 0 &&
          !this.serverControlled
        ) {
          this.finishReload();
        }
      }

      let clicked = false;

      while (this.input.consumeShot()) {
        clicked = true;
      }

      const config = WEAPONS[this.weaponId];

      if (
        clicked ||
        (
          config.automatic &&
          this.input.isShootHeld()
        )
      ) {
        this.tryFire();
      }
    } else {
      this.input.clearShots();
    }

    this.animationTime += delta;

    this.weaponRecoil = THREE.MathUtils.lerp(
      this.weaponRecoil,
      0,
      Math.min(1, delta * 12),
    );

    this.muzzleTimer -= delta;

    this.muzzleFlash.visible =
      firstPerson &&
      this.muzzleTimer > 0;

    const moving =
      active &&
      this.input.getMoveDirection().lengthSq() > 0;

    const bob = moving
      ? Math.sin(this.animationTime * 11) * 0.012
      : 0;

    const config = WEAPONS[this.weaponId];

    const reloadProgress = this.reloading
      ? THREE.MathUtils.clamp(
          1 - this.reloadTimer / config.reloadSeconds,
          0,
          1,
        )
      : 0;

    const reloadOffset = this.reloading
      ? Math.sin(reloadProgress * Math.PI) * 0.2
      : 0;

    this.weapon.position.set(
      this.weaponId === 'pistol' ? 0.38 : 0.42,
      -0.34 + bob - reloadOffset,
      -0.65 + this.weaponRecoil * 0.14,
    );

    this.weapon.rotation.x =
      this.weaponRecoil * 0.12 +
      reloadOffset * 0.6;

    for (
      let index = this.bullets.length - 1;
      index >= 0;
      index -= 1
    ) {
      const bullet = this.bullets[index];

      if (!bullet) continue;

      bullet.mesh.position.addScaledVector(
        bullet.velocity,
        delta,
      );

      bullet.age += delta;

      if (bullet.age >= BULLET_LIFETIME) {
        this.scene.remove(bullet.mesh);
        this.bullets.splice(index, 1);
      }
    }
  }

  spawnNetworkShot(shot: ShotEvent): void {
    if (
      shot.shooterId === this.network?.playerId
    ) {
      return;
    }

    this.spawnBullet(
      shot.origin,
      shot.direction,
      shot.weaponId,
    );
  }
}