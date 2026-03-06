import Phaser from 'phaser';

/**
 * HUD — head-up display showing health, ammo, and kill count.
 * Lives entirely in screen-space (fixed camera position).
 */
export class HUD {
  private scene: Phaser.Scene;
  private healthText: Phaser.GameObjects.Text;
  private ammoText: Phaser.GameObjects.Text;
  private killText: Phaser.GameObjects.Text;
  private healthBar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Semi-transparent HUD panel
    const panel = scene.add.graphics();
    panel.fillStyle(0x000000, 0.5);
    panel.fillRect(8, 8, 200, 70);
    panel.setScrollFactor(0).setDepth(10);

    this.healthBar = scene.add.graphics();
    this.healthBar.setScrollFactor(0).setDepth(11);

    this.healthText = scene.add.text(16, 16, 'HP: 100', {
      fontSize: '14px',
      color: '#ffffff',
    });
    this.healthText.setScrollFactor(0).setDepth(12);

    this.ammoText = scene.add.text(16, 38, 'Ammo: 30', {
      fontSize: '14px',
      color: '#ffdd57',
    });
    this.ammoText.setScrollFactor(0).setDepth(12);

    this.killText = scene.add.text(16, 58, 'Kills: 0', {
      fontSize: '14px',
      color: '#ff6b6b',
    });
    this.killText.setScrollFactor(0).setDepth(12);
  }

  update(health: number, maxHealth: number, ammo: number, kills: number): void {
    this.healthText.setText(`HP: ${health}`);
    this.ammoText.setText(`Ammo: ${ammo}`);
    this.killText.setText(`Kills: ${kills}`);

    // Redraw health bar
    this.healthBar.clear();
    const barW = 180;
    const fill = (health / maxHealth) * barW;
    this.healthBar.fillStyle(0x333333);
    this.healthBar.fillRect(12, 30, barW, 6);
    const colour = health > 50 ? 0x00cc44 : health > 25 ? 0xffcc00 : 0xff2244;
    this.healthBar.fillStyle(colour);
    this.healthBar.fillRect(12, 30, fill, 6);
  }
}
