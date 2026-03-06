import { AnyEvent, GameStateEvent } from '../types';

type MessageHandler = (event: AnyEvent | GameStateEvent) => void;

/**
 * WebSocketClient manages the connection to the Python FastAPI backend.
 * It handles reconnection and provides a simple send/subscribe API.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private playerId: string;
  private handlers: MessageHandler[] = [];
  private reconnectDelay = 2000;

  constructor(url: string, playerId: string) {
    this.url = url;
    this.playerId = playerId;
  }

  connect(): void {
    this.socket = new WebSocket(`${this.url}/${this.playerId}`);

    this.socket.onopen = () => {
      console.log(`[WS] Connected as player ${this.playerId}`);
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as AnyEvent | GameStateEvent;
        this.handlers.forEach((h) => h(data));
      } catch (err) {
        console.error('[WS] Failed to parse message', err);
      }
    };

    this.socket.onclose = () => {
      console.warn('[WS] Disconnected — reconnecting in', this.reconnectDelay, 'ms');
      setTimeout(() => this.connect(), this.reconnectDelay);
    };

    this.socket.onerror = (err) => {
      console.error('[WS] Error', err);
    };
  }

  send(data: object): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.onclose = null; // prevent reconnect loop
      this.socket.close();
      this.socket = null;
    }
  }
}
