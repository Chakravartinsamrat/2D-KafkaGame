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

  // Health bar graphics drawn above the player
  private healthBar: Phaser.GameObjects.Graphics;
  private nameLabel: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    playerId: string,
    isLocal: boolean = false,
  ) {
    // Use a generated texture since we have no asset files
    super(scene, x, y, isLocal ? 'player_local' : 'player_remote');

    this.playerId = playerId;
    this.health = 100;
    this.maxHealth = 100;
    this.kills = 0;
    this.alive = true;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);

    // Health bar rendered above the player sprite
    this.healthBar = scene.add.graphics();

    // Short player ID label
    this.nameLabel = scene.add.text(x, y - 32, playerId.substring(0, 6), {
      fontSize: '10px',
      color: isLocal ? '#00ff88' : '#ff6688',
    });
    this.nameLabel.setOrigin(0.5, 1);
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
    this.setVisible(false);
    this.healthBar.setVisible(false);
    this.nameLabel.setVisible(false);
  }

  respawn(x: number, y: number): void {
    this.alive = true;
    this.health = this.maxHealth;
    this.setPosition(x, y);
    this.setVisible(true);
    this.healthBar.setVisible(true);
    this.nameLabel.setVisible(true);
    this.drawHealthBar();
  }

  private drawHealthBar(): void {
    this.healthBar.clear();

    const barWidth = 32;
    const barHeight = 4;
    const x = this.x - barWidth / 2;
    const y = this.y - 28;
    const fillWidth = (this.health / this.maxHealth) * barWidth;

    // Background
    this.healthBar.fillStyle(0x333333);
    this.healthBar.fillRect(x, y, barWidth, barHeight);

    // Health fill (green → red based on health)
    const colour = this.health > 50 ? 0x00ff00 : this.health > 25 ? 0xffff00 : 0xff0000;
    this.healthBar.fillStyle(colour);
    this.healthBar.fillRect(x, y, fillWidth, barHeight);
  }

  // Called every frame to keep decorators positioned on the sprite
  syncDecorators(): void {
    if (!this.alive) return;
    this.drawHealthBar();
    this.nameLabel.setPosition(this.x, this.y - 32);
  }

  destroy(fromScene?: boolean): void {
    this.healthBar.destroy();
    this.nameLabel.destroy();
    super.destroy(fromScene);
  }
}
