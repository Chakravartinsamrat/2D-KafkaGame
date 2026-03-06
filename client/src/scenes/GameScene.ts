import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Bullet } from '../entities/Bullet';
import { HUD } from '../ui/HUD';
import { WebSocketClient } from '../network/WebSocketClient';
import { AnyEvent, GameStateEvent, PlayerState } from '../types';

// Generate a unique player ID for this session
const LOCAL_PLAYER_ID = crypto.randomUUID();
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

  // Rate-limit MOVE events (send at most every 50 ms)
  private lastMoveSent = 0;

  // Ammo
  private ammo = 30;
  private maxAmmo = 30;

  constructor() {
    super({ key: 'GameScene' });
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
    this.localPlayer = new Player(this, 1280, 720, LOCAL_PLAYER_ID, true);
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
    this.wsClient = new WebSocketClient(WS_URL, LOCAL_PLAYER_ID);
    this.wsClient.onMessage((event) => this.handleServerEvent(event));
    this.wsClient.connect();

    // Back-to-menu key (Escape)
    if (this.input.keyboard) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
        this.wsClient.disconnect();
        this.scene.start('MenuScene');
      });
    }

    // Instructions overlay
    this.add
      .text(this.scale.width / 2, this.scale.height - 20, 'WASD: Move  |  Mouse: Aim & Shoot  |  ESC: Menu', {
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

  private handleMovement(time: number, _delta: number): void {
    const speed = 200;
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

    let vx = 0;
    let vy = 0;

    if (this.wasd.left.isDown) vx = -speed;
    else if (this.wasd.right.isDown) vx = speed;

    if (this.wasd.up.isDown) vy = -speed;
    else if (this.wasd.down.isDown) vy = speed;

    body.setVelocity(vx, vy);

    // Rate-limited MOVE event
    const moving = vx !== 0 || vy !== 0;
    if (moving && time - this.lastMoveSent > 50) {
      this.lastMoveSent = time;
      this.wsClient.send({
        type: 'MOVE',
        playerId: LOCAL_PLAYER_ID,
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
      bullet.fire(this.localPlayer.x, this.localPlayer.y, angle, LOCAL_PLAYER_ID);
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
        playerId: LOCAL_PLAYER_ID,
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
    }
  }

  /**
   * Apply authoritative game state broadcast from server.
   * Creates/updates/removes remote player sprites.
   */
  private applyGameState(state: GameStateEvent): void {
    const players = state.players;

    Object.entries(players).forEach(([id, ps]: [string, PlayerState]) => {
      if (id === LOCAL_PLAYER_ID) {
        // Update local player health & kills from server
        this.localPlayer.health = ps.health;
        this.localPlayer.kills = ps.kills;
        if (!ps.alive && this.localPlayer.alive) {
          this.localPlayer.die();
          // Auto-respawn after 3 seconds
          this.time.delayedCall(3000, () => this.respawn());
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
  }

  private respawn(): void {
    const x = Phaser.Math.Between(200, 2360);
    const y = Phaser.Math.Between(200, 1240);
    this.localPlayer.respawn(x, y);
    this.ammo = this.maxAmmo;

    this.wsClient.send({
      type: 'RESPAWN',
      playerId: LOCAL_PLAYER_ID,
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
