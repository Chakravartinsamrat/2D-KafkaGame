import Phaser from 'phaser';
import { PlayerState } from '../types';

/**
 * HUD — head-up display showing health, ammo, kill count, kill feed, and scoreboard.
 * Lives entirely in screen-space (fixed camera position).
 */
export class HUD {
  private scene: Phaser.Scene;
  private healthText: Phaser.GameObjects.Text;
  private ammoText: Phaser.GameObjects.Text;
  private killText: Phaser.GameObjects.Text;
  private healthBar: Phaser.GameObjects.Graphics;
  private playerCountText: Phaser.GameObjects.Text;

  // Kill feed
  private killFeedContainer: Phaser.GameObjects.Container;
  private killFeedItems: Phaser.GameObjects.Text[] = [];
  private readonly MAX_KILL_FEED = 5;

  // Scoreboard
  private scoreboardContainer: Phaser.GameObjects.Container;
  private scoreboardVisible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = scene.scale;

    // Semi-transparent HUD panel (top-left)
    const panel = scene.add.graphics();
    panel.fillStyle(0x000000, 0.6);
    panel.fillRoundedRect(8, 8, 180, 90, 8);
    panel.setScrollFactor(0).setDepth(10);

    this.healthBar = scene.add.graphics();
    this.healthBar.setScrollFactor(0).setDepth(11);

    this.healthText = scene.add.text(16, 14, 'HP: 100', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.healthText.setScrollFactor(0).setDepth(12);

    this.ammoText = scene.add.text(16, 50, 'AMMO: 30', {
      fontSize: '14px',
      color: '#ffdd57',
    });
    this.ammoText.setScrollFactor(0).setDepth(12);

    this.killText = scene.add.text(16, 72, 'KILLS: 0', {
      fontSize: '14px',
      color: '#ff6b6b',
    });
    this.killText.setScrollFactor(0).setDepth(12);

    // Player count (top-right)
    this.playerCountText = scene.add.text(width - 16, 16, 'Players: 0', {
      fontSize: '14px',
      color: '#aaaacc',
    });
    this.playerCountText.setOrigin(1, 0).setScrollFactor(0).setDepth(12);

    // Kill feed (right side)
    this.killFeedContainer = scene.add.container(width - 16, 50);
    this.killFeedContainer.setScrollFactor(0).setDepth(12);

    // Scoreboard (center, hidden by default)
    this.scoreboardContainer = scene.add.container(width / 2, height / 2);
    this.scoreboardContainer.setScrollFactor(0).setDepth(50);
    this.scoreboardContainer.setVisible(false);

    // Scoreboard hint
    scene.add
      .text(width - 16, height - 16, 'TAB: Scoreboard', {
        fontSize: '12px',
        color: '#666688',
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(10);
  }

  update(health: number, maxHealth: number, ammo: number, kills: number): void {
    this.healthText.setText(`HP: ${health}`);
    this.ammoText.setText(`AMMO: ${ammo}`);
    this.killText.setText(`KILLS: ${kills}`);

    // Redraw health bar
    this.healthBar.clear();
    const barW = 160;
    const fill = (health / maxHealth) * barW;
    this.healthBar.fillStyle(0x222222);
    this.healthBar.fillRoundedRect(14, 36, barW, 10, 3);
    const colour = health > 50 ? 0x00cc44 : health > 25 ? 0xffcc00 : 0xff2244;
    this.healthBar.fillStyle(colour);
    this.healthBar.fillRoundedRect(14, 36, Math.max(fill, 0), 10, 3);
  }

  updatePlayerCount(count: number): void {
    this.playerCountText.setText(`Players: ${count}`);
  }

  addKillFeedItem(killerName: string, victimName: string): void {
    const text = this.scene.add.text(0, 0, `${killerName} killed ${victimName}`, {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { x: 8, y: 4 },
    });
    text.setOrigin(1, 0);

    // Shift existing items down
    this.killFeedItems.forEach((item, i) => {
      item.setY((i + 1) * 28);
    });

    this.killFeedItems.unshift(text);
    this.killFeedContainer.add(text);

    // Remove old items if too many
    while (this.killFeedItems.length > this.MAX_KILL_FEED) {
      const old = this.killFeedItems.pop();
      old?.destroy();
    }

    // Fade out after 5 seconds
    this.scene.time.delayedCall(5000, () => {
      const idx = this.killFeedItems.indexOf(text);
      if (idx >= 0) {
        this.killFeedItems.splice(idx, 1);
        text.destroy();
        // Re-position remaining items
        this.killFeedItems.forEach((item, i) => {
          item.setY(i * 28);
        });
      }
    });
  }

  showScoreboard(players: Record<string, PlayerState>, localPlayerId: string): void {
    this.scoreboardContainer.removeAll(true);

    const { width } = this.scene.scale;
    const boardWidth = 300;
    const headerHeight = 40;
    const rowHeight = 30;
    const sortedPlayers = Object.values(players).sort((a, b) => b.kills - a.kills);
    const boardHeight = headerHeight + sortedPlayers.length * rowHeight + 20;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(-boardWidth / 2, -boardHeight / 2, boardWidth, boardHeight, 12);
    bg.lineStyle(2, 0xe94560);
    bg.strokeRoundedRect(-boardWidth / 2, -boardHeight / 2, boardWidth, boardHeight, 12);
    this.scoreboardContainer.add(bg);

    // Title
    const title = this.scene.add.text(0, -boardHeight / 2 + 12, 'SCOREBOARD', {
      fontSize: '18px',
      color: '#e94560',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5, 0);
    this.scoreboardContainer.add(title);

    // Header row
    const headerY = -boardHeight / 2 + headerHeight + 5;
    const nameHeader = this.scene.add.text(-boardWidth / 2 + 20, headerY, 'Player', {
      fontSize: '12px',
      color: '#888899',
    });
    const killsHeader = this.scene.add.text(boardWidth / 2 - 60, headerY, 'Kills', {
      fontSize: '12px',
      color: '#888899',
    });
    killsHeader.setOrigin(1, 0);
    const statusHeader = this.scene.add.text(boardWidth / 2 - 20, headerY, 'Status', {
      fontSize: '12px',
      color: '#888899',
    });
    statusHeader.setOrigin(1, 0);
    this.scoreboardContainer.add([nameHeader, killsHeader, statusHeader]);

    // Player rows
    sortedPlayers.forEach((player, i) => {
      const y = headerY + 20 + i * rowHeight;
      const isLocal = player.id === localPlayerId;

      // Highlight local player row
      if (isLocal) {
        const highlight = this.scene.add.graphics();
        highlight.fillStyle(0xe94560, 0.2);
        highlight.fillRoundedRect(-boardWidth / 2 + 5, y - 5, boardWidth - 10, rowHeight - 2, 4);
        this.scoreboardContainer.add(highlight);
      }

      const nameText = this.scene.add.text(
        -boardWidth / 2 + 20,
        y,
        `${player.id.substring(0, 8)}${isLocal ? ' (You)' : ''}`,
        {
          fontSize: '14px',
          color: isLocal ? '#00ff88' : '#ffffff',
        }
      );

      const killsText = this.scene.add.text(boardWidth / 2 - 60, y, `${player.kills}`, {
        fontSize: '14px',
        color: '#ffdd57',
      });
      killsText.setOrigin(1, 0);

      const statusText = this.scene.add.text(
        boardWidth / 2 - 20,
        y,
        player.alive ? 'Alive' : 'Dead',
        {
          fontSize: '14px',
          color: player.alive ? '#44ff88' : '#ff4466',
        }
      );
      statusText.setOrigin(1, 0);

      this.scoreboardContainer.add([nameText, killsText, statusText]);
    });

    this.scoreboardContainer.setVisible(true);
    this.scoreboardVisible = true;
  }

  hideScoreboard(): void {
    this.scoreboardContainer.setVisible(false);
    this.scoreboardVisible = false;
  }

  toggleScoreboard(players: Record<string, PlayerState>, localPlayerId: string): void {
    if (this.scoreboardVisible) {
      this.hideScoreboard();
    } else {
      this.showScoreboard(players, localPlayerId);
    }
  }

  isScoreboardVisible(): boolean {
    return this.scoreboardVisible;
  }
}
