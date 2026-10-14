
import * as THREE from 'three';

export class InputManager {
  private keys = new Set<string>();
  private mouseDelta = new THREE.Vector2();
  private shotsQueued = 0;
  private shootHeld = false;
  private justPressed = new Set<string>();
  private domElement: HTMLElement;
  private pointerLockEnabled = false;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
      }

      this.keys.add(e.code);

      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
          .includes(e.code)
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLockEnabled) {
        if (!this.isPointerLocked()) return;
      } else if (e.target !== this.domElement) {
        return;
      }

      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    });

    this.domElement.addEventListener('mousedown', (e) => {
      if (this.pointerLockEnabled && !this.isPointerLocked()) {
        this.requestPointerLock();
        return;
      }

      if (e.button === 0) {
        this.shotsQueued += 1;
        this.shootHeld = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.shootHeld = false;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseDelta.set(0, 0);

      if (!this.isPointerLocked()) {
        this.shootHeld = false;
        this.shotsQueued = 0;
      }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.justPressed.clear();
      this.shootHeld = false;
      this.shotsQueued = 0;
      this.mouseDelta.set(0, 0);
    });
  }

  enablePointerLock(enabled: boolean): void {
    this.pointerLockEnabled = enabled;

    if (!enabled) {
      this.releasePointerLock();
      this.mouseDelta.set(0, 0);
      this.clearShots();
    }
  }

  requestPointerLock(): void {
    if (!this.pointerLockEnabled || this.isPointerLocked()) {
      return;
    }

    if (typeof this.domElement.requestPointerLock !== 'function') {
      return;
    }

    try {
      const result = this.domElement.requestPointerLock();

      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch {
      // Browser may reject pointer lock without user interaction.
    }
  }

  releasePointerLock(): void {
    if (
      this.isPointerLocked() &&
      typeof document.exitPointerLock === 'function'
    ) {
      document.exitPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.domElement;
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumeKeyPress(code: string): boolean {
    if (!this.justPressed.has(code)) return false;

    this.justPressed.delete(code);
    return true;
  }

  getMoveDirection(): THREE.Vector2 {
    const dir = new THREE.Vector2();

    if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) {
      dir.y += 1;
    }

    if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) {
      dir.y -= 1;
    }

    if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) {
      dir.x -= 1;
    }

    if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) {
      dir.x += 1;
    }

    if (dir.lengthSq() > 0) {
      dir.normalize();
    }

    return dir;
  }

  isSprinting(): boolean {
    return (
      this.isKeyDown('ShiftLeft') ||
      this.isKeyDown('ShiftRight')
    );
  }

  isJumpPressed(): boolean {
    return this.isKeyDown('Space');
  }

  consumeMouseDelta(): THREE.Vector2 {
    const delta = this.mouseDelta.clone();
    this.mouseDelta.set(0, 0);
    return delta;
  }

  consumeShot(): boolean {
    if (this.shotsQueued === 0) return false;

    this.shotsQueued -= 1;
    return true;
  }

  isShootHeld(): boolean {
    return this.shootHeld;
  }

  clearShots(): void {
    this.shotsQueued = 0;
  }

  endFrame(): void {
    this.justPressed.clear();
  }
}
