import type { BotDifficulty, RoomSnapshot } from '../../shared/protocol.ts';
import type { NetworkClient } from '../network/NetworkClient.ts';
import logoUrl from '../assets/logo.png';

export class LobbyUI {
  private root: HTMLElement;
  private errorEl: HTMLElement;
  private lobbyPanel: HTMLElement;
  private roomPanel: HTMLElement;
  private codeEl: HTMLElement;
  private roomHintEl: HTMLElement;
  private playerListEl: HTMLElement;
  private startBtn: HTMLButtonElement;
  private rematchBtn: HTMLButtonElement;
  private network: NetworkClient;
  private onMatchStart: () => void;

  constructor(network: NetworkClient, onMatchStart: () => void) {
    this.network = network;
    this.onMatchStart = onMatchStart;

    this.root = document.createElement('div');
    this.root.id = 'lobby';
    this.root.innerHTML = `
      <img class="lobby-logo" src="${logoUrl}" alt="Last Player Standing" />
      <div class="panel" id="lobby-home">
        <h1>Last Player Standing</h1>
        <label>Player name
          <input id="player-name" maxlength="16" placeholder="Enter your name" value="" />
        </label>

        <div class="section">
          <h3>Single Player</h3>
          <label>Bots
            <select id="bot-count">
              <option value="1">1 Bot</option>
              <option value="2">2 Bots</option>
              <option value="3" selected>3 Bots</option>
              <option value="4">4 Bots</option>
              <option value="5">5 Bots</option>
              <option value="6">6 Bots</option>
              <option value="7">7 Bots</option>
            </select>
          </label>
          <label>Difficulty
            <select id="bot-difficulty">
              <option value="easy">Easy</option>
              <option value="normal" selected>Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <button id="solo-game" type="button">Play vs Bots</button>
        </div>

        <div class="section">
          <h3>Multiplayer</h3>
          <button id="create-game" type="button">Create Game</button>
          <div class="row">
            <input id="join-code" maxlength="5" placeholder="CODE" />
            <button id="join-game" type="button">Join Game</button>
          </div>
        </div>

        <p class="error" id="lobby-error"></p>
      </div>
      <div class="panel hidden" id="lobby-room">
        <h2>Room <span id="room-code"></span></h2>
        <p id="room-hint">Share this code with friends (max 8).</p>
        <ul id="player-list"></ul>
        <button id="start-game" type="button" class="hidden">Start Game</button>
        <button id="rematch-game" type="button" class="hidden">Rematch</button>
        <p class="error" id="room-error"></p>
      </div>
    `;
    document.body.appendChild(this.root);

    this.errorEl = this.root.querySelector('#lobby-error')!;
    this.lobbyPanel = this.root.querySelector('#lobby-home')!;
    this.roomPanel = this.root.querySelector('#lobby-room')!;
    this.codeEl = this.root.querySelector('#room-code')!;
    this.roomHintEl = this.root.querySelector('#room-hint')!;
    this.playerListEl = this.root.querySelector('#player-list')!;
    this.startBtn = this.root.querySelector('#start-game')!;
    this.rematchBtn = this.root.querySelector('#rematch-game')!;

    const nameInput = this.root.querySelector<HTMLInputElement>('#player-name')!;
    const codeInput = this.root.querySelector<HTMLInputElement>('#join-code')!;
    const botCountInput = this.root.querySelector<HTMLSelectElement>('#bot-count')!;
    const difficultyInput = this.root.querySelector<HTMLSelectElement>('#bot-difficulty')!;

    this.root.querySelector('#solo-game')!.addEventListener('click', async () => {
      this.clearErrors();
      const name = nameInput.value.trim();
      if (!name) {
        this.errorEl.textContent = 'Enter your name first';
        nameInput.focus();
        return;
      }
      const botCount = Number(botCountInput.value);
      const difficulty = difficultyInput.value as BotDifficulty;
      const result = await this.network.createSoloRoom(name, botCount, difficulty);
      if (!result.ok) {
        this.errorEl.textContent = result.error;
        return;
      }
      this.showRoom(result.room);
    });

    this.root.querySelector('#create-game')!.addEventListener('click', async () => {
      this.clearErrors();
      const name = nameInput.value.trim();
      if (!name) {
        this.errorEl.textContent = 'Enter your name first';
        nameInput.focus();
        return;
      }
      const result = await this.network.createRoom(name);
      if (!result.ok) {
        this.errorEl.textContent = result.error;
        return;
      }
      this.showRoom(result.room);
    });

    this.root.querySelector('#join-game')!.addEventListener('click', async () => {
      this.clearErrors();
      const name = nameInput.value.trim();
      if (!name) {
        this.errorEl.textContent = 'Enter your name first';
        nameInput.focus();
        return;
      }
      const result = await this.network.joinRoom(codeInput.value, name);
      if (!result.ok) {
        this.errorEl.textContent = result.error;
        return;
      }
      this.showRoom(result.room);
    });

    this.startBtn.addEventListener('click', async () => {
      this.clearErrors();
      const result = await this.network.startMatch();
      if (!result.ok) {
        const roomError = this.root.querySelector('#room-error')!;
        roomError.textContent = result.error ?? 'Could not start';
      }
    });

    this.rematchBtn.addEventListener('click', async () => {
      this.clearErrors();
      const result = await this.network.rematch();
      if (!result.ok) {
        const roomError = this.root.querySelector('#room-error')!;
        roomError.textContent = result.error ?? 'Could not rematch';
      }
    });

    this.network.onError = (message) => {
      this.errorEl.textContent = message;
    };
  }

  private clearErrors(): void {
    this.errorEl.textContent = '';
    const roomError = this.root.querySelector('#room-error');
    if (roomError) roomError.textContent = '';
  }

  private showRoom(room: RoomSnapshot): void {
    this.lobbyPanel.classList.add('hidden');
    this.roomPanel.classList.remove('hidden');
    this.renderRoom(room);
  }

  renderRoom(room: RoomSnapshot): void {
    this.codeEl.textContent = room.code;
    this.playerListEl.innerHTML = '';

    if (room.mode === 'solo') {
      const difficulty = room.difficulty ? room.difficulty.toUpperCase() : '';
      this.roomHintEl.textContent = `Solo vs ${room.botCount} bot${room.botCount === 1 ? '' : 's'} (${difficulty})`;
    } else {
      this.roomHintEl.textContent = 'Share this code with friends (max 8).';
    }

    for (const player of room.players) {
      const li = document.createElement('li');
      if (player.id === this.network.playerId) {
        li.textContent = player.name;
        li.classList.add('you');
      } else {
        li.textContent = player.name;
      }
      this.playerListEl.appendChild(li);
    }

    const isHost = this.network.playerId === room.hostId;
    this.startBtn.classList.toggle(
      'hidden',
      !(isHost && room.phase === 'lobby' && room.mode === 'pvp'),
    );
    this.rematchBtn.classList.toggle('hidden', !(isHost && room.phase === 'ended'));

    if (room.phase === 'playing') {
      this.hide();
      this.onMatchStart();
    } else if (room.phase === 'lobby') {
      this.show();
    } else {
      // 'ended' is handled by the victory screen.
      this.hide();
    }
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
