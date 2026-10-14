
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  MAX_HEALTH,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '../../shared/combat.ts';
import type { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { createCharacterBody } from './createCharacterBody.ts';

export class Player {
  readonly mesh: THREE.Group;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly characterController: RAPIER.KinematicCharacterController;

  velocity = new THREE.Vector3();
  isGrounded = false;
  facingAngle = 0;
  health = MAX_HEALTH;
  alive = true;
  name = 'Player';

  private readonly visual: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly weapon: THREE.Group;
  private readonly animateCharacter: (delta: number, speed: number) => void;
  private previousPosition = new THREE.Vector3();
  private lastSync = performance.now();

  constructor(
    scene: THREE.Scene,
    physicsWorld: PhysicsWorld,
    color = 0x3366cc,
  ) {
    const character = createCharacterBody(color);

    this.mesh = character.group;
    this.visual = character.body;
    this.material = character.body.material as THREE.MeshStandardMaterial;
    this.weapon = character.weapon;
    this.animateCharacter = character.animate;

    scene.add(this.mesh);

    this.body = physicsWorld.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(
          0,
          PLAYER_RADIUS + PLAYER_HALF_HEIGHT,
          0,
        )
        .lockRotations(),
    );

    this.collider = physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        PLAYER_HALF_HEIGHT,
        PLAYER_RADIUS,
      ),
      this.body,
    );

    this.characterController =
      physicsWorld.world.createCharacterController(0.01);

    this.characterController
      .setApplyImpulsesToDynamicBodies(true);

    this.characterController.enableSnapToGround(0.3);
    this.characterController.enableAutostep(
      0.5,
      0.2,
      true,
    );
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();

    return new THREE.Vector3(t.x, t.y, t.z);
  }

  setColor(color: number): void {
    this.material.color.setHex(color);
  }

  setSpawn(
    x: number,
    y: number,
    z: number,
    facing = 0,
  ): void {
    this.body.setNextKinematicTranslation({
      x,
      y,
      z,
    });

    this.body.setTranslation(
      { x, y, z },
      true,
    );

    this.mesh.position.set(x, y, z);
    this.previousPosition.copy(this.mesh.position);
    this.lastSync = performance.now();
    this.setFacingAngle(facing);

    this.health = MAX_HEALTH;
    this.alive = true;
    this.mesh.visible = true;
  }

  setHealth(
    health: number,
    alive: boolean,
  ): void {
    this.health = health;
    this.alive = alive;
    this.mesh.visible = alive;
  }

  move(desiredMovement: THREE.Vector3): void {
    if (!this.alive) return;

    const currentPos = this.body.translation();

    this.characterController.computeColliderMovement(
      this.collider,
      {
        x: desiredMovement.x,
        y: desiredMovement.y,
        z: desiredMovement.z,
      },
    );

    const corrected =
      this.characterController.computedMovement();

    const nextPos = {
      x: currentPos.x + corrected.x,
      y: currentPos.y + corrected.y,
      z: currentPos.z + corrected.z,
    };

    this.body.setNextKinematicTranslation(nextPos);

    this.isGrounded =
      this.characterController.computedGrounded();
  }

  setFacingAngle(angle: number): void {
    this.facingAngle = angle;
    this.mesh.rotation.y = angle;
  }

  syncMesh(): void {
    const t = this.body.translation();

    const now = performance.now();
    const delta = Math.min(
      0.1,
      Math.max(0.001, (now - this.lastSync) / 1000),
    );

    this.lastSync = now;

    this.mesh.position.set(t.x, t.y, t.z);

    const distance = this.mesh.position.distanceTo(this.previousPosition);

    this.animateCharacter(
      delta,
      this.isGrounded ? distance / delta : 0,
    );

    this.previousPosition.copy(this.mesh.position);
  }
}
