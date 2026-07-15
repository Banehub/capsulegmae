import { ARENA_HALF, ARENA_OBSTACLES, isBlockedByObstacle, pickOpenPoint, pointInObstacle, rayHitsObstacle } from '../../shared/arena.ts';
import {
  FIRE_COOLDOWN_MS,
  PLAYER_EYE_HEIGHT,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '../../shared/combat.ts';
import type { BotDifficulty, ShotEvent, ShotIntent, Vec3 } from '../../shared/protocol.ts';

export interface BotActor {
  id: string;
  x: number;
  y: number;
  z: number;
  facing: number;
  alive: boolean;
  lastShotAt: number;
  targetId: string | null;
  waypoint: Vec3 | null;
  roamTimer: number;
  reactionTimer: number;
  groundY: number;
  verticalVelocity: number;
  jumpCooldown: number;
  stuckTimer: number;
  avoidanceDirection: number;
  steerAngle: number;
}

export interface BotPeer {
  id: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
}

export interface DifficultyProfile {
  moveSpeed: number;
  aimError: number;
  fireExtraDelayMs: number;
  reactionTime: number;
  acquireRange: number;
}

export const DIFFICULTY_PROFILES: Record<BotDifficulty, DifficultyProfile> = {
  easy: {
    moveSpeed: 3.6,
    aimError: 0.28,
    fireExtraDelayMs: 700,
    reactionTime: 0.55,
    acquireRange: 28,
  },
  normal: {
    moveSpeed: 5.2,
    aimError: 0.14,
    fireExtraDelayMs: 320,
    reactionTime: 0.28,
    acquireRange: 45,
  },
  hard: {
    moveSpeed: 6.8,
    aimError: 0.045,
    fireExtraDelayMs: 80,
    reactionTime: 0.12,
    acquireRange: 60,
  },
};

export interface BotTickResult {
  shots: ShotIntent[];
}

const COLLIDE_RADIUS = PLAYER_RADIUS + 0.2;

export function createBotActor(id: string, x: number, y: number, z: number): BotActor {
  const pos = ensureClear(x, z, y);
  return {
    id,
    x: pos.x,
    y,
    z: pos.z,
    facing: 0,
    alive: true,
    lastShotAt: 0,
    targetId: null,
    waypoint: null,
    roamTimer: 0,
    reactionTimer: 0,
    groundY: y,
    verticalVelocity: 0,
    jumpCooldown: 0,
    stuckTimer: 0,
    avoidanceDirection: Math.random() < 0.5 ? -1 : 1,
    steerAngle: 0,
  };
}

export function tickBot(
  bot: BotActor,
  peers: BotPeer[],
  difficulty: BotDifficulty,
  dt: number,
  now: number,
  tryShoot: (intent: ShotIntent) => ShotEvent | null,
): BotTickResult {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const shots: ShotIntent[] = [];

  if (!bot.alive) return { shots };

  // Already inside geometry (bad spawn / corner trap) — yank free.
  if (collides(bot.x, bot.z, bot.y)) {
    hardUnstick(bot);
  }

  bot.reactionTimer = Math.max(0, bot.reactionTimer - dt);
  bot.roamTimer -= dt;
  bot.jumpCooldown = Math.max(0, bot.jumpCooldown - dt);
  bot.steerAngle *= Math.max(0, 1 - dt * 2.5);
  updateJump(bot, dt);

  const living = peers.filter((p) => p.alive && p.id !== bot.id);
  let target = living.find((p) => p.id === bot.targetId) ?? null;

  if (!target || bot.reactionTimer <= 0) {
    target = findNearestVisible(bot, living, profile.acquireRange);
    bot.targetId = target?.id ?? null;
    bot.reactionTimer = profile.reactionTime * (0.7 + Math.random() * 0.6);
  }

  let wishX = 0;
  let wishZ = 0;

  if (target) {
    const toTargetX = target.x - bot.x;
    const toTargetZ = target.z - bot.z;
    const dist = Math.hypot(toTargetX, toTargetZ) || 1;

    bot.facing = Math.atan2(toTargetX, toTargetZ);

    const preferred = dist > 12 ? 1 : dist < 5 ? -0.75 : 0.2;
    const strafe = Math.sin(now * 0.005 + hashId(bot.id)) * 0.85;
    const fx = toTargetX / dist;
    const fz = toTargetZ / dist;
    const rx = fz;
    const rz = -fx;
    const separation = getSeparation(bot, living);

    wishX = fx * preferred + rx * strafe + separation.x;
    wishZ = fz * preferred + rz * strafe + separation.z;

    if (hasLineOfSight(bot, target) && dist < profile.acquireRange) {
      const cooldown = FIRE_COOLDOWN_MS + profile.fireExtraDelayMs;
      if (now - bot.lastShotAt >= cooldown) {
        const intent = aimAt(bot, target, profile.aimError);
        const shot = tryShoot(intent);
        if (shot) {
          bot.lastShotAt = now;
          shots.push(intent);
        }
      }
    }
  } else {
    if (!bot.waypoint || bot.roamTimer <= 0 || nearPoint(bot, bot.waypoint, 1.5)) {
      bot.waypoint = randomWaypoint(bot.x, bot.z);
      bot.roamTimer = 2 + Math.random() * 3;
    }

    const dx = bot.waypoint.x - bot.x;
    const dz = bot.waypoint.z - bot.z;
    const len = Math.hypot(dx, dz) || 1;
    bot.facing = Math.atan2(dx, dz);
    wishX = dx / len;
    wishZ = dz / len;
  }

  const avoid = probeAvoidance(bot, wishX, wishZ);
  wishX += avoid.x + Math.sin(bot.steerAngle);
  wishZ += avoid.z + Math.cos(bot.steerAngle);

  const wishLen = Math.hypot(wishX, wishZ) || 1;
  moveBot(
    bot,
    (wishX / wishLen) * profile.moveSpeed * dt,
    (wishZ / wishLen) * profile.moveSpeed * dt,
    dt,
  );

  if (bot.stuckTimer > 0.35) {
    bot.avoidanceDirection *= -1;
    bot.steerAngle = bot.avoidanceDirection * (0.9 + Math.random() * 1.2);
    tryJump(bot);
    bot.waypoint = randomWaypoint(bot.x, bot.z);
    bot.targetId = null;
    bot.roamTimer = 1.5;
  }

  if (bot.stuckTimer > 0.7) {
    hardUnstick(bot);
  }

  return { shots };
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

function findNearestVisible(bot: BotActor, living: BotPeer[], range: number): BotPeer | null {
  let best: BotPeer | null = null;
  let bestDist = range;

  for (const peer of living) {
    const dist = Math.hypot(peer.x - bot.x, peer.z - bot.z);
    if (dist >= bestDist) continue;
    if (!hasLineOfSight(bot, peer)) continue;
    best = peer;
    bestDist = dist;
  }

  return best;
}

function hasLineOfSight(from: BotActor, to: BotPeer): boolean {
  const ox = from.x;
  const oy = from.y + PLAYER_EYE_HEIGHT;
  const oz = from.z;
  const dx = to.x - ox;
  const dy = to.y + PLAYER_EYE_HEIGHT - oy;
  const dz = to.z - oz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;

  const hit = rayHitsObstacle(ox, oy, oz, dx / dist, dy / dist, dz / dist, dist - 0.4);
  return hit === null;
}

function aimAt(bot: BotActor, target: BotPeer, aimError: number): ShotIntent {
  const origin = {
    x: bot.x,
    y: bot.y + PLAYER_EYE_HEIGHT,
    z: bot.z,
  };

  let dx = target.x - origin.x;
  let dy = target.y + PLAYER_EYE_HEIGHT - origin.y;
  let dz = target.z - origin.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;

  dx += (Math.random() * 2 - 1) * aimError;
  dy += (Math.random() * 2 - 1) * aimError * 0.5;
  dz += (Math.random() * 2 - 1) * aimError;

  const n = Math.hypot(dx, dy, dz) || 1;
  return {
    origin,
    direction: { x: dx / n, y: dy / n, z: dz / n },
  };
}

function moveBot(bot: BotActor, dx: number, dz: number, dt: number): void {
  const oldX = bot.x;
  const oldZ = bot.z;

  const attempts: Array<[number, number]> = [
    [dx, dz],
    [dx, 0],
    [0, dz],
    [-dz * bot.avoidanceDirection, dx * bot.avoidanceDirection],
    [dz * bot.avoidanceDirection, -dx * bot.avoidanceDirection],
    [-dx, dz],
    [dx, -dz],
    [-dx, -dz],
  ];

  let moved = false;
  for (const [ax, az] of attempts) {
    const nextX = clamp(bot.x + ax, -ARENA_HALF, ARENA_HALF);
    const nextZ = clamp(bot.z + az, -ARENA_HALF, ARENA_HALF);
    if (!collides(nextX, nextZ, bot.y)) {
      bot.x = nextX;
      bot.z = nextZ;
      moved = true;
      break;
    }
  }

  if (!moved) {
    const step = 0.45 + dt * 4;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + bot.steerAngle;
      const nx = clamp(oldX + Math.cos(a) * step, -ARENA_HALF, ARENA_HALF);
      const nz = clamp(oldZ + Math.sin(a) * step, -ARENA_HALF, ARENA_HALF);
      if (!collides(nx, nz, bot.y)) {
        bot.x = nx;
        bot.z = nz;
        moved = true;
        break;
      }
    }
    tryJump(bot);
  }

  const distMoved = Math.hypot(bot.x - oldX, bot.z - oldZ);
  bot.stuckTimer = distMoved < 0.01 ? bot.stuckTimer + dt : 0;
}

function probeAvoidance(bot: BotActor, wishX: number, wishZ: number): { x: number; z: number } {
  const len = Math.hypot(wishX, wishZ) || 1;
  const fx = wishX / len;
  const fz = wishZ / len;
  const look = 1.8;

  let x = 0;
  let z = 0;

  if (collides(bot.x + fx * look, bot.z + fz * look, bot.y)) {
    x += -fz * bot.avoidanceDirection * 1.4;
    z += fx * bot.avoidanceDirection * 1.4;
  }

  for (const obstacle of ARENA_OBSTACLES) {
    const dx = bot.x - obstacle.pos[0];
    const dz = bot.z - obstacle.pos[2];
    const dist = Math.hypot(dx, dz);
    const danger = Math.max(obstacle.size[0], obstacle.size[2]) / 2 + 2.2;
    if (dist > 0.001 && dist < danger) {
      const strength = (danger - dist) / danger;
      x += (dx / dist) * strength * 1.6;
      z += (dz / dist) * strength * 1.6;
    }
  }

  return { x, z };
}

function hardUnstick(bot: BotActor): void {
  // Always fling to open floor somewhere else on the map — never nudge beside a crate.
  const clear = pickOpenPoint([{ x: bot.x, z: bot.z }], 12);
  bot.x = clear.x;
  bot.z = clear.z;
  bot.y = bot.groundY;
  bot.verticalVelocity = 0;
  bot.waypoint = randomWaypoint(bot.x, bot.z);
  bot.targetId = null;
  bot.roamTimer = 1.2;
  bot.avoidanceDirection *= -1;
  bot.steerAngle = bot.avoidanceDirection * Math.PI * 0.5;
  bot.stuckTimer = 0;
}

function ensureClear(x: number, z: number, _y: number): { x: number; z: number } {
  if (!isBlockedByObstacle(x, z) && !collides(x, z, _y)) return { x, z };
  const open = pickOpenPoint([], 8);
  return { x: open.x, z: open.z };
}

function collides(x: number, z: number, y = 0): boolean {
  if (Math.abs(x) > ARENA_HALF || Math.abs(z) > ARENA_HALF) return true;
  // Treat crate footprints as solid regardless of jump height so bots can't "live" inside them.
  if (isBlockedByObstacle(x, z, PLAYER_RADIUS + 0.35)) return true;

  const feetY = y - PLAYER_HALF_HEIGHT - PLAYER_RADIUS;
  for (const obstacle of ARENA_OBSTACLES) {
    const obstacleTop = obstacle.pos[1] + obstacle.size[1] / 2;
    if (feetY > obstacleTop + 0.12) continue;
    if (pointInObstacle(x, z, COLLIDE_RADIUS, obstacle)) return true;
  }
  return false;
}

function randomWaypoint(fromX = 0, fromZ = 0): Vec3 {
  const open = pickOpenPoint([{ x: fromX, z: fromZ }], 8);
  return { x: open.x, y: 0, z: open.z };
}

function tryJump(bot: BotActor): void {
  if (bot.jumpCooldown > 0 || bot.y > bot.groundY + 0.02) return;
  bot.verticalVelocity = 6.2;
  bot.jumpCooldown = 0.9;
}

function updateJump(bot: BotActor, dt: number): void {
  if (bot.y <= bot.groundY && bot.verticalVelocity <= 0) {
    bot.y = bot.groundY;
    bot.verticalVelocity = 0;
    return;
  }

  bot.verticalVelocity -= 14 * dt;
  bot.y += bot.verticalVelocity * dt;
  if (bot.y < bot.groundY) {
    bot.y = bot.groundY;
    bot.verticalVelocity = 0;
  }
}

function getSeparation(bot: BotActor, peers: BotPeer[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const peer of peers) {
    const dx = bot.x - peer.x;
    const dz = bot.z - peer.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001 && dist < 2.2) {
      const strength = (2.2 - dist) / 2.2;
      x += (dx / dist) * strength * 1.4;
      z += (dz / dist) * strength * 1.4;
    }
  }
  return { x, z };
}

function nearPoint(bot: BotActor, point: Vec3, radius: number): boolean {
  return Math.hypot(bot.x - point.x, bot.z - point.z) <= radius;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
