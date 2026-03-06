/**
 * Event types sent over WebSocket between client and server.
 * These mirror the Pydantic models on the Python backend.
 */

// All event types
export type EventType =
  | 'MOVE'
  | 'SHOOT'
  | 'RESPAWN'
  | 'HIT'
  | 'PLAYER_DIED'
  | 'PLAYER_KILLED'
  | 'GAME_STATE'
  // Match lifecycle
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'MATCH_STARTED'
  | 'MATCH_ENDED'
  // Room management responses
  | 'ROOM_CREATED'
  | 'ROOM_JOINED'
  | 'ROOM_LEFT'
  | 'ROOM_UPDATE'
  | 'ROOM_LIST'
  | 'ERROR';

export interface BaseEvent {
  type: EventType;
  playerId?: string;
  matchId?: string;
  timestamp?: number;
}

// ── Gameplay events ──────────────────────────────────────────────────────────

export interface MoveEvent extends BaseEvent {
  type: 'MOVE';
  playerId: string;
  seq: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  angle: number;
}

export interface ShootEvent extends BaseEvent {
  type: 'SHOOT';
  playerId: string;
  x: number;
  y: number;
  angle: number;
}

export interface RespawnEvent extends BaseEvent {
  type: 'RESPAWN';
  playerId: string;
  x: number;
  y: number;
}

export interface HitEvent extends BaseEvent {
  type: 'HIT';
  playerId: string;
  targetId: string;
  damage: number;
}

export interface PlayerKilledEvent extends BaseEvent {
  type: 'PLAYER_KILLED';
  playerId: string;
  killedBy?: string;
  killerKillCount: number;
}

// ── Match lifecycle events ───────────────────────────────────────────────────

export interface PlayerJoinedEvent extends BaseEvent {
  type: 'PLAYER_JOINED';
  playerId: string;
  playerName?: string;
}

export interface PlayerLeftEvent extends BaseEvent {
  type: 'PLAYER_LEFT';
  playerId: string;
  reason: string;
}

export interface MatchStartedEvent extends BaseEvent {
  type: 'MATCH_STARTED';
  playerIds: string[];
  hostId: string;
}

export interface MatchEndedEvent extends BaseEvent {
  type: 'MATCH_ENDED';
  playerIds: string[];
  winnerId?: string;
  scores: Record<string, number>;
  durationMs: number;
}

// ── Room types ───────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  name: string;
  hostId: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'ENDED';
  playerIds: string[];
  playerCount: number;
  maxPlayers: number;
  minPlayers: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface RoomCreatedEvent extends BaseEvent {
  type: 'ROOM_CREATED';
  room: Room;
}

export interface RoomJoinedEvent extends BaseEvent {
  type: 'ROOM_JOINED';
  room: Room;
}

export interface RoomLeftEvent extends BaseEvent {
  type: 'ROOM_LEFT';
}

export interface RoomUpdateEvent extends BaseEvent {
  type: 'ROOM_UPDATE';
  room: Room;
}

export interface RoomListEvent extends BaseEvent {
  type: 'ROOM_LIST';
  rooms: Room[];
}

export interface ErrorEvent extends BaseEvent {
  type: 'ERROR';
  message: string;
}

// ── Game state ───────────────────────────────────────────────────────────────

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  kills: number;
  alive: boolean;
  lastProcessedSeq: number;
}

export interface GameStateEvent {
  type: 'GAME_STATE';
  matchId?: string;
  players: Record<string, PlayerState>;
  timestamp: number;
}

// ── Union type for all events ────────────────────────────────────────────────

export type AnyEvent =
  | MoveEvent
  | ShootEvent
  | RespawnEvent
  | HitEvent
  | PlayerKilledEvent
  | GameStateEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | MatchStartedEvent
  | MatchEndedEvent
  | RoomCreatedEvent
  | RoomJoinedEvent
  | RoomLeftEvent
  | RoomUpdateEvent
  | RoomListEvent
  | ErrorEvent;
