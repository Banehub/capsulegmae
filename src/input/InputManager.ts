import * as THREE from 'three';

export class InputManager {
  private keys = new Set<string>();
  private mouseDelta = new THREE.Vector2();
  private shotsQueued = 0;
  private shootHeld = false;
  private justPressed = new Set<string>();

  constructor(domElement: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
      }
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    domElement.addEventListener('mousemove', (e) => {
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    });

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.shotsQueued += 1;
        this.shootHeld = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shootHeld = false;
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.justPressed.clear();
      this.shootHeld = false;
    });
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

    if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) dir.y += 1;
    if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) dir.y -= 1;
    if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) dir.x -= 1;
    if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) dir.x += 1;

    if (dir.lengthSq() > 0) dir.normalize();
    return dir;
  }

  isSprinting(): boolean {
    return this.isKeyDown('ShiftLeft') || this.isKeyDown('ShiftRight');
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
