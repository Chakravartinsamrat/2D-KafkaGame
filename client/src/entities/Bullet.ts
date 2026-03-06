import Phaser from 'phaser';

/**
 * Bullet entity — a simple projectile fired by a player.
 * Bullets are pooled via a Phaser Group in GameScene for performance.
 */
export class Bullet extends Phaser.Physics.Arcade.Sprite {
  public ownerId: string = '';
  public speed: number = 600;
  public damage: number = 25;
  private lifespan: number = 800; // ms before auto-destroy
  private born: number = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'bullet');
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }

  fire(x: number, y: number, angle: number, ownerId: string): void {
    this.ownerId = ownerId;
    this.born = this.scene.time.now;
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    this.setRotation(angle);

    const vx = Math.cos(angle) * this.speed;
    const vy = Math.sin(angle) * this.speed;
    this.setVelocity(vx, vy);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    // Deactivate bullet after its lifespan expires
    if (time - this.born > this.lifespan) {
      this.setActive(false);
      this.setVisible(false);
    }
  }
}
