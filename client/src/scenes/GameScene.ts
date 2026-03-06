import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Bullet } from '../entities/Bullet';
import { HUD } from '../ui/HUD';
import { WebSocketClient } from '../network/WebSocketClient';
import { AnyEvent, GameStateEvent, MatchEndedEvent, PlayerKilledEvent, PlayerState, ShootEvent } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws';

/**
 * GameScene — the main gameplay scene.
 *
 * Responsibilities:
 *  - Render local + remote players
 *  - Handle WASD movement and mouse aiming/shooting
 *  - Send player actions to the server via WebSocket
 *  - Apply server-authoritative game state broadcasts
 *  - Publish resulting events to Kafka (via the server)
 */
export class GameScene extends Phaser.Scene {
  // Local player entity
  private localPlayer!: Player;
  // Remote players keyed by player ID
  private remotePlayers: Map<string, Player> = new Map();

  // Bullet group (object pool)
  private bullets!: Phaser.Physics.Arcade.Group;

  // Input
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  // HUD overlay
  private hud!: HUD;

  // Network
  private wsClient!: WebSocketClient;
  private localPlayerId!: string;
  private matchId: string | null = null;

  // Rate-limit MOVE events (send at most every 50 ms)
  private lastMoveSent = 0;

  // Client prediction state
  private inputSeq = 0;
  private pendingInputs: Array<{ seq: number; vx: number; vy: number; dt: number }> = [];

  // Ammo
  private ammo = 30;
  private maxAmmo = 30;

  // Current players for scoreboard
  private currentPlayers: Record<string, PlayerState> = {};

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { matchId?: string; playerId?: string }): void {
    this.matchId = data.matchId ?? null;
    this.localPlayerId = data.playerId ?? crypto.randomUUID();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  preload(): void {
    // Generate placeholder textures programmatically — no asset files needed
    this.generateTextures();
  }

  create(): void {
    // World background grid
    this.createWorldBackground();

    // Physics world bounds
    this.physics.world.setBounds(0, 0, 2560, 1440);
    this.cameras.main.setBounds(0, 0, 2560, 1440);

    // Input
    if (this.input.keyboard) {
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    // Bullet group (pool of 60)
    this.bullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 60,
      runChildUpdate: true,
    });

    // Local player (spawns at centre of world)
    this.localPlayer = new Player(this, 1280, 720, this.localPlayerId, true);
    this.cameras.main.startFollow(this.localPlayer, true, 0.1, 0.1);

    // HUD
    this.hud = new HUD(this);

    // Mouse click → shoot
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.shoot(pointer);
      }
    });

    // WebSocket
    this.wsClient = new WebSocketClient(WS_URL, this.localPlayerId);
    this.wsClient.onMessage((event) => this.handleServerEvent(event));
    this.wsClient.connect();

    // Back-to-menu key (Escape)
    if (this.input.keyboard) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
        this.wsClient.disconnect();
        this.scene.start('MenuScene');
      });

      // Scoreboard toggle (Tab)
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB).on('down', () => {
        this.hud.toggleScoreboard(this.currentPlayers, this.localPlayerId);
      });
    }

    // Instructions overlay
    this.add
      .text(this.scale.width / 2, this.scale.height - 20, 'WASD: Move  |  Mouse: Aim & Shoot  |  TAB: Scoreboard  |  ESC: Menu', {
        fontSize: '13px',
        color: '#555577',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
  }

  update(time: number, delta: number): void {
    if (!this.localPlayer.alive) return;

    this.handleMovement(time, delta);
    this.aimAtMouse();
    this.localPlayer.syncDecorators();

    // Sync decorators for remote players
    this.remotePlayers.forEach((p) => p.syncDecorators());
  }

  // ─── Input Handlers ───────────────────────────────────────────────────────

  private handleMovement(time: number, delta: number): void {
    const speed = 200;
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

    let vx = 0;
    let vy = 0;

    if (this.wasd.left.isDown) vx = -speed;
    else if (this.wasd.right.isDown) vx = speed;

    if (this.wasd.up.isDown) vy = -speed;
    else if (this.wasd.down.isDown) vy = speed;

    // Client prediction: apply movement immediately
    body.setVelocity(vx, vy);

    // Rate-limited MOVE event with sequence number
    const moving = vx !== 0 || vy !== 0;
    if (moving && time - this.lastMoveSent > 50) {
      this.lastMoveSent = time;
      this.inputSeq++;
      const dt = delta / 1000; // Convert to seconds

      // Store pending input for reconciliation
      this.pendingInputs.push({ seq: this.inputSeq, vx, vy, dt });

      // Send to server with sequence number
      this.wsClient.send({
        type: 'MOVE',
        playerId: this.localPlayerId,
        seq: this.inputSeq,
        x: this.localPlayer.x,
        y: this.localPlayer.y,
        velocityX: vx,
        velocityY: vy,
        angle: this.localPlayer.rotation,
        timestamp: Date.now(),
      });
    }
  }

  private aimAtMouse(): void {
    const pointer = this.input.activePointer;
    const worldPointer = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const angle = Phaser.Math.Angle.Between(
      this.localPlayer.x,
      this.localPlayer.y,
      worldPointer.x,
      worldPointer.y,
    );
    this.localPlayer.setRotation(angle);
  }

  private shoot(pointer: Phaser.Input.Pointer): void {
    if (!this.localPlayer.alive || this.ammo <= 0) return;

    const worldPointer = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const angle = Phaser.Math.Angle.Between(
      this.localPlayer.x,
      this.localPlayer.y,
      worldPointer.x,
      worldPointer.y,
    );

    const bullet = this.bullets.get() as Bullet | null;
    if (bullet) {
      bullet.fire(this.localPlayer.x, this.localPlayer.y, angle, this.localPlayerId);
      this.ammo = Math.max(0, this.ammo - 1);

      // Auto-reload after 3 seconds when empty
      if (this.ammo === 0) {
        this.time.delayedCall(3000, () => {
          this.ammo = this.maxAmmo;
        });
      }

      // Send SHOOT event to server → Kafka
      this.wsClient.send({
        type: 'SHOOT',
        playerId: this.localPlayerId,
        x: this.localPlayer.x,
        y: this.localPlayer.y,
        angle,
        timestamp: Date.now(),
      });
    }
  }

  // ─── Server Event Handler ─────────────────────────────────────────────────

  private handleServerEvent(event: AnyEvent | GameStateEvent): void {
    if (event.type === 'GAME_STATE') {
      this.applyGameState(event as GameStateEvent);
    } else if (event.type === 'SHOOT') {
      // Render bullet from remote player
      this.handleRemoteShoot(event as ShootEvent);
    } else if (event.type === 'MATCH_ENDED') {
      this.handleMatchEnded(event as MatchEndedEvent);
    } else if (event.type === 'PLAYER_KILLED') {
      this.handlePlayerKilled(event as PlayerKilledEvent);
    }
  }

  private handlePlayerKilled(event: PlayerKilledEvent): void {
    const killerName = event.killedBy
      ? event.killedBy === this.localPlayerId
        ? 'You'
        : event.killedBy.substring(0, 6)
      : 'Unknown';
    const victimName = event.playerId === this.localPlayerId ? 'You' : event.playerId.substring(0, 6);
    this.hud.addKillFeedItem(killerName, victimName);
  }

  private handleMatchEnded(event: MatchEndedEvent): void {
    // Show match results
    const { width, height } = this.scale;

    // Overlay
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setScrollFactor(0).setDepth(100);

    // Results text
    const myScore = event.scores[this.localPlayerId] ?? 0;
    const winner = event.winnerId === this.localPlayerId ? 'You Win!' : 'Match Over';

    this.add
      .text(width / 2, height * 0.3, winner, {
        fontSize: '48px',
        color: '#e94560',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);

    this.add
      .text(width / 2, height * 0.45, `Your Kills: ${myScore}`, {
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);

    // Return to menu after delay
    this.time.delayedCall(5000, () => {
      this.wsClient.disconnect();
      this.scene.start('MenuScene');
    });
  }

  private handleRemoteShoot(event: ShootEvent): void {
    // Don't render our own bullets twice
    if (event.playerId === this.localPlayerId) return;

    const bullet = this.bullets.get() as Bullet | null;
    if (bullet) {
      bullet.fire(event.x, event.y, event.angle, event.playerId);
    }
  }

  /**
   * Apply authoritative game state broadcast from server.
   * Creates/updates/removes remote player sprites.
   * Performs server reconciliation for local player.
   */
  private applyGameState(state: GameStateEvent): void {
    const players = state.players;

    // Store for scoreboard
    this.currentPlayers = players;

    // Update player count
    this.hud.updatePlayerCount(Object.keys(players).length);

    Object.entries(players).forEach(([id, ps]: [string, PlayerState]) => {
      if (id === this.localPlayerId) {
        // Update local player health & kills from server
        this.localPlayer.health = ps.health;
        this.localPlayer.kills = ps.kills;
        if (!ps.alive && this.localPlayer.alive) {
          this.localPlayer.die();
          // Auto-respawn after 3 seconds
          this.time.delayedCall(3000, () => this.respawn());
        }

        // Discard acknowledged inputs
        this.pendingInputs = this.pendingInputs.filter(
          (input) => input.seq > ps.lastProcessedSeq
        );

        // Only snap to server position if significantly desynced (> 100px)
        // This prevents jitter while still correcting major desyncs
        const dx = ps.x - this.localPlayer.x;
        const dy = ps.y - this.localPlayer.y;
        const distSq = dx * dx + dy * dy;
        const SNAP_THRESHOLD_SQ = 100 * 100; // 100 pixels

        if (distSq > SNAP_THRESHOLD_SQ) {
          this.localPlayer.setPosition(ps.x, ps.y);
          this.pendingInputs = []; // Clear pending inputs on hard snap
        }
        return;
      }

      if (!this.remotePlayers.has(id)) {
        // New remote player
        const rp = new Player(this, ps.x, ps.y, id, false);
        this.remotePlayers.set(id, rp);
      }

      const rp = this.remotePlayers.get(id)!;
      if (ps.alive) {
        // If remote player was dead but is now alive, respawn them
        if (!rp.alive) {
          rp.respawn(ps.x, ps.y);
        }
        rp.setPosition(ps.x, ps.y);
        rp.setRotation(ps.angle);
        rp.health = ps.health;
      } else if (rp.alive) {
        rp.die();
      }
    });

    // Remove players that left the game
    this.remotePlayers.forEach((rp, id) => {
      if (!players[id]) {
        rp.destroy();
        this.remotePlayers.delete(id);
      }
    });

    // Update HUD from local player state
    this.hud.update(
      this.localPlayer.health,
      this.localPlayer.maxHealth,
      this.ammo,
      this.localPlayer.kills,
    );

    // Update scoreboard if visible
    if (this.hud.isScoreboardVisible()) {
      this.hud.showScoreboard(this.currentPlayers, this.localPlayerId);
    }
  }

  private respawn(): void {
    const x = Phaser.Math.Between(200, 2360);
    const y = Phaser.Math.Between(200, 1240);
    this.localPlayer.respawn(x, y);
    this.ammo = this.maxAmmo;

    // Reset prediction state on respawn
    this.pendingInputs = [];

    this.wsClient.send({
      type: 'RESPAWN',
      playerId: this.localPlayerId,
      x,
      y,
      timestamp: Date.now(),
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private generateTextures(): void {
    // Local player — green circle
    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(0x00ff88);
    gfx.fillCircle(16, 16, 14);
    gfx.fillStyle(0xffffff);
    gfx.fillRect(18, 13, 12, 6); // gun barrel
    gfx.generateTexture('player_local', 32, 32);
    gfx.destroy();

    // Remote player — red circle
    const gfx2 = this.make.graphics({ x: 0, y: 0 });
    gfx2.fillStyle(0xff4466);
    gfx2.fillCircle(16, 16, 14);
    gfx2.fillStyle(0xffffff);
    gfx2.fillRect(18, 13, 12, 6);
    gfx2.generateTexture('player_remote', 32, 32);
    gfx2.destroy();

    // Bullet — yellow dot
    const gfx3 = this.make.graphics({ x: 0, y: 0 });
    gfx3.fillStyle(0xffdd57);
    gfx3.fillCircle(4, 4, 4);
    gfx3.generateTexture('bullet', 8, 8);
    gfx3.destroy();
  }

  private createWorldBackground(): void {
    // Draw a grid to give a sense of space
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x222244, 0.6);
    for (let x = 0; x < 2560; x += 80) {
      gfx.lineBetween(x, 0, x, 1440);
    }
    for (let y = 0; y < 1440; y += 80) {
      gfx.lineBetween(0, y, 2560, y);
    }
  }
}
