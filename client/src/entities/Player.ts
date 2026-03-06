import Phaser from 'phaser';

/**
 * Player entity — represents a player sprite in the game world.
 * Can be the local player (controlled by keyboard/mouse) or a remote player
 * (position updated from server game state broadcasts).
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  public playerId: string;
  public health: number;
  public maxHealth: number;
  public kills: number;
  public alive: boolean;
  public isLocal: boolean;

  // Animation state
  private isMoving: boolean = false;
  private isRunning: boolean = false;
  private isShooting: boolean = false;
  private facingRight: boolean = true;

  // Health bar graphics drawn above the player
  private healthBarBg: Phaser.GameObjects.Graphics;
  private healthBarFill: Phaser.GameObjects.Graphics;
  private nameLabel: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    playerId: string,
    isLocal: boolean = false,
  ) {
    // Start with idle frame (use sprite animation)
    super(scene, x, y, 'idle1');

    this.playerId = playerId;
    this.health = 100;
    this.maxHealth = 100;
    this.kills = 0;
    this.alive = true;
    this.isLocal = isLocal;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(5);

    // Scale sprite (40x40 is small, scale up a bit)
    this.setScale(1.2);

    // Set smaller hitbox for better collision
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 32);
    body.setOffset(8, 8);

    // Health bar background
    this.healthBarBg = scene.add.graphics();
    this.healthBarBg.setDepth(6);

    // Health bar fill
    this.healthBarFill = scene.add.graphics();
    this.healthBarFill.setDepth(7);

    // Player name label
    const displayName = isLocal ? 'You' : playerId.substring(0, 6);
    this.nameLabel = scene.add.text(x, y - 48, displayName, {
      fontSize: '11px',
      color: isLocal ? '#00ff88' : '#ff6666',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.nameLabel.setOrigin(0.5, 1);
    this.nameLabel.setDepth(8);

    this.drawHealthBar();

    // Start idle animation
    this.playAnimation('idle');
  }

  setMovementState(moving: boolean, running: boolean): void {
    this.isMoving = moving;
    this.isRunning = running;

    if (!this.alive) return;

    if (this.isShooting) return; // Don't interrupt shooting

    if (moving) {
      this.playAnimation('run');
    } else {
      this.playAnimation('idle');
    }
  }

  setFacingDirection(angle: number): void {
    // Determine facing direction from angle
    // angle 0 = right, PI = left
    const shouldFaceRight = Math.cos(angle) >= 0;

    if (shouldFaceRight !== this.facingRight) {
      this.facingRight = shouldFaceRight;
      this.setFlipX(!shouldFaceRight);
    }
  }

  playShootAnimation(): void {
    if (!this.alive) return;
    this.isShooting = true;
    this.play('player_shoot');
    this.once('animationcomplete', () => {
      this.isShooting = false;
      // Return to appropriate animation
      if (this.isMoving) {
        this.playAnimation('run');
      } else {
        this.playAnimation('idle');
      }
    });
  }

  private playAnimation(type: 'idle' | 'run' | 'shoot' | 'dead' | 'damage'): void {
    const animKey = `player_${type}`;
    if (this.anims.currentAnim?.key !== animKey) {
      this.play(animKey, true);
    }
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      this.die();
    }
    this.drawHealthBar();
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.drawHealthBar();
  }

  die(): void {
    this.alive = false;
    this.healthBarBg.setVisible(false);
    this.healthBarFill.setVisible(false);
    this.nameLabel.setVisible(false);

    // Play death animation
    this.playAnimation('dead');
    this.once('animationcomplete', () => {
      this.setVisible(false);
    });

    // Death effect
    if (this.scene) {
      const particles = this.scene.add.particles(this.x, this.y, 'bullet', {
        speed: { min: 50, max: 150 },
        scale: { start: 1.5, end: 0 },
        lifespan: 500,
        quantity: 10,
        tint: this.isLocal ? 0x00ff88 : 0xff4466,
      });
      this.scene.time.delayedCall(600, () => particles.destroy());
    }
  }

  respawn(x: number, y: number): void {
    this.alive = true;
    this.health = this.maxHealth;
    this.isMoving = false;
    this.isRunning = false;
    this.isShooting = false;
    this.setPosition(x, y);
    this.setVisible(true);
    this.healthBarBg.setVisible(true);
    this.healthBarFill.setVisible(true);
    this.nameLabel.setVisible(true);
    this.drawHealthBar();

    // Start idle animation
    this.playAnimation('idle');

    // Spawn effect
    if (this.scene) {
      const particles = this.scene.add.particles(x, y, 'bullet', {
        speed: { min: 30, max: 80 },
        scale: { start: 0.5, end: 1.5 },
        alpha: { start: 1, end: 0 },
        lifespan: 400,
        quantity: 8,
        tint: 0x44ff88,
      });
      this.scene.time.delayedCall(500, () => particles.destroy());
    }
  }

  private drawHealthBar(): void {
    this.healthBarBg.clear();
    this.healthBarFill.clear();

    if (!this.alive) return;

    const barWidth = 40;
    const barHeight = 5;
    const x = this.x - barWidth / 2;
    const y = this.y - 34;  // More padding from sprite head
    const fillWidth = (this.health / this.maxHealth) * barWidth;

    // Background with border
    this.healthBarBg.fillStyle(0x000000, 0.7);
    this.healthBarBg.fillRoundedRect(x - 1, y - 1, barWidth + 2, barHeight + 2, 2);
    this.healthBarBg.fillStyle(0x333333);
    this.healthBarBg.fillRoundedRect(x, y, barWidth, barHeight, 2);

    // Health fill with gradient effect based on health
    let colour: number;
    if (this.health > 70) {
      colour = 0x44ff44;
    } else if (this.health > 40) {
      colour = 0xffcc00;
    } else if (this.health > 20) {
      colour = 0xff8800;
    } else {
      colour = 0xff2244;
    }

    this.healthBarFill.fillStyle(colour);
    this.healthBarFill.fillRoundedRect(x, y, Math.max(fillWidth, 0), barHeight, 2);

    // Add shine effect
    this.healthBarFill.fillStyle(0xffffff, 0.3);
    this.healthBarFill.fillRect(x, y, Math.max(fillWidth, 0), 2);
  }

  // Called every frame to keep decorators positioned on the sprite
  syncDecorators(): void {
    if (!this.alive) return;
    this.drawHealthBar();
    this.nameLabel.setPosition(this.x, this.y - 44);
  }

  destroy(fromScene?: boolean): void {
    this.healthBarBg.destroy();
    this.healthBarFill.destroy();
    this.nameLabel.destroy();
    super.destroy(fromScene);
  }
}
