import * as THREE from 'three';
import type { InputManager } from '../input/InputManager.ts';
import type { Player } from './Player.ts';
import type { PlayerCamera } from './PlayerCamera.ts';

const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const JUMP_SPEED = 6;
const ROTATION_SPEED = 12;

export class PlayerController {
  private jumpRequested = false;
  private verticalVelocity = 0;
  private player: Player;
  private input: InputManager;
  private camera: PlayerCamera;
  enabled = true;

  constructor(player: Player, input: InputManager, camera: PlayerCamera) {
    this.player = player;
    this.input = input;
    this.camera = camera;
  }

  update(delta: number): void {
    if (!this.enabled || !this.player.alive) return;

    const moveInput = this.input.getMoveDirection();
    const speed = this.input.isSprinting() ? SPRINT_SPEED : WALK_SPEED;

    const cameraForward = this.camera.getForwardDirection();
    const cameraRight = this.camera.getRightDirection();

    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(cameraForward, -moveInput.y);
    moveDir.addScaledVector(cameraRight, moveInput.x);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      const currentAngle = this.player.facingAngle;
      let angleDiff = targetAngle - currentAngle;

      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      this.player.setFacingAngle(currentAngle + angleDiff * Math.min(1, ROTATION_SPEED * delta));
    }

    const horizontalMovement = moveDir.multiplyScalar(speed * delta);

    if (this.player.isGrounded) {
      this.verticalVelocity = 0;

      if (this.input.isJumpPressed() && !this.jumpRequested) {
        this.verticalVelocity = JUMP_SPEED;
        this.jumpRequested = true;
      }
    } else {
      this.verticalVelocity -= 9.81 * delta;

      if (!this.input.isJumpPressed()) {
        this.jumpRequested = false;
      }
    }

    const desiredMovement = new THREE.Vector3(
      horizontalMovement.x,
      this.verticalVelocity * delta,
      horizontalMovement.z,
    );

    this.player.move(desiredMovement);
    this.player.velocity.set(
      horizontalMovement.x / Math.max(delta, 0.0001),
      this.verticalVelocity,
      horizontalMovement.z / Math.max(delta, 0.0001),
    );
  }
}
