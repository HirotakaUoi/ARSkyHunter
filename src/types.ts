/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum EnemyType {
  DRONE = 'DRONE',         // Fast, simple
  CRAWLER = 'CRAWLER',     // Heavy armor, slower
  PHANTOM = 'PHANTOM',     // Teleports, sniping
  BOSS = 'BOSS'            // Massive, spawns drones
}

export interface Enemy {
  id: string;
  type: EnemyType;
  yaw: number;             // 0 to 360 degrees (horizontal angle)
  pitch: number;           // -90 to 90 degrees (vertical angle)
  distance: number;        // Arbitrary distance metric (e.g. 5 to 50)
  maxHp: number;
  hp: number;
  speed: number;
  size: number;            // Visual size scale
  phase: number;           // Wave offset for sinus motion
  color: string;
  targetYaw: number;       // For interpolation/steering
  targetPitch: number;     // For interpolation/steering
  lastShootTime: number;   // Timestamp of last projectile
  warpTimer?: number;      // For phantom teleports
}

export interface Projectile {
  id: string;
  isPlayer: boolean;       // Player shots vs enemy shots
  yaw: number;
  pitch: number;
  distance: number;        // Starts far/close, moves toward target
  targetYaw?: number;      // Homing capability if any
  targetPitch?: number;
  speed: number;           // Distance change per frame
  size: number;
  color: string;
  damage: number;
}

export interface Particle {
  id: string;
  yaw: number;
  pitch: number;
  distance: number;
  vx: number;              // Yaw velocity
  vy: number;              // Pitch velocity
  vd: number;              // Distance velocity
  color: string;
  size: number;
  life: number;            // 1.0 down to 0.0
  decay: number;           // Decay rate per frame
}

export interface GameStats {
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  enemiesDefeated: number;
  damageTaken: number;
  shotsFired: number;
  accuracy: number;
}

export enum GameStage {
  MAIN_MENU = 'MAIN_MENU',
  CALIBRATING = 'CALIBRATING',
  PLAYING = 'PLAYING',
  GAMEOVER = 'GAMEOVER',
  SHIELDS_UP = 'SHIELDS_UP' // brief cinematic start
}
