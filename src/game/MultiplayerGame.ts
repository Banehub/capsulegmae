import * as THREE from 'three';
import { MAX_HEALTH } from '../../shared/combat.ts';
import type { PlayerSnapshot, RoomSnapshot } from '../../shared/protocol.ts';
import { ShootingSystem } from '../combat/ShootingSystem.ts';
import { InputManager } from '../input/InputManager.ts';
import { NetworkClient } from '../network/NetworkClient.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { Player } from '../player/Player.ts';
import { PlayerCamera } from '../player/PlayerCamera.ts';
import { PlayerController } from '../player/PlayerController.ts';
import { RemotePlayer } from '../player/RemotePlayer.ts';
import { createGround, createObstacles } from '../scene/createGround.ts';
import { createScene } from '../scene/createScene.ts';
import { LobbyUI } from '../ui/LobbyUI.ts';
import { MatchUI } from '../ui/MatchUI.ts';
import { VictoryScreen } from '../ui/VictoryScreen.ts';

const MOVE_SEND_RATE = 1 / 30;

export class MultiplayerGame {
  private network = new NetworkClient();
  private lobby: LobbyUI;
  private matchUI = new MatchUI();
  private victory: VictoryScreen;
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

  constructor() {
    this.lobby = new LobbyUI(this.network, () => this.startMatch());
    this.victory = new VictoryScreen(
      () => this.requestRematch(),
      () => this.returnToMenu(),
    );
    this.matchUI.showGameplayHud(false);
    this.wireNetwork();
  }

  async init(container: HTMLElement): Promise<void> {
    const ctx = createScene(container);
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.renderer = ctx.renderer;

    await this.physicsWorld.init();
    const groundMeshes = createGround(this.scene, this.physicsWorld);
    const obstacles = createObstacles(this.scene, this.physicsWorld);

    this.input = new InputManager(this.renderer.domElement);
    this.player = new Player(this.scene, this.physicsWorld);
    this.playerCamera = new PlayerCamera(this.camera, this.player, this.input);
    this.playerController = new PlayerController(this.player, this.input, this.playerCamera);
    this.shooting = new ShootingSystem(
      this.scene,
      this.camera,
      this.player,
      this.playerCamera,
      this.input,
    );
    this.shooting.setNetwork(this.network);
    this.shooting.setCollidables([
      ...groundMeshes,
      ...obstacles.map((o) => o.mesh),
    ]);

    this.playerController.enabled = false;
    this.shooting.enabled = false;
    this.player.mesh.visible = false;

    this.animate();
  }

  private wireNetwork(): void {
    this.network.onRoomState = (room) => this.onRoomState(room);
    this.network.onPlayersUpdate = (players) => this.syncRemotes(players);
    this.network.onShotFired = (shot) => this.shooting.spawnNetworkShot(shot);
    this.network.onHealth = (update) => {
      if (update.playerId === this.network.playerId) {
        this.player.setHealth(update.health, update.alive);
        this.matchUI.setHealth(update.health, MAX_HEALTH);
        if (!update.alive) {
          this.enterSpectate();
        }
      } else {
        this.remotes.get(update.playerId)?.setHealth(update.health, update.alive);
      }
    };
    this.network.onEliminated = ({ playerId, name }) => {
      if (playerId === this.network.playerId) {
        this.matchUI.setStatus(`You were eliminated`);
        this.enterSpectate();
      } else {
        this.matchUI.setStatus(`${name} eliminated`);
      }
      this.refreshLivingFollowList();
    };
    this.network.onRoundEnd = ({ standings }) => {
      this.playing = false;
      this.playerController.enabled = false;
      this.shooting.enabled = false;
      this.matchUI.setStatus('');
      this.matchUI.clearSpectatorInfo();
      this.matchUI.showGameplayHud(false);
      this.playerCamera.setLocalMode();

      const isHost = this.network.playerId === this.network.room?.hostId;
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
    window.location.reload();
  }

  private onRoomState(room: RoomSnapshot): void {
    this.lobby.renderRoom(room);

    if (room.phase === 'playing') {
      this.victory.hide();
      this.syncRemotes(room.players);
      const me = room.players.find((p) => p.id === this.network.playerId);
      if (me) {
        this.player.name = me.name;
        this.player.setColor(me.color);
        this.player.setHealth(me.health, me.alive);
        this.matchUI.setHealth(me.health, MAX_HEALTH);

        if (!this.startedOnce || !this.playing) {
          this.player.setSpawn(me.x, me.y, me.z, me.facing);
        }

        if (me.alive) {
          this.playerController.enabled = true;
          this.shooting.enabled = true;
          this.playerCamera.setLocalMode();
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
      this.playerController.enabled = false;
      this.shooting.enabled = false;
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
        this.remotes.set(snapshot.id, new RemotePlayer(this.scene, snapshot));
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
    this.livingFollowIds = [...this.remotes.values()]
      .filter((remote) => remote.alive)
      .map((remote) => remote.id);

    // Local player can also be followed by others, but local spectator follows remotes only.
    if (!this.player.alive) {
      // keep list as remotes that are alive
    }

    if (this.followIndex >= this.livingFollowIds.length) {
      this.followIndex = 0;
    }
  }

  private enterSpectate(): void {
    this.playerController.enabled = false;
    this.shooting.enabled = false;
    this.player.mesh.visible = false;
    this.matchUI.showGameplayHud(false);
    this.refreshLivingFollowList();

    if (this.livingFollowIds.length > 0) {
      this.followIndex = 0;
      this.setFollowTarget(this.livingFollowIds[0]!);
    } else {
      this.playerCamera.setFreeMode();
      this.matchUI.setSpectatorInfo('Spectating: Free camera (F) | WASD move | Space/Ctrl up/down');
    }
  }

  private setFollowTarget(playerId: string): void {
    const remote = this.remotes.get(playerId);
    if (!remote || !remote.alive) {
      this.playerCamera.setFreeMode();
      this.matchUI.setSpectatorInfo('Spectating: Free camera (F) | Q/E cycle players');
      return;
    }
    this.playerCamera.setFollowMode(remote);
    this.matchUI.setSpectatorInfo(
      `Spectating: ${remote.name} (Q/E cycle, F free cam)`,
    );
  }

  private handleSpectatorInput(): void {
    if (this.player.alive || !this.playing) return;

    if (this.input.consumeKeyPress('KeyF')) {
      this.playerCamera.setFreeMode();
      this.matchUI.setSpectatorInfo('Spectating: Free camera (F) | Q/E cycle players');
    }

    if (this.livingFollowIds.length === 0) return;

    if (this.input.consumeKeyPress('KeyE')) {
      this.followIndex = (this.followIndex + 1) % this.livingFollowIds.length;
      this.setFollowTarget(this.livingFollowIds[this.followIndex]!);
    }

    if (this.input.consumeKeyPress('KeyQ')) {
      this.followIndex =
        (this.followIndex - 1 + this.livingFollowIds.length) % this.livingFollowIds.length;
      this.setFollowTarget(this.livingFollowIds[this.followIndex]!);
    }

    // If currently following a now-dead player, jump to next living.
    if (this.playerCamera.getMode() === 'follow') {
      const currentId = this.livingFollowIds[this.followIndex];
      if (!currentId || !this.remotes.get(currentId)?.alive) {
        this.refreshLivingFollowList();
        if (this.livingFollowIds.length > 0) {
          this.followIndex = 0;
          this.setFollowTarget(this.livingFollowIds[0]!);
        } else {
          this.playerCamera.setFreeMode();
          this.matchUI.setSpectatorInfo('Spectating: Free camera');
        }
      }
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    this.handleSpectatorInput();

    if (this.playing && this.player.alive) {
      this.playerController.update(delta);
    }

    this.physicsWorld.step(delta);
    this.player.syncMesh();
    this.playerCamera.update(delta);
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
    this.renderer.render(this.scene, this.camera);
  };
}
