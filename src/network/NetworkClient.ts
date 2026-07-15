import { io, type Socket } from 'socket.io-client';
import type {
  BotDifficulty,
  ClientToServerEvents,
  CreateSoloPayload,
  HealthUpdate,
  MovementUpdate,
  PlayerSnapshot,
  RoomResult,
  RoomSnapshot,
  RoundEndEvent,
  ServerToClientEvents,
  ShotEvent,
  ShotIntent,
} from '../../shared/protocol.ts';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class NetworkClient {
  private socket: GameSocket | null = null;
  playerId: string | null = null;
  room: RoomSnapshot | null = null;

  onRoomState: ((room: RoomSnapshot) => void) | null = null;
  onPlayersUpdate: ((players: PlayerSnapshot[]) => void) | null = null;
  onShotFired: ((shot: ShotEvent) => void) | null = null;
  onHealth: ((update: HealthUpdate) => void) | null = null;
  onEliminated: ((payload: { playerId: string; name: string }) => void) | null = null;
  onRoundEnd: ((payload: RoundEndEvent) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  connect(): void {
    if (this.socket) return;

    this.socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.socket.on('room:state', (room) => {
      this.room = room;
      this.onRoomState?.(room);
    });

    this.socket.on('players:update', (players) => {
      if (this.room) {
        this.room = { ...this.room, players };
      }
      this.onPlayersUpdate?.(players);
    });

    this.socket.on('shot:fired', (shot) => this.onShotFired?.(shot));
    this.socket.on('player:health', (update) => this.onHealth?.(update));
    this.socket.on('player:eliminated', (payload) => this.onEliminated?.(payload));
    this.socket.on('round:end', (payload) => this.onRoundEnd?.(payload));
    this.socket.on('room:error', ({ message }) => this.onError?.(message));
  }

  async createRoom(name: string): Promise<RoomResult> {
    this.connect();
    return await this.emitCreate({ name });
  }

  async createSoloRoom(
    name: string,
    botCount: number,
    difficulty: BotDifficulty,
  ): Promise<RoomResult> {
    this.connect();
    return await this.emitCreateSolo({ name, botCount, difficulty });
  }

  async joinRoom(code: string, name: string): Promise<RoomResult> {
    this.connect();
    return await this.emitJoin({ code, name });
  }

  async startMatch(): Promise<{ ok: boolean; error?: string }> {
    return await this.emitSimpleAck('room:start');
  }

  async rematch(): Promise<{ ok: boolean; error?: string }> {
    return await this.emitSimpleAck('room:rematch');
  }

  sendMove(update: MovementUpdate): void {
    this.socket?.emit('player:move', update);
  }

  sendShot(intent: ShotIntent): void {
    this.socket?.emit('player:shoot', intent);
  }

  private emitCreate(payload: { name: string }): Promise<RoomResult> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Not connected' });
        return;
      }
      this.socket.emit('room:create', payload, (result) => {
        if (result.ok) {
          this.playerId = result.playerId;
          this.room = result.room;
        }
        resolve(result);
      });
    });
  }

  private emitCreateSolo(payload: CreateSoloPayload): Promise<RoomResult> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Not connected' });
        return;
      }
      this.socket.emit('room:createSolo', payload, (result) => {
        if (result.ok) {
          this.playerId = result.playerId;
          this.room = result.room;
        }
        resolve(result);
      });
    });
  }

  private emitJoin(payload: { code: string; name: string }): Promise<RoomResult> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Not connected' });
        return;
      }
      this.socket.emit('room:join', payload, (result) => {
        if (result.ok) {
          this.playerId = result.playerId;
          this.room = result.room;
        }
        resolve(result);
      });
    });
  }

  private emitSimpleAck(event: 'room:start' | 'room:rematch'): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Not connected' });
        return;
      }
      this.socket.emit(event, (result) => resolve(result));
    });
  }
}
