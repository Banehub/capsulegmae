import { pickOpenPoint } from '../../shared/arena.ts';
import {
  BULLET_DAMAGE,
  FIRE_COOLDOWN_MS,
  HITBOX_FORGIVENESS,
  MAX_HEALTH,
  MAX_PLAYERS,
  MAX_SHOT_RANGE,
  MIN_PLAYERS_TO_START,
  PLAYER_EYE_HEIGHT,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '../../shared/combat.ts';
import type {
  BotDifficulty,
  GameMode,
  MovementUpdate,
  PlayerSnapshot,
  RoomPhase,
  RoomSnapshot,
  ShotEvent,
  ShotIntent,
  Standing,
  Vec3,
} from '../../shared/protocol.ts';
import { createBotActor, tickBot, type BotActor } from './BotAI.ts';

const PLAYER_COLORS = [
  0x3366cc,
  0xcc3333,
  0x33aa55,
  0xccaa22,
  0xaa33cc,
  0x33aabb,
  0xcc6633,
  0x8888aa,
];

const SPAWN_Y = PLAYER_RADIUS + PLAYER_HALF_HEIGHT;

interface RoomPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  facing: number;
  health: number;
  alive: boolean;
  color: number;
  lastShotAt: number;
  isBot: boolean;
}

export class Room {
  phase: RoomPhase = 'lobby';
  hostId: string;
  winnerId: string | null = null;
  winnerName: string | null = null;
  mode: GameMode = 'pvp';
  botCount = 0;
  difficulty: BotDifficulty | null = null;
  private players = new Map<string, RoomPlayer>();
  private bots = new Map<string, BotActor>();
  private eliminationOrder: string[] = [];
  code: string;

  constructor(code: string, hostId: string, hostName: string, mode: GameMode = 'pvp') {
    this.code = code;
    this.hostId = hostId;
    this.mode = mode;
    this.addPlayer(hostId, hostName);
  }

  get playerCount(): number {
    return this.players.size;
  }

  get humanCount(): number {
    return [...this.players.values()].filter((p) => !p.isBot).length;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  addPlayer(id: string, name: string): { ok: true } | { ok: false; error: string } {
    if (this.phase !== 'lobby') {
      return { ok: false, error: 'Match already in progress' };
    }
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, error: 'Room is full' };
    }
    if (this.players.has(id)) {
      return { ok: false, error: 'Already in room' };
    }

    const occupied = [...this.players.values()].map(({ x, y, z }) => ({ x, y, z }));
    const spawn = createRandomSpawn(occupied);
    this.players.set(id, {
      id,
      name: name.trim().slice(0, 16) || 'Player',
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      facing: 0,
      health: MAX_HEALTH,
      alive: true,
      color: PLAYER_COLORS[this.players.size % PLAYER_COLORS.length]!,
      lastShotAt: 0,
      isBot: false,
    });

    return { ok: true };
  }

  configureSolo(
    botCount: number,
    difficulty: BotDifficulty,
  ): { ok: true } | { ok: false; error: string } {
    if (this.mode !== 'solo') {
      return { ok: false, error: 'Not a solo room' };
    }
    if (botCount < 1 || botCount > 7) {
      return { ok: false, error: 'Bot count must be 1–7' };
    }
    if (1 + botCount > MAX_PLAYERS) {
      return { ok: false, error: 'Too many bots' };
    }

    this.botCount = botCount;
    this.difficulty = difficulty;

    for (let i = 0; i < botCount; i += 1) {
      const id = `bot-${this.code}-${i + 1}`;
      const occupied = [...this.players.values()].map(({ x, y, z }) => ({ x, y, z }));
      const spawn = createRandomSpawn(occupied);
      const bot = createBotActor(id, spawn.x, spawn.y, spawn.z);
      this.players.set(id, {
        id,
        name: `Bot ${i + 1}`,
        x: bot.x,
        y: bot.y,
        z: bot.z,
        facing: 0,
        health: MAX_HEALTH,
        alive: true,
        color: PLAYER_COLORS[this.players.size % PLAYER_COLORS.length]!,
        lastShotAt: 0,
        isBot: true,
      });
      this.bots.set(id, bot);
    }

    return { ok: true };
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player || player.isBot) return;

    this.players.delete(id);

    if (this.humanCount === 0) {
      this.players.clear();
      this.bots.clear();
      return;
    }

    if (this.hostId === id) {
      const next = [...this.players.values()].find((p) => !p.isBot);
      if (next) this.hostId = next.id;
    }

    if (this.phase === 'playing') {
      this.checkWinner();
    }
  }

  start(requesterId: string): { ok: true } | { ok: false; error: string } {
    if (requesterId !== this.hostId) {
      return { ok: false, error: 'Only the host can start' };
    }
    if (this.phase !== 'lobby') {
      return { ok: false, error: 'Match already started' };
    }
    if (this.players.size < MIN_PLAYERS_TO_START) {
      return { ok: false, error: `Need at least ${MIN_PLAYERS_TO_START} players` };
    }

    this.resetForRound();
    this.phase = 'playing';
    return { ok: true };
  }

  rematch(requesterId: string): { ok: true } | { ok: false; error: string } {
    if (requesterId !== this.hostId) {
      return { ok: false, error: 'Only the host can rematch' };
    }
    if (this.phase !== 'ended') {
      return { ok: false, error: 'Round is not finished' };
    }

    if (this.mode === 'solo') {
      this.resetForRound();
      this.phase = 'playing';
      return { ok: true };
    }

    this.phase = 'lobby';
    this.winnerId = null;
    this.winnerName = null;

    for (const player of this.players.values()) {
      player.health = MAX_HEALTH;
      player.alive = true;
    }

    return { ok: true };
  }

  applyMovement(id: string, update: MovementUpdate): void {
    const player = this.players.get(id);
    if (!player || !player.alive || player.isBot || this.phase !== 'playing') return;

    player.x = update.x;
    player.y = update.y;
    player.z = update.z;
    player.facing = update.facing;
  }

  handleShot(id: string, intent: ShotIntent): ShotEvent | null {
    const shooter = this.players.get(id);
    if (!shooter || !shooter.alive || this.phase !== 'playing') return null;

    const now = Date.now();
    if (now - shooter.lastShotAt < FIRE_COOLDOWN_MS) return null;
    shooter.lastShotAt = now;

    const direction = normalize(intent.direction);
    if (!direction) return null;

    const origin = {
      x: intent.origin.x,
      y: intent.origin.y,
      z: intent.origin.z,
    };

    const maxDistFromShooter = 3;
    const dx = origin.x - shooter.x;
    const dy = origin.y - (shooter.y + PLAYER_EYE_HEIGHT);
    const dz = origin.z - shooter.z;
    if (dx * dx + dy * dy + dz * dz > maxDistFromShooter * maxDistFromShooter) {
      origin.x = shooter.x;
      origin.y = shooter.y + PLAYER_EYE_HEIGHT;
      origin.z = shooter.z;
    }

    let hitPlayerId: string | null = null;
    let closest = MAX_SHOT_RANGE;

    for (const target of this.players.values()) {
      if (target.id === id || !target.alive) continue;

      const hitDist = rayHitsCapsule(origin, direction, target, closest);
      if (hitDist !== null && hitDist < closest) {
        closest = hitDist;
        hitPlayerId = target.id;
      }
    }

    if (hitPlayerId) {
      const target = this.players.get(hitPlayerId)!;
      target.health = Math.max(0, target.health - BULLET_DAMAGE);
      if (target.health <= 0) {
        target.alive = false;
        target.health = 0;
        const bot = this.bots.get(target.id);
        if (bot) bot.alive = false;
        if (!this.eliminationOrder.includes(target.id)) {
          this.eliminationOrder.push(target.id);
        }
      }
    }

    return {
      shooterId: id,
      origin,
      direction,
      hitPlayerId,
    };
  }

  tickBots(dt: number): ShotEvent[] {
    if (this.phase !== 'playing' || !this.difficulty) return [];

    const now = Date.now();
    const peers = [...this.players.values()].map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      alive: p.alive,
    }));

    const shots: ShotEvent[] = [];

    for (const [id, bot] of this.bots) {
      const player = this.players.get(id);
      if (!player || !player.alive) {
        bot.alive = false;
        continue;
      }

      bot.x = player.x;
      bot.y = player.y;
      bot.z = player.z;
      bot.facing = player.facing;
      bot.alive = true;
      bot.lastShotAt = player.lastShotAt;

      tickBot(bot, peers, this.difficulty, dt, now, (intent) => {
        const shot = this.handleShot(id, intent);
        if (shot) shots.push(shot);
        return shot;
      });

      player.x = bot.x;
      player.y = bot.y;
      player.z = bot.z;
      player.facing = bot.facing;
      player.lastShotAt = bot.lastShotAt;
    }

    return shots;
  }

  checkWinner(): RoundResult | null {
    if (this.phase !== 'playing') return null;

    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length > 1) return null;

    if (alive.length === 1) {
      const winner = alive[0]!;
      this.phase = 'ended';
      this.winnerId = winner.id;
      this.winnerName = winner.name;
      return {
        winnerId: winner.id,
        winnerName: winner.name,
        standings: this.computeStandings(winner.id),
      };
    }

    this.phase = 'ended';
    this.winnerId = null;
    this.winnerName = 'Draw';
    return {
      winnerId: '',
      winnerName: 'Draw',
      standings: this.computeStandings(null),
    };
  }

  private computeStandings(winnerId: string | null): Standing[] {
    const ordered: string[] = [];
    if (winnerId) ordered.push(winnerId);

    for (let i = this.eliminationOrder.length - 1; i >= 0; i -= 1) {
      const id = this.eliminationOrder[i]!;
      if (!ordered.includes(id)) ordered.push(id);
    }

    return ordered.slice(0, 3).map((id, index) => {
      const player = this.players.get(id);
      return {
        id,
        name: player?.name ?? 'Unknown',
        color: player?.color ?? 0xffffff,
        isBot: player?.isBot ?? false,
        place: index + 1,
      };
    });
  }

  getPlayer(id: string): RoomPlayer | undefined {
    return this.players.get(id);
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      mode: this.mode,
      botCount: this.botCount,
      difficulty: this.difficulty,
      players: this.playerSnapshots(),
      winnerId: this.winnerId,
      winnerName: this.winnerName,
    };
  }

  playerSnapshots(): PlayerSnapshot[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      facing: p.facing,
      health: p.health,
      alive: p.alive,
      isHost: p.id === this.hostId,
      isBot: p.isBot,
      color: p.color,
    }));
  }

  private resetForRound(): void {
    this.winnerId = null;
    this.winnerName = null;
    this.eliminationOrder = [];

    // Regenerate a safe, well-separated layout for every match/rematch.
    const spawns = createRandomSpawns(this.players.size);
    let index = 0;
    for (const player of this.players.values()) {
      const spawn = spawns[index]!;
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
      player.facing = Math.random() * Math.PI * 2;
      player.health = MAX_HEALTH;
      player.alive = true;
      player.lastShotAt = 0;

      if (player.isBot) {
        const bot = this.bots.get(player.id) ?? createBotActor(player.id, spawn.x, spawn.y, spawn.z);
        const clear = createBotActor(player.id, spawn.x, spawn.y, spawn.z);
        bot.x = clear.x;
        bot.y = clear.y;
        bot.z = clear.z;
        player.x = clear.x;
        player.y = clear.y;
        player.z = clear.z;
        bot.facing = player.facing;
        bot.alive = true;
        bot.lastShotAt = 0;
        bot.targetId = null;
        bot.waypoint = null;
        bot.roamTimer = 0;
        bot.reactionTimer = 0;
        bot.groundY = spawn.y;
        bot.verticalVelocity = 0;
        bot.jumpCooldown = 0;
        bot.stuckTimer = 0;
        bot.steerAngle = 0;
        bot.avoidanceDirection = Math.random() < 0.5 ? -1 : 1;
        this.bots.set(player.id, bot);
      }

      index += 1;
    }
  }
}

function createRandomSpawns(count: number): Vec3[] {
  const spawns: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    spawns.push(createRandomSpawn(spawns));
  }
  return spawns;
}

function createRandomSpawn(occupied: Vec3[]): Vec3 {
  const point = pickOpenPoint(
    occupied.map((p) => ({ x: p.x, z: p.z })),
    10,
  );
  return { x: point.x, y: SPAWN_Y, z: point.z };
}

export interface RoundResult {
  winnerId: string;
  winnerName: string;
  standings: Standing[];
}

function normalize(v: Vec3): Vec3 | null {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 0.0001) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function rayHitsCapsule(
  origin: Vec3,
  direction: Vec3,
  target: RoomPlayer,
  maxDist: number,
): number | null {
  // target.y is the Rapier capsule center — do NOT add half-height again.
  const radius = PLAYER_RADIUS + HITBOX_FORGIVENESS;
  const half = PLAYER_HALF_HEIGHT;
  let best: number | null = null;

  // Cover the full capsule (cylinder + caps) with stacked spheres.
  const samples = [
    target.y - half,
    target.y,
    target.y + half,
  ];

  for (const cy of samples) {
    const t = rayHitsSphere(origin, direction, target.x, cy, target.z, radius, maxDist);
    if (t !== null && (best === null || t < best)) best = t;
  }

  return best;
}

function rayHitsSphere(
  origin: Vec3,
  direction: Vec3,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  maxDist: number,
): number | null {
  const ocx = origin.x - cx;
  const ocy = origin.y - cy;
  const ocz = origin.z - cz;

  const a =
    direction.x * direction.x + direction.y * direction.y + direction.z * direction.z;
  const b = 2 * (ocx * direction.x + ocy * direction.y + ocz * direction.z);
  const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxDist) return null;
  return t;
}
