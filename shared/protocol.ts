export type RoomPhase = 'lobby' | 'playing' | 'ended';
export type GameMode = 'pvp' | 'solo';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  facing: number;
  health: number;
  alive: boolean;
  isHost: boolean;
  isBot: boolean;
  color: number;
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string;
  mode: GameMode;
  botCount: number;
  difficulty: BotDifficulty | null;
  players: PlayerSnapshot[];
  winnerId: string | null;
  winnerName: string | null;
}

export interface MovementUpdate {
  x: number;
  y: number;
  z: number;
  facing: number;
}

export interface ShotIntent {
  origin: Vec3;
  direction: Vec3;
}

export interface ShotEvent {
  shooterId: string;
  origin: Vec3;
  direction: Vec3;
  hitPlayerId: string | null;
}

export interface HealthUpdate {
  playerId: string;
  health: number;
  alive: boolean;
}

export interface Standing {
  id: string;
  name: string;
  color: number;
  isBot: boolean;
  place: number;
}

export interface RoundEndEvent {
  winnerId: string;
  winnerName: string;
  standings: Standing[];
}

export interface CreateSoloPayload {
  name: string;
  botCount: number;
  difficulty: BotDifficulty;
}

export interface ClientToServerEvents {
  'room:create': (payload: { name: string }, callback: (result: RoomResult) => void) => void;
  'room:createSolo': (payload: CreateSoloPayload, callback: (result: RoomResult) => void) => void;
  'room:join': (payload: { code: string; name: string }, callback: (result: RoomResult) => void) => void;
  'room:start': (callback: (result: { ok: boolean; error?: string }) => void) => void;
  'room:rematch': (callback: (result: { ok: boolean; error?: string }) => void) => void;
  'player:move': (payload: MovementUpdate) => void;
  'player:shoot': (payload: ShotIntent) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomSnapshot) => void;
  'players:update': (players: PlayerSnapshot[]) => void;
  'shot:fired': (shot: ShotEvent) => void;
  'player:health': (update: HealthUpdate) => void;
  'player:eliminated': (payload: { playerId: string; name: string }) => void;
  'round:end': (payload: RoundEndEvent) => void;
  'room:error': (payload: { message: string }) => void;
}

export type RoomResult =
  | { ok: true; room: RoomSnapshot; playerId: string }
  | { ok: false; error: string };
