/**
 * Event types sent over WebSocket between client and server.
 * These mirror the Pydantic models on the Python backend.
 */

export type EventType = 'MOVE' | 'SHOOT' | 'RESPAWN' | 'HIT' | 'PLAYER_DIED' | 'GAME_STATE';

export interface BaseEvent {
  type: EventType;
  playerId: string;
  timestamp: number;
}

export interface MoveEvent extends BaseEvent {
  type: 'MOVE';
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  angle: number;
}

export interface ShootEvent extends BaseEvent {
  type: 'SHOOT';
  x: number;
  y: number;
  angle: number;
}

export interface RespawnEvent extends BaseEvent {
  type: 'RESPAWN';
  x: number;
  y: number;
}

export interface HitEvent extends BaseEvent {
  type: 'HIT';
  targetId: string;
  damage: number;
}

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  kills: number;
  alive: boolean;
}

export interface GameStateEvent {
  type: 'GAME_STATE';
  players: Record<string, PlayerState>;
  timestamp: number;
}

export type AnyEvent = MoveEvent | ShootEvent | RespawnEvent | HitEvent | GameStateEvent;
