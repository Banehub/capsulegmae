import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT } from '../../shared/combat.ts';
import type { InputManager } from '../input/InputManager.ts';
import type { Player } from './Player.ts';

const CAMERA_DISTANCE = 6;
const CAMERA_HEIGHT = 1.6;
const SHOULDER_OFFSET = 1;
const MIN_PITCH = -1.45;
const MAX_PITCH = 1.45;
const MOUSE_SENSITIVITY = 0.003;
const FOLLOW_SMOOTH = 0.12;
const FREE_CAM_SPEED = 10;

export type CameraMode = 'local' | 'free' | 'follow';
export type PerspectiveMode = 'first' | 'third';

export interface FollowTarget {
  position: THREE.Vector3;
}

export class PlayerCamera {
  private yaw = 0;
  private pitch = 0.3;

  private currentPosition = new THREE.Vector3();

  private camera: THREE.PerspectiveCamera;
  private player: Player;
  private input: InputManager;

  private mode: CameraMode = 'local';
  private perspective: PerspectiveMode = 'third';

  private followTarget: FollowTarget | null = null;
  private freePosition = new THREE.Vector3();

  private rightMouseHeld = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    player: Player,
    input: InputManager,
  ) {
    this.camera = camera;
    this.player = player;
    this.input = input;

    const pos = player.position;

    this.currentPosition.set(
      pos.x,
      pos.y + CAMERA_HEIGHT,
      pos.z + CAMERA_DISTANCE,
    );

    this.freePosition.copy(this.currentPosition);
    this.camera.position.copy(this.currentPosition);

    window.addEventListener('mousedown', (event) => {
      if (event.button === 2) {
        this.rightMouseHeld = true;
      }
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        this.rightMouseHeld = false;
      }
    });

    window.addEventListener('blur', () => {
      this.rightMouseHeld = false;
    });

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        this.rightMouseHeld = false;
      }
    });
  }

  get yawAngle(): number {
    return this.yaw;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  getPerspective(): PerspectiveMode {
    return this.perspective;
  }

  togglePerspective(): PerspectiveMode {
    // ADS should not force the player into first person.
    // The game calls this while right-click aiming begins,
    // so ignore that automatic perspective change.
    if (this.rightMouseHeld && this.mode === 'local') {
      return this.perspective;
    }

    this.perspective =
      this.perspective === 'third'
        ? 'first'
        : 'third';

    this.currentPosition.copy(this.camera.position);

    return this.perspective;
  }

  getForwardDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw),
    ).normalize();
  }

  getRightDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw),
    ).normalize();
  }

  getLookDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();
  }

  setLocalMode(): void {
    this.mode = 'local';
    this.followTarget = null;
  }

  setFreeMode(): void {
    this.mode = 'free';
    this.followTarget = null;
    this.freePosition.copy(this.camera.position);
  }

  setFollowMode(target: FollowTarget): void {
    this.mode = 'follow';
    this.followTarget = target;
  }

  update(delta: number): void {
    const mouseDelta = this.input.consumeMouseDelta();

    this.yaw -= mouseDelta.x * MOUSE_SENSITIVITY;
    this.pitch += mouseDelta.y * MOUSE_SENSITIVITY;

    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      MIN_PITCH,
      MAX_PITCH,
    );

    if (this.mode === 'free') {
      this.updateFree(delta);
      return;
    }

    const source =
      this.mode === 'follow' && this.followTarget
        ? this.followTarget.position
        : this.player.position;

    if (
      this.mode === 'local' &&
      this.perspective === 'first'
    ) {
      const eye = new THREE.Vector3(
        source.x,
        source.y + PLAYER_EYE_HEIGHT,
        source.z,
      );

      this.currentPosition.copy(eye);
      this.camera.position.copy(eye);

      this.camera.lookAt(
        eye.clone().add(this.getLookDirection()),
      );

      return;
    }

    const lookDirection = this.getLookDirection();
    const rightDirection = this.getRightDirection();

    const playerTarget = new THREE.Vector3(
      source.x,
      source.y + PLAYER_EYE_HEIGHT,
      source.z,
    );

    const shoulderPosition = playerTarget
      .clone()
      .addScaledVector(
        rightDirection,
        SHOULDER_OFFSET,
      );

    // Position the third-person camera behind the player.
    // Keep the shoulder offset without changing the aim direction.
    const targetPosition = shoulderPosition
      .clone()
      .addScaledVector(
        lookDirection,
        -CAMERA_DISTANCE,
      );

    targetPosition.y += CAMERA_HEIGHT;

    const smoothing =
      1 - Math.exp(-12 * Math.max(0, delta));

    this.currentPosition.lerp(
      targetPosition,
      smoothing,
    );

    this.camera.position.copy(this.currentPosition);

    // Important: camera looks along the actual aim direction.
    // This keeps the center-screen crosshair aligned with
    // the camera ray used by the shooting system.
    this.camera.lookAt(
      this.camera.position
        .clone()
        .add(lookDirection),
    );
  }

  private updateFree(delta: number): void {
    const move = this.input.getMoveDirection();
    const forward = this.getLookDirection();
    const right = this.getRightDirection();
    const up = new THREE.Vector3(0, 1, 0);

    this.freePosition.addScaledVector(
      forward,
      move.y * FREE_CAM_SPEED * delta,
    );

    this.freePosition.addScaledVector(
      right,
      move.x * FREE_CAM_SPEED * delta,
    );

    if (this.input.isKeyDown('Space')) {
      this.freePosition.addScaledVector(
        up,
        FREE_CAM_SPEED * delta,
      );
    }

    if (
      this.input.isKeyDown('ControlLeft') ||
      this.input.isKeyDown('ControlRight')
    ) {
      this.freePosition.addScaledVector(
        up,
        -FREE_CAM_SPEED * delta,
      );
    }

    this.camera.position.copy(this.freePosition);

    this.camera.lookAt(
      this.freePosition
        .clone()
        .add(this.getLookDirection()),
    );
  }
}