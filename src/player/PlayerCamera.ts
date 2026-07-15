import * as THREE from 'three';
import type { InputManager } from '../input/InputManager.ts';
import type { Player } from './Player.ts';

const CAMERA_DISTANCE = 6;
const CAMERA_HEIGHT = 1.6;
const SHOULDER_OFFSET = 1;
const MIN_PITCH = -0.3;
const MAX_PITCH = 1.2;
const MOUSE_SENSITIVITY = 0.005;
const FOLLOW_SMOOTH = 0.12;
const FREE_CAM_SPEED = 10;

export type CameraMode = 'local' | 'free' | 'follow';

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
  private followTarget: FollowTarget | null = null;
  private freePosition = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    player: Player,
    input: InputManager,
  ) {
    this.camera = camera;
    this.player = player;
    this.input = input;
    const pos = player.position;
    this.currentPosition.set(pos.x, pos.y + CAMERA_HEIGHT, pos.z + CAMERA_DISTANCE);
    this.freePosition.copy(this.currentPosition);
    this.camera.position.copy(this.currentPosition);
  }

  get yawAngle(): number {
    return this.yaw;
  }

  getMode(): CameraMode {
    return this.mode;
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
    this.pitch = THREE.MathUtils.clamp(this.pitch, MIN_PITCH, MAX_PITCH);

    if (this.mode === 'free') {
      this.updateFree(delta);
      return;
    }

    const source =
      this.mode === 'follow' && this.followTarget
        ? this.followTarget.position
        : this.player.position;

    const lookTarget = new THREE.Vector3(source.x, source.y + 0.9, source.z);
    const aimTarget = lookTarget.clone().addScaledVector(this.getRightDirection(), SHOULDER_OFFSET);

    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch) * CAMERA_DISTANCE,
      Math.sin(this.pitch) * CAMERA_DISTANCE + CAMERA_HEIGHT,
      Math.cos(this.yaw) * Math.cos(this.pitch) * CAMERA_DISTANCE,
    );

    const targetPosition = aimTarget.clone().add(offset);
    this.currentPosition.lerp(targetPosition, FOLLOW_SMOOTH);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(aimTarget);
  }

  private updateFree(delta: number): void {
    const move = this.input.getMoveDirection();
    const forward = this.getLookDirection();
    const right = this.getRightDirection();
    const up = new THREE.Vector3(0, 1, 0);

    this.freePosition.addScaledVector(forward, move.y * FREE_CAM_SPEED * delta);
    this.freePosition.addScaledVector(right, move.x * FREE_CAM_SPEED * delta);

    if (this.input.isKeyDown('Space')) {
      this.freePosition.addScaledVector(up, FREE_CAM_SPEED * delta);
    }
    if (this.input.isKeyDown('ControlLeft') || this.input.isKeyDown('ControlRight')) {
      this.freePosition.addScaledVector(up, -FREE_CAM_SPEED * delta);
    }

    this.camera.position.copy(this.freePosition);
    const lookAt = this.freePosition.clone().add(this.getLookDirection());
    this.camera.lookAt(lookAt);
  }
}
