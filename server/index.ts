import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  CreateSoloPayload,
  RoomResult,
  ServerToClientEvents,
  ShotEvent,
} from '../shared/protocol.ts';
import { Room } from './game/Room.ts';

const PORT = Number(process.env.PORT ?? 3001);
const TICK_MS = 50;

const rooms = new Map<string, Room>();
const playerRoom = new Map<string, string>();

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TPS multiplayer server');
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents
>(httpServer, {
  cors: {
    origin: '*',
  },
});

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let i = 0; i < 5; i += 1) {
    code += alphabet[
      Math.floor(Math.random() * alphabet.length)
    ];
  }

  if (rooms.has(code)) {
    return generateCode();
  }

  return code;
}

function getRoomFor(socketId: string): Room | null {
  const code = playerRoom.get(socketId);

  if (!code) return null;

  return rooms.get(code) ?? null;
}

function broadcastRoom(room: Room): void {
  io.to(room.code).emit(
    'room:state',
    room.snapshot(),
  );
}

function broadcastShot(
  room: Room,
  shot: ShotEvent,
): void {
  io.to(room.code).emit(
    'shot:fired',
    shot,
  );

  for (const hitId of shot.hitPlayerIds) {
    const target = room.getPlayer(hitId);

    if (target) {
      io.to(room.code).emit(
        'player:health',
        {
          playerId: target.id,
          health: target.health,
          alive: target.alive,
        },
      );

      if (!target.alive) {
        io.to(room.code).emit(
          'player:eliminated',
          {
            playerId: target.id,
            name: target.name,
          },
        );
      }
    }
  }

  const end = room.checkWinner();

  if (end) {
    io.to(room.code).emit(
      'round:end',
      end,
    );
  }

  broadcastRoom(room);
}

function leaveRoom(socketId: string): void {
  const room = getRoomFor(socketId);

  if (!room) return;

  room.removePlayer(socketId);
  playerRoom.delete(socketId);

  const socket = io.sockets.sockets.get(socketId);
  socket?.leave(room.code);

  if (
    room.humanCount === 0 ||
    room.playerCount === 0
  ) {
    rooms.delete(room.code);
    return;
  }

  broadcastRoom(room);

  if (room.phase === 'playing') {
    const result = room.checkWinner();

    if (result) {
      io.to(room.code).emit(
        'round:end',
        result,
      );

      broadcastRoom(room);
    }
  }
}

io.on('connection', (socket) => {
  socket.on(
    'room:create',
    ({ name }, callback) => {
      leaveRoom(socket.id);

      const code = generateCode();

      const room = new Room(
        code,
        socket.id,
        name,
        'pvp',
      );

      rooms.set(code, room);
      playerRoom.set(socket.id, code);
      socket.join(code);

      const result: RoomResult = {
        ok: true,
        room: room.snapshot(),
        playerId: socket.id,
      };

      callback(result);
      broadcastRoom(room);
    },
  );

  socket.on(
    'room:createSolo',
    (
      payload: CreateSoloPayload,
      callback,
    ) => {
      leaveRoom(socket.id);

      const code = generateCode();

      const room = new Room(
        code,
        socket.id,
        payload.name,
        'solo',
      );

      const configured = room.configureSolo(
        payload.botCount,
        payload.difficulty,
      );

      if (!configured.ok) {
        callback({
          ok: false,
          error: configured.error,
        });

        return;
      }

      const started = room.start(socket.id);

      if (!started.ok) {
        callback({
          ok: false,
          error: started.error,
        });

        return;
      }

      rooms.set(code, room);
      playerRoom.set(socket.id, code);
      socket.join(code);

      const result: RoomResult = {
        ok: true,
        room: room.snapshot(),
        playerId: socket.id,
      };

      callback(result);
      broadcastRoom(room);

      const state = room.weaponState(socket.id);

      if (state) {
        socket.emit(
          'weapon:state',
          state,
        );
      }
    },
  );

  socket.on(
    'room:join',
    ({ code, name }, callback) => {
      const normalized = code
        .trim()
        .toUpperCase();

      const room = rooms.get(normalized);

      if (!room) {
        callback({
          ok: false,
          error: 'Room not found',
        });

        return;
      }

      if (room.mode === 'solo') {
        callback({
          ok: false,
          error: 'Cannot join a solo game',
        });

        return;
      }

      leaveRoom(socket.id);

      const added = room.addPlayer(
        socket.id,
        name,
      );

      if (!added.ok) {
        callback({
          ok: false,
          error: added.error,
        });

        return;
      }

      playerRoom.set(
        socket.id,
        room.code,
      );

      socket.join(room.code);

      callback({
        ok: true,
        room: room.snapshot(),
        playerId: socket.id,
      });

      broadcastRoom(room);
    },
  );

  socket.on(
    'room:start',
    (callback) => {
      const room = getRoomFor(socket.id);

      if (!room) {
        callback({
          ok: false,
          error: 'Not in a room',
        });

        return;
      }

      const result = room.start(socket.id);

      if (!result.ok) {
        callback(result);
        return;
      }

      callback({ ok: true });
      broadcastRoom(room);

      for (
        const player of room.playerSnapshots()
      ) {
        const state = room.weaponState(
          player.id,
        );

        if (state && !player.isBot) {
          io.to(player.id).emit(
            'weapon:state',
            state,
          );
        }
      }
    },
  );

  socket.on(
    'room:rematch',
    (callback) => {
      const room = getRoomFor(socket.id);

      if (!room) {
        callback({
          ok: false,
          error: 'Not in a room',
        });

        return;
      }

      const result = room.rematch(
        socket.id,
      );

      if (!result.ok) {
        callback(result);
        return;
      }

      callback({ ok: true });
      broadcastRoom(room);

      for (
        const player of room.playerSnapshots()
      ) {
        const state = room.weaponState(
          player.id,
        );

        if (state && !player.isBot) {
          io.to(player.id).emit(
            'weapon:state',
            state,
          );
        }
      }
    },
  );

  socket.on(
    'player:move',
    (payload) => {
      const room = getRoomFor(socket.id);

      if (!room) return;

      room.applyMovement(
        socket.id,
        payload,
      );

      socket.to(room.code).emit(
        'players:update',
        room.playerSnapshots(),
      );
    },
  );

  socket.on(
    'player:shoot',
    (payload) => {
      const room = getRoomFor(socket.id);

      if (!room) return;

      const shot = room.handleShot(
        socket.id,
        payload,
      );

      if (!shot) return;

      const state = room.weaponState(
        socket.id,
      );

      if (state) {
        socket.emit(
          'weapon:state',
          state,
        );
      }

      broadcastShot(room, shot);
    },
  );

  socket.on(
    'weapon:select',
    (id) => {
      const room = getRoomFor(socket.id);

      const state = room?.selectWeapon(
        socket.id,
        id,
      );

      if (state && room) {
        socket.emit(
          'weapon:state',
          state,
        );

        broadcastRoom(room);
      }
    },
  );

  socket.on(
    'weapon:reload',
    () => {
      const state = getRoomFor(
        socket.id,
      )?.startReload(socket.id);

      if (state) {
        socket.emit(
          'weapon:state',
          state,
        );
      }
    },
  );

  socket.on(
    'disconnect',
    () => {
      leaveRoom(socket.id);
    },
  );
});

setInterval(() => {
  const dt = TICK_MS / 1000;

  for (const room of rooms.values()) {
    if (room.phase !== 'playing') {
      continue;
    }

    const shots =
      room.mode === 'solo'
        ? room.tickBots(dt)
        : [];

    for (
      const player of room.playerSnapshots()
    ) {
      if (!player.isBot) {
        const state = room.weaponState(
          player.id,
        );

        if (state) {
          io.to(player.id).emit(
            'weapon:state',
            state,
          );
        }
      }
    }

    if (room.mode === 'solo') {
      io.to(room.code).emit(
        'players:update',
        room.playerSnapshots(),
      );
    }

    for (const shot of shots) {
      broadcastShot(room, shot);

      if (room.phase !== 'playing') {
        break;
      }
    }
  }
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(
    `Multiplayer server listening on http://localhost:${PORT}`,
  );
});