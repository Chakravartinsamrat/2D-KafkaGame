import Phaser from 'phaser';
import { Room } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/**
 * MenuScene — the main menu shown before joining a game room.
 * Provides Quick Play, Room Browser, and Create Room options.
 */
export class MenuScene extends Phaser.Scene {
  private roomListContainer?: Phaser.GameObjects.Container;
  private rooms: Room[] = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add
      .text(width / 2, height * 0.12, '2D Kafka Game', {
        fontSize: '52px',
        color: '#e94560',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.20, 'Real-time multiplayer shooter', {
        fontSize: '20px',
        color: '#aaaacc',
      })
      .setOrigin(0.5);

    // Quick Play button (joins global game)
    this.createButton(width / 2, height * 0.32, 'Quick Play', () => {
      this.scene.start('GameScene', { matchId: null });
    });

    // Create Room button
    this.createButton(width / 2, height * 0.42, 'Create Room', () => {
      this.showCreateRoomDialog();
    });

    // Room list section
    this.add
      .text(width / 2, height * 0.52, 'Available Rooms', {
        fontSize: '18px',
        color: '#aaaacc',
      })
      .setOrigin(0.5);

    // Refresh button
    this.createSmallButton(width / 2 + 120, height * 0.52, 'Refresh', () => {
      this.fetchRooms();
    });

    // Room list container
    this.roomListContainer = this.add.container(width / 2, height * 0.58);

    // Footer
    this.add
      .text(width / 2, height - 24, 'Powered by Phaser.js + FastAPI + Kafka', {
        fontSize: '13px',
        color: '#555577',
      })
      .setOrigin(0.5);

    // Fetch rooms on scene create
    this.fetchRooms();
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 240, 44, 0x16213e)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0xe94560);

    const text = this.add
      .text(x, y, label, { fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0xe94560));
    bg.on('pointerout', () => bg.setFillStyle(0x16213e));
    bg.on('pointerdown', onClick);
    text.setDepth(1);
  }

  private createSmallButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 80, 28, 0x16213e)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x555577);

    const text = this.add
      .text(x, y, label, { fontSize: '12px', color: '#aaaaaa' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x333355));
    bg.on('pointerout', () => bg.setFillStyle(0x16213e));
    bg.on('pointerdown', onClick);
    text.setDepth(1);
  }

  private async fetchRooms(): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/rooms`);
      const data = await response.json();
      this.rooms = data.rooms || [];
      this.renderRoomList();
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      this.showNotice('Failed to fetch rooms');
    }
  }

  private renderRoomList(): void {
    if (!this.roomListContainer) return;

    // Clear existing items
    this.roomListContainer.removeAll(true);

    if (this.rooms.length === 0) {
      const noRooms = this.add
        .text(0, 20, 'No rooms available. Create one!', {
          fontSize: '14px',
          color: '#666688',
        })
        .setOrigin(0.5);
      this.roomListContainer.add(noRooms);
      return;
    }

    // Render each room
    this.rooms.slice(0, 5).forEach((room, index) => {
      const y = index * 50;

      // Room background
      const bg = this.add
        .rectangle(0, y, 400, 44, 0x16213e)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(1, 0x333355);

      // Room name
      const name = this.add
        .text(-180, y, room.name, {
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5);

      // Player count
      const players = this.add
        .text(80, y, `${room.playerCount}/${room.maxPlayers} players`, {
          fontSize: '14px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5);

      // Status
      const statusColor = room.status === 'WAITING' ? '#44ff88' : '#ffaa44';
      const status = this.add
        .text(180, y, room.status, {
          fontSize: '12px',
          color: statusColor,
        })
        .setOrigin(1, 0.5);

      // Hover effect
      bg.on('pointerover', () => bg.setFillStyle(0x333355));
      bg.on('pointerout', () => bg.setFillStyle(0x16213e));

      // Click to join
      bg.on('pointerdown', () => {
        if (room.status === 'WAITING') {
          this.scene.start('LobbyScene', { roomId: room.id });
        } else {
          this.showNotice('Match already in progress');
        }
      });

      this.roomListContainer!.add([bg, name, players, status]);
    });
  }

  private showCreateRoomDialog(): void {
    // For simplicity, create room with default name
    const roomName = `Room-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    this.scene.start('LobbyScene', { createRoom: true, roomName });
  }

  private showNotice(msg: string): void {
    const { width, height } = this.scale;
    const notice = this.add
      .text(width / 2, height * 0.95, msg, {
        fontSize: '16px',
        color: '#ffdd57',
      })
      .setOrigin(0.5);

    this.time.delayedCall(2500, () => notice.destroy());
  }
}
