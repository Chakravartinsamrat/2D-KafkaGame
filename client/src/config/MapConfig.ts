/**
 * Map configuration - Define obstacles and boundaries here.
 *
 * Each obstacle is a rectangle with:
 *   x, y: top-left corner position
 *   width, height: dimensions
 *
 * Players and bullets will collide with these obstacles.
 */

export interface ObstacleConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  // Optional: set to true to make obstacle visible for debugging
  debug?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD YOUR OBSTACLES HERE
// Use the coordinate display (top-right) to find positions on the map
// ═══════════════════════════════════════════════════════════════════════════

export const MAP_OBSTACLES: ObstacleConfig[] = [
  // ─── Map Edge Boundaries ─────────────────────────────────────────────────
  // Top edge
  { x: 0, y: 0, width: 1920, height: 10 },
  // Bottom edge
  { x: 0, y: 1078, width: 1920, height: 10 },
  // Left edge
  { x: 0, y: 0, width: 10, height: 1088 },
  // Right edge
  { x: 1910, y: 0, width: 10, height: 1088 },

  // ─── Example Obstacles (modify these based on your map) ──────────────────
  // Format: { x: LEFT, y: TOP, width: WIDTH, height: HEIGHT }
  {x:92, y:181, width: 130, height: 110},
  {x:344, y:100, width:110, height: 110},
  {x:370, y:76, width: 45, height: 25},
  // Example: A wall in the middle
  // { x: 900, y: 400, width: 120, height: 20 },

  // Example: A building/structure
  // { x: 300, y: 200, width: 150, height: 100 },

  // ─── Add your custom obstacles below ─────────────────────────────────────


];

// ═══════════════════════════════════════════════════════════════════════════
// SPAWN ZONES - Safe areas where players can spawn (avoid obstacles)
// ═══════════════════════════════════════════════════════════════════════════

export interface SpawnZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SPAWN_ZONES: SpawnZone[] = [
  // Default spawn zone (center of map)
  { x: 800, y: 400, width: 320, height: 288 },
];

// Set to true to show obstacle outlines (for debugging/placement)
export const DEBUG_OBSTACLES = true;
