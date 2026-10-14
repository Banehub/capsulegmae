import * as THREE from 'three';
import type { InputManager } from '../input/InputManager.ts';
import type { Player } from './Player.ts';
import type { PlayerCamera } from './PlayerCamera.ts';

const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const JUMP_SPEED = 6;
const ROTATION_SPEED = 12;
const GRAVITY = 9.81;

export class PlayerController {
  private jumpRequested = false;
  private verticalVelocity = 0;
  private wasGrounded = true;
  private fallSpeed = 0;

  private player: Player;
  private input: InputManager;
  private camera: PlayerCamera;

  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private moveDirection = new THREE.Vector3();
  private worldUp = new THREE.Vector3(0, 1, 0);

  enabled = true;

  constructor(
    player: Player,
    input: InputManager,
    camera: PlayerCamera,
  ) {
    this.player = player;
    this.input = input;
    this.camera = camera;
  }

  update(delta: number): void {
    if (!this.enabled || !this.player.alive) {
      return;
    }

    const grounded = this.player.isGrounded;

    if (grounded && !this.wasGrounded) {
      window.dispatchEvent(
        new CustomEvent('lps:land', {
          detail: Math.max(
            0.65,
            Math.min(1.8, this.fallSpeed / 7),
          ),
        }),
      );

      this.fallSpeed = 0;
    }

    this.wasGrounded = grounded;

    window.dispatchEvent(
      new CustomEvent('lps:grounded', {
        detail: grounded,
      }),
    );

    const moveInput = this.input.getMoveDirection();

    const speed = this.input.isSprinting()
      ? SPRINT_SPEED
      : WALK_SPEED;

    const gameCamera = this.getGameCamera();

    gameCamera.getWorldDirection(this.forward);

    this.forward.y = 0;

    if (this.forward.lengthSq() < 0.0001) {
      this.forward.copy(this.camera.getLookDirection());
      this.forward.y = 0;
    }

    this.forward.normalize();

    this.right
      .crossVectors(this.forward, this.worldUp)
      .normalize();

    this.moveDirection.set(0, 0, 0);

    this.moveDirection.addScaledVector(
      this.forward,
      moveInput.y,
    );

    this.moveDirection.addScaledVector(
      this.right,
      moveInput.x,
    );

    if (this.moveDirection.lengthSq() > 0) {
      this.moveDirection.normalize();
    }

    const isFirstPerson =
      this.camera.getMode() === 'local' &&
      this.camera.getPerspective() === 'first';

    if (isFirstPerson) {
      const targetAngle = Math.atan2(
        this.forward.x,
        this.forward.z,
      );

      this.rotateTowards(targetAngle, delta);
    } else if (this.moveDirection.lengthSq() > 0) {
      const targetAngle = Math.atan2(
        this.moveDirection.x,
        this.moveDirection.z,
      );

      this.rotateTowards(targetAngle, delta);
    }

    const horizontalMovement = this.moveDirection
      .clone()
      .multiplyScalar(speed * delta);

    if (this.player.isGrounded) {
      this.verticalVelocity = 0;

      if (
        this.input.isJumpPressed() &&
        !this.jumpRequested
      ) {
        this.verticalVelocity = JUMP_SPEED;
        this.jumpRequested = true;
        this.wasGrounded = false;

        window.dispatchEvent(
          new Event('lps:jump'),
        );
      }

      if (!this.input.isJumpPressed()) {
        this.jumpRequested = false;
      }
    } else {
      this.verticalVelocity -= GRAVITY * delta;

      this.fallSpeed = Math.max(
        this.fallSpeed,
        -this.verticalVelocity,
      );

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

    const safeDelta = Math.max(delta, 0.0001);

    this.player.velocity.set(
      horizontalMovement.x / safeDelta,
      this.verticalVelocity,
      horizontalMovement.z / safeDelta,
    );
  }

  private getGameCamera(): THREE.Camera {
    const cameraObject = (
      this.camera as unknown as {
        camera: THREE.Camera;
      }
    ).camera;

    return cameraObject;
  }

  private rotateTowards(
    targetAngle: number,
    delta: number,
  ): void {
    const currentAngle = this.player.facingAngle;

    let angleDiff = targetAngle - currentAngle;

    while (angleDiff > Math.PI) {
      angleDiff -= Math.PI * 2;
    }

    while (angleDiff < -Math.PI) {
      angleDiff += Math.PI * 2;
    }

    const rotationAmount = Math.min(
      1,
      ROTATION_SPEED * delta,
    );

    const newAngle =
      currentAngle + angleDiff * rotationAmount;

    this.player.setFacingAngle(newAngle);
  }
}