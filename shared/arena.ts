export interface ArenaObstacle {
  pos: [number, number, number];
  size: [number, number, number];
  color: number;
}

export const GROUND_SIZE = 60;
export const ARENA_HALF = GROUND_SIZE / 2 - 1;

/** Keep spawns / bot recovery well clear of crate AABBs. */
export const SPAWN_CLEARANCE = 3.5;

export const ARENA_OBSTACLES: ArenaObstacle[] = [
  { pos: [6, 1, -4], size: [2, 2, 2], color: 0x8b4513 },
  { pos: [-6, 0.75, 6], size: [3, 1.5, 1.5], color: 0x696969 },
  { pos: [0, 1.25, -12], size: [5, 2.5, 1], color: 0x556b2f },
  { pos: [-10, 0.5, -6], size: [1.5, 1, 1.5], color: 0x8b4513 },
  { pos: [10, 1, 8], size: [3, 2, 2], color: 0x696969 },
  { pos: [-14, 1.25, 10], size: [4, 2.5, 1.5], color: 0x556b2f },
  { pos: [14, 0.75, -14], size: [2, 1.5, 4], color: 0x8b4513 },
  { pos: [0, 1, 14], size: [4, 2, 2], color: 0x696969 },
];

export function isBlockedByObstacle(x: number, z: number, clearance = SPAWN_CLEARANCE): boolean {
  for (const obstacle of ARENA_OBSTACLES) {
    if (pointInObstacle(x, z, clearance, obstacle)) return true;
  }
  return false;
}

/** Random open floor point, never on/near crates. */
export function pickOpenPoint(
  occupied: Array<{ x: number; z: number }> = [],
  minSeparation = 8,
): { x: number; z: number } {
  const edge = ARENA_HALF - 4;

  for (const separation of [minSeparation, minSeparation * 0.75, minSeparation * 0.5, 4]) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = (Math.random() * 2 - 1) * edge;
      const z = (Math.random() * 2 - 1) * edge;
      if (isBlockedByObstacle(x, z)) continue;
      if (occupied.some((o) => Math.hypot(o.x - x, o.z - z) < separation)) continue;
      return { x, z };
    }
  }

  // Guaranteed open ring — verified away from current crate layout.
  const ring = [
    { x: 22, z: 22 },
    { x: -22, z: 22 },
    { x: 22, z: -22 },
    { x: -22, z: -22 },
    { x: 0, z: 24 },
    { x: 0, z: -24 },
    { x: 24, z: 0 },
    { x: -24, z: 0 },
  ];
  for (const point of ring) {
    if (isBlockedByObstacle(point.x, point.z)) continue;
    if (occupied.some((o) => Math.hypot(o.x - point.x, o.z - point.z) < 4)) continue;
    return point;
  }

  return { x: 22, z: 22 };
}

export function pointInObstacle(
  x: number,
  z: number,
  radius: number,
  obstacle: ArenaObstacle,
): boolean {
  const halfX = obstacle.size[0] / 2 + radius;
  const halfZ = obstacle.size[2] / 2 + radius;
  return (
    x >= obstacle.pos[0] - halfX &&
    x <= obstacle.pos[0] + halfX &&
    z >= obstacle.pos[2] - halfZ &&
    z <= obstacle.pos[2] + halfZ
  );
}

export function rayHitsObstacle(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number,
): number | null {
  let closest: number | null = null;

  for (const obstacle of ARENA_OBSTACLES) {
    const minX = obstacle.pos[0] - obstacle.size[0] / 2;
    const maxX = obstacle.pos[0] + obstacle.size[0] / 2;
    const minY = obstacle.pos[1] - obstacle.size[1] / 2;
    const maxY = obstacle.pos[1] + obstacle.size[1] / 2;
    const minZ = obstacle.pos[2] - obstacle.size[2] / 2;
    const maxZ = obstacle.pos[2] + obstacle.size[2] / 2;

    const t = rayAabb(originX, originY, originZ, dirX, dirY, dirZ, minX, minY, minZ, maxX, maxY, maxZ);
    if (t !== null && t >= 0 && t <= maxDist && (closest === null || t < closest)) {
      closest = t;
    }
  }

  return closest;
}

function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number | null {
  const invX = 1 / (dx || 1e-8);
  const invY = 1 / (dy || 1e-8);
  const invZ = 1 / (dz || 1e-8);

  let t1 = (minX - ox) * invX;
  let t2 = (maxX - ox) * invX;
  let tMin = Math.min(t1, t2);
  let tMax = Math.max(t1, t2);

  t1 = (minY - oy) * invY;
  t2 = (maxY - oy) * invY;
  tMin = Math.max(tMin, Math.min(t1, t2));
  tMax = Math.min(tMax, Math.max(t1, t2));

  t1 = (minZ - oz) * invZ;
  t2 = (maxZ - oz) * invZ;
  tMin = Math.max(tMin, Math.min(t1, t2));
  tMax = Math.min(tMax, Math.max(t1, t2));

  if (tMax < 0 || tMin > tMax) return null;
  return tMin >= 0 ? tMin : tMax;
}
