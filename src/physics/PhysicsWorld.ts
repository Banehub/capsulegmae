import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  world!: RAPIER.World;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.initialized = true;
  }

  step(delta: number): void {
    this.world.timestep = Math.min(delta, 1 / 30);
    this.world.step();
  }
}
