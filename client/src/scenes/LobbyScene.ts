import Phaser from 'phaser';
import { WebSocketClient } from '../network/WebSocketClient';
import { AnyEvent, Room } from '../types';

const LOCAL_PLAYER_ID = crypto.randomUUID();
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws';

/**
 * LobbyScene — room waiting area before match starts.
 * Handles room creation, joining, and match start.
 */
export class LobbyScene extends Phaser.Scene {
  private wsClient!: WebSocketClient;
  private room?: Room;
  private roomId?: string;
  private createRoom = false;
  private roomName = '';
  private playerListContainer?: Phaser.GameObjects.Container;
  private statusText?: Phaser.GameObjects.Text;
  private roomInfoText?: Phaser.GameObjects.Text;
  private startButton?: Phaser.GameObjects.Rectangle;
  private startButtonText?: Phaser.GameObjects.Text;
  private countdownText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: { roomId?: string; createRoom?: boolean; roomName?: string }): void {
    this.roomId = data.roomId;
    this.createRoom = data.createRoom ?? false;
    this.roomName = data.roomName ?? 'My Room';
    this.room = undefined;
  }

  create(): void {
    const { width, height } = this.scale;

    // Background with gradient effect
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Decorative lines
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x333355, 0.5);
    for (let i = 0; i < 20; i++) {
      gfx.lineBetween(0, i * 40, width, i * 40);
    }

    // Title panel
    const titlePanel = this.add.graphics();
    titlePanel.fillStyle(0x16213e, 0.9);
    titlePanel.fillRoundedRect(width / 2 - 200, 30, 400, 80, 12);
    titlePanel.lineStyle(2, 0xe94560);
    titlePanel.strokeRoundedRect(width / 2 - 200, 30, 400, 80, 12);

    this.add
      .text(width / 2, 55, 'GAME LOBBY', {
        fontSize: '32px',
        color: '#e94560',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Room info (will be updated)
    this.statusText = this.add
      .text(width / 2, 90, 'Connecting...', {
        fontSize: '14px',
        color: '#888899',
      })
      .setOrigin(0.5);

    // Main content panel
    const mainPanel = this.add.graphics();
    mainPanel.fillStyle(0x16213e, 0.8);
    mainPanel.fillRoundedRect(width / 2 - 220, 130, 440, 400, 12);
    mainPanel.lineStyle(1, 0x333355);
    mainPanel.strokeRoundedRect(width / 2 - 220, 130, 440, 400, 12);

    // Room info section
    this.roomInfoText = this.add
      .text(width / 2, 160, '', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Players section header
    this.add
      .text(width / 2 - 200, 200, 'PLAYERS', {
        fontSize: '14px',
        color: '#888899',
      });

    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x333355);
    divider.lineBetween(width / 2 - 200, 220, width / 2 + 200, 220);

    // Player list container
    this.playerListContainer = this.add.container(width / 2, 240);

    // Start button (only visible to host)
    this.startButton = this.add
      .rectangle(width / 2, 470, 200, 50, 0x16213e)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0x44ff88)
      .setVisible(false);

    this.startButtonText = this.add
      .text(width / 2, 470, 'START MATCH', {
        fontSize: '18px',
        color: '#44ff88',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.startButton.on('pointerover', () => {
      if (this.room && this.room.playerCount >= this.room.minPlayers) {
        this.startButton?.setFillStyle(0x44ff88);
        this.startButtonText?.setColor('#000000');
      }
    });
    this.startButton.on('pointerout', () => {
      this.startButton?.setFillStyle(0x16213e);
      this.startButtonText?.setColor('#44ff88');
    });
    this.startButton.on('pointerdown', () => this.startMatch());

    // Countdown text (for match starting)
    this.countdownText = this.add
      .text(width / 2, height / 2, '', {
        fontSize: '72px',
        color: '#e94560',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(100);

    // Leave button
    this.createButton(width / 2, 550, 'LEAVE ROOM', 0xe94560, () => {
      this.leaveRoom();
    });

    // Connect WebSocket
    this.wsClient = new WebSocketClient(WS_URL, LOCAL_PLAYER_ID);
    this.wsClient.onMessage((event) => this.handleServerEvent(event));
    this.wsClient.connect();

    // After connection, create or join room
    this.time.delayedCall(500, () => {
      if (this.createRoom) {
        this.wsClient.send({
          type: 'CREATE_ROOM',
          name: this.roomName,
          maxPlayers: 8,
        });
      } else if (this.roomId) {
        this.wsClient.send({
          type: 'JOIN_ROOM',
          roomId: this.roomId,
        });
      }
    });
  }

  private createButton(x: number, y: number, label: string, color: number, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 160, 40, 0x16213e)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, color);

    const text = this.add
      .text(x, y, label, { fontSize: '14px', color: `#${color.toString(16)}`, fontStyle: 'bold' })
      .setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(color);
      text.setColor('#000000');
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x16213e);
      text.setColor(`#${color.toString(16)}`);
    });
    bg.on('pointerdown', onClick);
    text.setDepth(1);
  }

  private handleServerEvent(event: AnyEvent): void {
    switch (event.type) {
      case 'ROOM_CREATED':
      case 'ROOM_JOINED':
        this.room = event.room;
        this.roomId = event.room.id;
        this.updateUI();
        break;

      case 'ROOM_UPDATE':
        this.room = event.room;
        this.updateUI();
        break;

      case 'PLAYER_JOINED':
        if (this.room && event.playerId) {
          if (!this.room.playerIds.includes(event.playerId)) {
            this.room.playerIds.push(event.playerId);
            this.room.playerCount = this.room.playerIds.length;
          }
          this.updateUI();
        }
        break;

      case 'PLAYER_LEFT':
        if (this.room && event.playerId) {
          this.room.playerIds = this.room.playerIds.filter((id) => id !== event.playerId);
          this.room.playerCount = this.room.playerIds.length;
          this.updateUI();
        }
        break;

      case 'MATCH_STARTED':
        this.showCountdown();
        break;

      case 'ERROR':
        this.statusText?.setText(`Error: ${event.message}`);
        this.time.delayedCall(2000, () => {
          this.wsClient.disconnect();
          this.scene.start('MenuScene');
        });
        break;
    }
  }

  private updateUI(): void {
    if (!this.room) return;

    this.statusText?.setText(`Room Code: ${this.room.id}`);
    this.roomInfoText?.setText(`${this.room.name}`);

    // Update player list
    this.playerListContainer?.removeAll(true);

    this.room.playerIds.forEach((id, i) => {
      const isHost = id === this.room!.hostId;
      const isMe = id === LOCAL_PLAYER_ID;
      const y = i * 45;

      // Player row background
      const rowBg = this.add.graphics();
      if (isMe) {
        rowBg.fillStyle(0x00ff88, 0.15);
        rowBg.fillRoundedRect(-190, y - 8, 380, 40, 6);
      }

      // Player icon
      const iconColor = isMe ? 0x00ff88 : 0xff4466;
      const icon = this.add.graphics();
      icon.fillStyle(iconColor);
      icon.fillCircle(-170, y + 12, 12);

      // Player name
      const displayName = isMe ? 'You' : `Player ${id.substring(0, 6)}`;
      const nameText = this.add.text(-150, y, displayName, {
        fontSize: '16px',
        color: isMe ? '#00ff88' : '#ffffff',
        fontStyle: isMe ? 'bold' : 'normal',
      });

      // Host badge
      if (isHost) {
        const badge = this.add.text(170, y, 'HOST', {
          fontSize: '12px',
          color: '#ffdd57',
          backgroundColor: '#333300',
          padding: { x: 6, y: 2 },
        });
        badge.setOrigin(1, 0);
        this.playerListContainer?.add(badge);
      }

      // Ready indicator
      const readyDot = this.add.graphics();
      readyDot.fillStyle(0x44ff88);
      readyDot.fillCircle(185, y + 12, 6);

      this.playerListContainer?.add([rowBg, icon, nameText, readyDot]);
    });

    // Player count
    const countText = this.add.text(0, this.room.playerIds.length * 45 + 10,
      `${this.room.playerCount}/${this.room.maxPlayers} Players`, {
        fontSize: '14px',
        color: '#888899',
      }
    );
    countText.setOrigin(0.5, 0);
    this.playerListContainer?.add(countText);

    // Show start button only to host
    const isHost = this.room.hostId === LOCAL_PLAYER_ID;
    const canStart = this.room.playerCount >= this.room.minPlayers;
    this.startButton?.setVisible(isHost);
    this.startButtonText?.setVisible(isHost);

    if (isHost && !canStart) {
      this.startButtonText?.setText(`NEED ${this.room.minPlayers} PLAYERS`);
      this.startButton?.setStrokeStyle(2, 0x666666);
      this.startButtonText?.setColor('#666666');
    } else if (isHost) {
      this.startButtonText?.setText('START MATCH');
      this.startButton?.setStrokeStyle(2, 0x44ff88);
      this.startButtonText?.setColor('#44ff88');
    }
  }

  private showCountdown(): void {
    this.countdownText?.setVisible(true);

    let count = 3;
    this.countdownText?.setText(count.toString());

    const countdown = this.time.addEvent({
      delay: 1000,
      callback: () => {
        count--;
        if (count > 0) {
          this.countdownText?.setText(count.toString());
        } else {
          this.countdownText?.setText('GO!');
          this.time.delayedCall(500, () => {
            // Transition to game scene with match ID
            this.scene.start('GameScene', {
              matchId: this.roomId,
              playerId: LOCAL_PLAYER_ID,
            });
          });
        }
      },
      repeat: 3,
    });
  }

  private startMatch(): void {
    if (!this.room || this.room.playerCount < this.room.minPlayers) {
      return;
    }
    this.wsClient.send({
      type: 'START_MATCH',
      roomId: this.roomId,
    });
  }

  private leaveRoom(): void {
    this.wsClient.send({ type: 'LEAVE_ROOM' });
    this.wsClient.disconnect();
    this.scene.start('MenuScene');
  }
}
