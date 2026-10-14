import * as THREE from 'three';
import { MAX_HEALTH } from '../../shared/combat.ts';
import type {
  PlayerSnapshot,
  RoomSnapshot,
} from '../../shared/protocol.ts';
import type { WeaponId } from '../../shared/weapons.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { ShootingSystem } from '../combat/ShootingSystem.ts';
import { InputManager } from '../input/InputManager.ts';
import { NetworkClient } from '../network/NetworkClient.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { Player } from '../player/Player.ts';
import { PlayerCamera } from '../player/PlayerCamera.ts';
import { PlayerController } from '../player/PlayerController.ts';
import { RemotePlayer } from '../player/RemotePlayer.ts';
import {
  createGround,
  createObstacles,
} from '../scene/createGround.ts';
import { createScene } from '../scene/createScene.ts';
import { LobbyUI } from '../ui/LobbyUI.ts';
import { MatchUI } from '../ui/MatchUI.ts';
import { VictoryScreen } from '../ui/VictoryScreen.ts';

const MOVE_SEND_RATE = 1 / 30;

const WEAPON_ZOOM: Record<WeaponId, number> = {
  pistol: 52,
  rifle: 38,
  shotgun: 55,
  sniper: 12,
};

export class MultiplayerGame {
  private network = new NetworkClient();
  private lobby: LobbyUI;
  private matchUI = new MatchUI();
  private victory: VictoryScreen;
  private audio = new AudioManager();

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  private physicsWorld = new PhysicsWorld();
  private input!: InputManager;
  private player!: Player;
  private playerCamera!: PlayerCamera;
  private playerController!: PlayerController;
  private shooting!: ShootingSystem;

  private remotes = new Map<string, RemotePlayer>();
  private clock = new THREE.Clock();

  private playing = false;
  private moveSendAcc = 0;
  private livingFollowIds: string[] = [];
  private followIndex = 0;
  private startedOnce = false;

  private perspectiveHint!: HTMLDivElement;
  private crosshair!: HTMLDivElement;
  private pointerHint!: HTMLDivElement;
  private scopeOverlay!: HTMLDivElement;
  private adsHint!: HTMLDivElement;
  private hitmarker!: HTMLDivElement;
  private audioPanel!: HTMLDivElement;
  private volumeSlider!: HTMLInputElement;
  private muteButton!: HTMLButtonElement;

  private selectedWeapon: WeaponId = 'rifle';
  private rightMouseHeld = false;
  private aiming = false;
  private adsChangedPerspective = false;

  private normalFov = 75;
  private currentFov = 75;

  private hitmarkerTimeout: number | null = null;
  private lastHealth = MAX_HEALTH;
  private lastReloadEndAt = 0;

  constructor() {
    this.lobby = new LobbyUI(
      this.network,
      () => this.startMatch(),
    );

    this.victory = new VictoryScreen(
      () => this.requestRematch(),
      () => this.returnToMenu(),
    );

    this.matchUI.showGameplayHud(false);
  }

  async init(container: HTMLElement): Promise<void> {
    const ctx = createScene(container);

    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.renderer = ctx.renderer;

    this.normalFov = this.camera.fov;
    this.currentFov = this.camera.fov;

    await this.physicsWorld.init();

    const groundMeshes = createGround(
      this.scene,
      this.physicsWorld,
    );

    const obstacles = createObstacles(
      this.scene,
      this.physicsWorld,
    );

    this.input = new InputManager(this.renderer.domElement);

    this.player = new Player(
      this.scene,
      this.physicsWorld,
    );

    this.playerCamera = new PlayerCamera(
      this.camera,
      this.player,
      this.input,
    );

    this.createGameOverlay();
    this.setupADSControls();
    this.createAudioControls();

    this.playerController = new PlayerController(
      this.player,
      this.input,
      this.playerCamera,
    );

    this.shooting = new ShootingSystem(
      this.scene,
      this.camera,
      this.player,
      this.playerCamera,
      this.input,
    );

    this.shooting.setNetwork(this.network);

    // Register audio callbacks AFTER the shooting system
    // so its ammo and reload handlers are preserved.
    this.wireNetwork();

    this.shooting.setCollidables([
      ...groundMeshes,
      ...obstacles.map((obstacle) => obstacle.mesh),
    ]);

    this.playerController.enabled = false;
    this.shooting.enabled = false;
    this.player.mesh.visible = false;

    this.animate();
  }

  private setupADSControls(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    canvas.addEventListener('mousedown', (event) => {
      this.audio.unlock();

      if (event.button !== 2) return;

      event.preventDefault();

      if (!this.playing || !this.player.alive) return;

      if (!this.input.isPointerLocked()) {
        this.input.requestPointerLock();
        return;
      }

      this.rightMouseHeld = true;
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        this.rightMouseHeld = false;
      }
    });

    window.addEventListener('blur', () => {
      this.stopAiming();
    });

    document.addEventListener('pointerlockchange', () => {
      if (!this.input.isPointerLocked()) {
        this.rightMouseHeld = false;
      }
    });

    window.addEventListener('keydown', (event) => {
      this.audio.unlock();

      if (
        !this.playing ||
        !this.player.alive ||
        event.repeat
      ) {
        return;
      }

      const weapons: Record<string, WeaponId> = {
        Digit1: 'pistol',
        Digit2: 'rifle',
        Digit3: 'shotgun',
        Digit4: 'sniper',
      };

      const nextWeapon = weapons[event.code];

      if (nextWeapon && nextWeapon !== this.selectedWeapon) {
        this.selectedWeapon = nextWeapon;
        this.audio.equip();
      }
    });
  }

  private createAudioControls(): void {
    this.audioPanel = document.createElement('div');

    Object.assign(this.audioPanel.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: '120',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 12px',
      background: 'rgba(8,14,24,0.88)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '10px',
      color: '#fff',
      font: '600 12px Arial, sans-serif',
      boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
    });

    this.muteButton = document.createElement('button');

    Object.assign(this.muteButton.style, {
      border: 'none',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.12)',
      color: '#fff',
      padding: '6px 9px',
      cursor: 'pointer',
      fontSize: '15px',
    });

    this.muteButton.textContent =
      this.audio.isMuted() ? '🔇' : '🔊';

    this.muteButton.title = 'Mute or unmute game audio';

    this.muteButton.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.isMuted());

      this.muteButton.textContent =
        this.audio.isMuted() ? '🔇' : '🔊';

      if (!this.audio.isMuted()) {
        this.audio.equip();
      }
    });

    const volumeLabel = document.createElement('span');
    volumeLabel.textContent = 'VOLUME';

    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '100';
    this.volumeSlider.step = '1';
    this.volumeSlider.value = String(
      Math.round(this.audio.getVolume() * 100),
    );

    Object.assign(this.volumeSlider.style, {
      width: '95px',
      cursor: 'pointer',
      accentColor: '#38bdf8',
    });

    this.volumeSlider.addEventListener('input', () => {
      this.audio.unlock();
      this.audio.setVolume(
        Number(this.volumeSlider.value) / 100,
      );
    });

    this.volumeSlider.addEventListener('change', () => {
      this.audio.equip();
    });

    this.audioPanel.append(
      this.muteButton,
      volumeLabel,
      this.volumeSlider,
    );

    document.body.appendChild(this.audioPanel);
  }

  private showHitmarker(elimination: boolean): void {
    if (!this.playing || !this.player.alive) return;

    if (this.hitmarkerTimeout !== null) {
      window.clearTimeout(this.hitmarkerTimeout);
    }

    const color = elimination ? '#ff4545' : '#ffffff';

    this.hitmarker.innerHTML = `
      <div style="
        position:absolute;
        left:3px;
        top:3px;
        width:11px;
        height:2px;
        background:${color};
        transform:rotate(45deg);
        border-radius:2px;
      "></div>

      <div style="
        position:absolute;
        right:3px;
        top:3px;
        width:11px;
        height:2px;
        background:${color};
        transform:rotate(-45deg);
        border-radius:2px;
      "></div>

      <div style="
        position:absolute;
        left:3px;
        bottom:3px;
        width:11px;
        height:2px;
        background:${color};
        transform:rotate(-45deg);
        border-radius:2px;
      "></div>

      <div style="
        position:absolute;
        right:3px;
        bottom:3px;
        width:11px;
        height:2px;
        background:${color};
        transform:rotate(45deg);
        border-radius:2px;
      "></div>
    `;

    this.hitmarker.style.display = 'block';

    this.audio.hit(elimination ? 'elimination' : 'hit');

    this.hitmarkerTimeout = window.setTimeout(() => {
      this.hitmarker.style.display = 'none';
      this.hitmarkerTimeout = null;
    }, elimination ? 220 : 130);
  }

  private hideHitmarker(): void {
    if (this.hitmarkerTimeout !== null) {
      window.clearTimeout(this.hitmarkerTimeout);
      this.hitmarkerTimeout = null;
    }

    if (this.hitmarker) {
      this.hitmarker.style.display = 'none';
    }
  }

  private createGameOverlay(): void {
    this.perspectiveHint = document.createElement('div');

    Object.assign(this.perspectiveHint.style, {
      position: 'fixed',
      right: '20px',
      bottom: '22px',
      zIndex: '20',
      color: '#fff',
      background: 'rgba(0,0,0,0.55)',
      padding: '10px 14px',
      borderRadius: '10px',
      font: '600 13px Arial, sans-serif',
      pointerEvents: 'none',
      display: 'none',
    });

    document.body.appendChild(this.perspectiveHint);

    this.crosshair = document.createElement('div');

    Object.assign(this.crosshair.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '26px',
      height: '26px',
      transform: 'translate(-50%, -50%)',
      zIndex: '30',
      pointerEvents: 'none',
      display: 'none',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))',
    });

    this.crosshair.innerHTML = `
      <div style="
        position:absolute;
        width:4px;
        height:4px;
        background:#fff;
        border-radius:50%;
        left:11px;
        top:11px;
      "></div>
      <div style="
        position:absolute;
        width:2px;
        height:7px;
        background:#fff;
        left:12px;
        top:0;
        border-radius:2px;
      "></div>
      <div style="
        position:absolute;
        width:2px;
        height:7px;
        background:#fff;
        left:12px;
        bottom:0;
        border-radius:2px;
      "></div>
      <div style="
        position:absolute;
        width:7px;
        height:2px;
        background:#fff;
        left:0;
        top:12px;
        border-radius:2px;
      "></div>
      <div style="
        position:absolute;
        width:7px;
        height:2px;
        background:#fff;
        right:0;
        top:12px;
        border-radius:2px;
      "></div>
    `;

    document.body.appendChild(this.crosshair);

    this.pointerHint = document.createElement('div');

    Object.assign(this.pointerHint.style, {
      position: 'fixed',
      left: '50%',
      top: 'calc(50% + 55px)',
      transform: 'translateX(-50%)',
      zIndex: '30',
      padding: '9px 16px',
      borderRadius: '9px',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      font: '600 13px Arial, sans-serif',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      display: 'none',
    });

    this.pointerHint.textContent =
      'Click the game to lock your mouse • Esc to unlock';

    document.body.appendChild(this.pointerHint);

    this.scopeOverlay = document.createElement('div');

    Object.assign(this.scopeOverlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '50',
      pointerEvents: 'none',
      display: 'none',
      background:
        'radial-gradient(circle at center, transparent 0%, transparent 31%, rgba(0,0,0,0.97) 31.4%, #000 100%)',
    });

    const scopeCircle = document.createElement('div');

    Object.assign(scopeCircle.style, {
      position: 'absolute',
      width: 'min(62vw, 88vh)',
      height: 'min(62vw, 88vh)',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      border: '4px solid rgba(10,10,10,0.95)',
      borderRadius: '50%',
      boxSizing: 'border-box',
      boxShadow:
        '0 0 0 2px rgba(255,255,255,0.15), inset 0 0 24px rgba(0,0,0,0.35)',
      overflow: 'hidden',
    });

    scopeCircle.innerHTML = `
      <div style="
        position:absolute;
        left:50%;
        top:0;
        width:1px;
        height:100%;
        background:rgba(0,0,0,0.85);
        transform:translateX(-50%);
      "></div>
      <div style="
        position:absolute;
        top:50%;
        left:0;
        height:1px;
        width:100%;
        background:rgba(0,0,0,0.85);
        transform:translateY(-50%);
      "></div>
      <div style="
        position:absolute;
        left:50%;
        top:50%;
        width:8px;
        height:8px;
        border:1px solid #111;
        border-radius:50%;
        transform:translate(-50%,-50%);
      "></div>
      <div style="
        position:absolute;
        left:50%;
        top:40%;
        width:2px;
        height:5%;
        background:#111;
        transform:translateX(-50%);
      "></div>
      <div style="
        position:absolute;
        left:50%;
        top:55%;
        width:2px;
        height:5%;
        background:#111;
        transform:translateX(-50%);
      "></div>
      <div style="
        position:absolute;
        left:40%;
        top:50%;
        width:5%;
        height:2px;
        background:#111;
        transform:translateY(-50%);
      "></div>
      <div style="
        position:absolute;
        left:55%;
        top:50%;
        width:5%;
        height:2px;
        background:#111;
        transform:translateY(-50%);
      "></div>
      <div style="
        position:absolute;
        left:50%;
        bottom:8%;
        transform:translateX(-50%);
        font:600 11px Arial,sans-serif;
        letter-spacing:3px;
        color:rgba(255,255,255,0.75);
        text-shadow:0 1px 3px #000;
      ">SNIPER SCOPE</div>
    `;

    this.scopeOverlay.appendChild(scopeCircle);
    document.body.appendChild(this.scopeOverlay);

    this.adsHint = document.createElement('div');

    Object.assign(this.adsHint.style, {
      position: 'fixed',
      left: '50%',
      bottom: '25px',
      transform: 'translateX(-50%)',
      zIndex: '32',
      color: '#e5e7eb',
      background: 'rgba(0,0,0,0.55)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      padding: '7px 13px',
      font: '600 11px Arial, sans-serif',
      pointerEvents: 'none',
      display: 'none',
    });

    this.adsHint.textContent =
      'HOLD RIGHT CLICK TO AIM';

    document.body.appendChild(this.adsHint);

    this.hitmarker = document.createElement('div');

    Object.assign(this.hitmarker.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '30px',
      height: '30px',
      transform: 'translate(-50%, -50%)',
      zIndex: '100',
      pointerEvents: 'none',
      display: 'none',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))',
    });

    document.body.appendChild(this.hitmarker);
  }

  private stopAiming(): void {
    this.rightMouseHeld = false;

    if (
      this.adsChangedPerspective &&
      this.playerCamera &&
      this.playerCamera.getMode() === 'local' &&
      this.playerCamera.getPerspective() === 'first'
    ) {
      this.playerCamera.togglePerspective();
    }

    this.adsChangedPerspective = false;
    this.aiming = false;

    if (this.scopeOverlay) {
      this.scopeOverlay.style.display = 'none';
    }
  }

  private updateADS(delta: number): void {
    const canAim =
      this.playing &&
      this.player.alive &&
      this.playerCamera.getMode() === 'local' &&
      this.input.isPointerLocked();

    const shouldAim = canAim && this.rightMouseHeld;

    if (shouldAim && !this.aiming) {
      this.aiming = true;

      if (this.playerCamera.getPerspective() === 'third') {
        this.playerCamera.togglePerspective();
        this.adsChangedPerspective = true;
      } else {
        this.adsChangedPerspective = false;
      }
    }

    if (!shouldAim && this.aiming) {
      this.stopAiming();
    }

    const targetFov = shouldAim
      ? WEAPON_ZOOM[this.selectedWeapon]
      : this.normalFov;

    const smoothing = 1 - Math.exp(-12 * delta);

    this.currentFov = THREE.MathUtils.lerp(
      this.currentFov,
      targetFov,
      smoothing,
    );

    if (Math.abs(this.currentFov - targetFov) < 0.02) {
      this.currentFov = targetFov;
    }

    if (Math.abs(this.camera.fov - this.currentFov) > 0.001) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    const scoped =
      shouldAim &&
      this.selectedWeapon === 'sniper';

    this.scopeOverlay.style.display =
      scoped ? 'block' : 'none';

    this.crosshair.style.display =
      canAim && !scoped ? 'block' : 'none';

    this.adsHint.style.display =
      canAim && !shouldAim ? 'block' : 'none';

    if (canAim) {
      this.adsHint.textContent =
        this.selectedWeapon === 'sniper'
          ? 'HOLD RIGHT CLICK FOR SNIPER SCOPE'
          : 'HOLD RIGHT CLICK TO AIM';
    }
  }

  private wireNetwork(): void {
    this.network.onRoomState = (room) => {
      this.onRoomState(room);
    };

    this.network.onPlayersUpdate = (players) => {
      this.syncRemotes(players);
    };

    const existingWeaponStateHandler =
      this.network.onWeaponState;

    this.network.onWeaponState = (state) => {
      // Preserve the ShootingSystem's existing callback.
      // This updates ammo, reload state and the HUD.
      existingWeaponStateHandler?.(state);

      // Add reload audio without replacing that callback.
      if (state.weaponId === this.selectedWeapon) {
        if (
          state.reloading &&
          state.reloadEndAt !== this.lastReloadEndAt
        ) {
          this.audio.reload(state.weaponId);
          this.lastReloadEndAt = state.reloadEndAt;
        }
      }
    };

    this.network.onShotFired = (shot) => {
      this.shooting.spawnNetworkShot(shot);

      const localShot =
        shot.shooterId === this.network.playerId;

      if (localShot) {
        this.audio.gunshot(shot.weaponId);

        if (shot.hitPlayerIds.length > 0) {
          this.showHitmarker(false);
        }
      } else {
        this.audio.gunshot(
          shot.weaponId,
          shot.origin,
          this.player.position,
        );
      }
    };

    this.network.onHealth = (update) => {
      if (update.playerId === this.network.playerId) {
        if (
          this.playing &&
          update.health < this.lastHealth
        ) {
          this.audio.hit('damage');
        }

        this.lastHealth = update.health;

        this.player.setHealth(
          update.health,
          update.alive,
        );

        this.matchUI.setHealth(
          update.health,
          MAX_HEALTH,
        );

        if (!update.alive) {
          this.enterSpectate();
        }
      } else {
        this.remotes
          .get(update.playerId)
          ?.setHealth(update.health, update.alive);
      }
    };

    this.network.onEliminated = ({ playerId, name }) => {
      if (playerId === this.network.playerId) {
        this.matchUI.setStatus('You were eliminated');
        this.enterSpectate();
      } else {
        this.matchUI.setStatus(`${name} eliminated`);
      }

      this.refreshLivingFollowList();
    };

    this.network.onRoundEnd = ({ standings }) => {
      this.playing = false;

      this.stopAiming();
      this.hideHitmarker();

      this.playerController.enabled = false;
      this.shooting.enabled = false;

      this.input.enablePointerLock(false);

      this.matchUI.setStatus('');
      this.matchUI.clearSpectatorInfo();
      this.matchUI.showGameplayHud(false);

      this.playerCamera.setLocalMode();

      if (
        standings.length > 0 &&
        standings[0]?.id === this.network.playerId
      ) {
        this.audio.victory();
      }

      const isHost =
        this.network.playerId ===
        this.network.room?.hostId;

      this.victory.show(standings, isHost);
    };
  }

  private async requestRematch(): Promise<void> {
    const result = await this.network.rematch();

    if (result.ok) {
      this.victory.hide();
    }
  }

  private returnToMenu(): void {
    this.stopAiming();
    this.hideHitmarker();
    this.input.enablePointerLock(false);
    window.location.reload();
  }

  private onRoomState(room: RoomSnapshot): void {
    this.lobby.renderRoom(room);

    if (room.phase === 'playing') {
      this.victory.hide();
      this.syncRemotes(room.players);

      const me = room.players.find(
        (player) => player.id === this.network.playerId,
      );

      if (me) {
        this.player.name = me.name;
        this.player.setColor(me.color);

        this.player.setHealth(
          me.health,
          me.alive,
        );

        this.lastHealth = me.health;

        this.matchUI.setHealth(
          me.health,
          MAX_HEALTH,
        );

        if (!this.startedOnce || !this.playing) {
          this.stopAiming();
          this.hideHitmarker();
          this.selectedWeapon = 'rifle';
          this.lastReloadEndAt = 0;

          this.shooting.resetWeapon();

          this.player.setSpawn(
            me.x,
            me.y,
            me.z,
            me.facing,
          );
        }

        if (me.alive) {
          this.playerController.enabled = true;
          this.shooting.enabled = true;

          this.playerCamera.setLocalMode();
          this.input.enablePointerLock(true);

          this.matchUI.showGameplayHud(true);
          this.matchUI.clearSpectatorInfo();
        } else {
          this.enterSpectate();
        }
      }

      this.playing = true;
      this.startedOnce = true;
      this.refreshLivingFollowList();
    }

    if (room.phase === 'lobby') {
      this.victory.hide();
      this.playing = false;

      this.stopAiming();
      this.hideHitmarker();

      this.playerController.enabled = false;
      this.shooting.enabled = false;

      this.input.enablePointerLock(false);
      this.player.mesh.visible = false;

      this.matchUI.showGameplayHud(false);
      this.matchUI.setStatus('');
      this.matchUI.clearSpectatorInfo();

      for (const remote of this.remotes.values()) {
        remote.dispose(this.scene);
      }

      this.remotes.clear();
    }
  }

  private startMatch(): void {
    // Match start is driven by room:state phase change.
  }

  private syncRemotes(players: PlayerSnapshot[]): void {
    const seen = new Set<string>();

    for (const snapshot of players) {
      if (snapshot.id === this.network.playerId) {
        continue;
      }

      seen.add(snapshot.id);

      const existing = this.remotes.get(snapshot.id);

      if (existing) {
        existing.applySnapshot(snapshot);
      } else {
        this.remotes.set(
          snapshot.id,
          new RemotePlayer(this.scene, snapshot),
        );
      }
    }

    for (const [id, remote] of this.remotes) {
      if (!seen.has(id)) {
        remote.dispose(this.scene);
        this.remotes.delete(id);
      }
    }

    this.refreshLivingFollowList();
  }

  private refreshLivingFollowList(): void {
    this.livingFollowIds = [
      ...this.remotes.values(),
    ]
      .filter((remote) => remote.alive)
      .map((remote) => remote.id);

    if (this.followIndex >= this.livingFollowIds.length) {
      this.followIndex = 0;
    }
  }

  private enterSpectate(): void {
    this.stopAiming();
    this.hideHitmarker();

    this.playerController.enabled = false;
    this.shooting.enabled = false;
    this.player.mesh.visible = false;

    this.input.enablePointerLock(false);

    this.matchUI.showGameplayHud(false);
    this.refreshLivingFollowList();

    if (this.livingFollowIds.length > 0) {
      this.followIndex = 0;

      this.setFollowTarget(
        this.livingFollowIds[0]!,
      );
    } else {
      this.playerCamera.setFreeMode();

      this.matchUI.setSpectatorInfo(
        'Spectating: Free camera (F) | WASD move | Space/Ctrl up/down',
      );
    }
  }

  private setFollowTarget(playerId: string): void {
    const remote = this.remotes.get(playerId);

    if (!remote || !remote.alive) {
      this.playerCamera.setFreeMode();

      this.matchUI.setSpectatorInfo(
        'Spectating: Free camera (F) | Q/E cycle players',
      );

      return;
    }

    this.playerCamera.setFollowMode(remote);

    this.matchUI.setSpectatorInfo(
      `Spectating: ${remote.name} (Q/E cycle, F free cam)`,
    );
  }

  private handleSpectatorInput(): void {
    if (this.player.alive || !this.playing) {
      return;
    }

    if (this.input.consumeKeyPress('KeyF')) {
      this.playerCamera.setFreeMode();

      this.matchUI.setSpectatorInfo(
        'Spectating: Free camera (F) | Q/E cycle players',
      );
    }

    if (this.livingFollowIds.length === 0) {
      return;
    }

    if (this.input.consumeKeyPress('KeyE')) {
      this.followIndex =
        (this.followIndex + 1) %
        this.livingFollowIds.length;

      this.setFollowTarget(
        this.livingFollowIds[this.followIndex]!,
      );
    }

    if (this.input.consumeKeyPress('KeyQ')) {
      this.followIndex =
        (
          this.followIndex -
          1 +
          this.livingFollowIds.length
        ) % this.livingFollowIds.length;

      this.setFollowTarget(
        this.livingFollowIds[this.followIndex]!,
      );
    }

    if (this.playerCamera.getMode() === 'follow') {
      const currentId =
        this.livingFollowIds[this.followIndex];

      if (
        !currentId ||
        !this.remotes.get(currentId)?.alive
      ) {
        this.refreshLivingFollowList();

        if (this.livingFollowIds.length > 0) {
          this.followIndex = 0;

          this.setFollowTarget(
            this.livingFollowIds[0]!,
          );
        } else {
          this.playerCamera.setFreeMode();

          this.matchUI.setSpectatorInfo(
            'Spectating: Free camera',
          );
        }
      }
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const delta = Math.min(
      this.clock.getDelta(),
      0.1,
    );

    this.handleSpectatorInput();

    if (
      this.playing &&
      this.player.alive &&
      this.input.consumeKeyPress('KeyV')
    ) {
      if (this.aiming) {
        this.stopAiming();
      }

      this.playerCamera.togglePerspective();
    }

    const localActive =
      this.playing &&
      this.player.alive &&
      this.playerCamera.getMode() === 'local';

    if (localActive) {
      this.playerController.update(delta);

      if (
        this.input.getMoveDirection().lengthSq() > 0.01
      ) {
        this.audio.footstep(
          this.input.isKeyDown('ShiftLeft') ||
          this.input.isKeyDown('ShiftRight'),
        );
      }
    }

    this.physicsWorld.step(delta);
    this.player.syncMesh();

    this.playerCamera.update(delta);
    this.updateADS(delta);

    const scoped =
      localActive &&
      this.aiming &&
      this.selectedWeapon === 'sniper' &&
      this.input.isPointerLocked();

    this.player.mesh.visible =
      localActive &&
      this.playerCamera.getPerspective() === 'third';

    this.perspectiveHint.style.display =
      localActive && !scoped ? 'block' : 'none';

    this.pointerHint.style.display =
      localActive && !this.input.isPointerLocked()
        ? 'block'
        : 'none';

    if (localActive) {
      const perspective =
        this.playerCamera.getPerspective() === 'first'
          ? 'FIRST PERSON'
          : 'THIRD PERSON';

      this.perspectiveHint.textContent =
        `${perspective} • V switch • RMB aim`;
    }

    this.shooting.update(delta);

    for (const remote of this.remotes.values()) {
      remote.update(delta);
    }

    if (this.playing && this.player.alive) {
      this.moveSendAcc += delta;

      if (this.moveSendAcc >= MOVE_SEND_RATE) {
        this.moveSendAcc = 0;

        const pos = this.player.position;

        this.network.sendMove({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          facing: this.player.facingAngle,
        });
      }
    }

    this.input.endFrame();

    this.renderer.render(
      this.scene,
      this.camera,
    );
  };
}