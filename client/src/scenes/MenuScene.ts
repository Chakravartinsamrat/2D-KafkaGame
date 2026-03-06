import Phaser from 'phaser';

/**
 * MenuScene — the main menu shown before joining a game room.
 * Provides Start Game and (placeholder) Join Room / View Replay buttons.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background gradient via rectangle
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add
      .text(width / 2, height * 0.22, '2D Kafka Game', {
        fontSize: '52px',
        color: '#e94560',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.34, 'Real-time multiplayer shooter', {
        fontSize: '20px',
        color: '#aaaacc',
      })
      .setOrigin(0.5);

    // Start Game button
    this.createButton(width / 2, height * 0.52, 'Start Game', () => {
      this.scene.start('GameScene');
    });

    // Join Room button (placeholder)
    this.createButton(width / 2, height * 0.64, 'Join Room', () => {
      this.showNotice('Room joining coming soon!');
    });

    // View Replay button (placeholder)
    this.createButton(width / 2, height * 0.76, 'View Match Replay', () => {
      this.showNotice('Replay viewer coming soon!');
    });

    // Footer note
    this.add
      .text(width / 2, height - 24, 'Powered by Phaser.js + FastAPI + Kafka', {
        fontSize: '13px',
        color: '#555577',
      })
      .setOrigin(0.5);
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 240, 44, 0x16213e)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0xe94560);

    const text = this.add
      .text(x, y, label, { fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0xe94560);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x16213e);
    });
    bg.on('pointerdown', onClick);
    // Keep text on top
    text.setDepth(1);
  }

  private showNotice(msg: string): void {
    const { width, height } = this.scale;
    const notice = this.add
      .text(width / 2, height * 0.88, msg, {
        fontSize: '16px',
        color: '#ffdd57',
      })
      .setOrigin(0.5);

    this.time.delayedCall(2500, () => notice.destroy());
  }
}
