/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Target, Shield, Heart, Trophy, RefreshCw, X, Play, Zap, Flame, Award } from 'lucide-react';
import { Enemy, EnemyType, Projectile, Particle, GameStats, GameStage } from './types';
import MainMenu from './components/MainMenu';
import CameraView from './components/CameraView';
import GameHUD from './components/GameHUD';
import { audio } from './utils/audio';

// Visual field of view constants (radians)
const FOV_X = (80 * Math.PI) / 180;
const FOV_Y = (60 * Math.PI) / 180;

export default function App() {
  const [stage, setStage] = useState<GameStage>(GameStage.MAIN_MENU);
  const [useGyros, setUseGyros] = useState(false);
  const [gameConfig, setGameConfig] = useState({ speedMultiplier: 0.45, sensitivity: 0.0065 });

  // States for live rendering
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [playerOrientation, setPlayerOrientation] = useState({ yaw: 0, pitch: 0 }); // in Radians
  
  const [shield, setShield] = useState(100);
  const maxShield = 100;

  const [stats, setStats] = useState<GameStats>({
    score: 0,
    highScore: 0,
    combo: 0,
    maxCombo: 0,
    enemiesDefeated: 0,
    damageTaken: 0,
    shotsFired: 0,
    accuracy: 0,
  });

  const [wave, setWave] = useState(1);
  const [isWaveSpawning, setIsWaveSpawning] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);
  const [cameraShake, setCameraShake] = useState(false);

  // Global cooldown timer for Offscreen Return Assist AI
  const lastAssistTimeRef = useRef(Date.now() + 2000);

  // Floating score popups rendered on view coordinates
  const [scorePopups, setScorePopups] = useState<{ id: string; text: string; x: number; y: number; life: number }[]>([]);

  // Ref container for mutable loop state (prevents closing stale state values in requestAnimationFrame)
  const stateRef = useRef({
    stage,
    enemies,
    projectiles,
    particles,
    playerOrientation,
    shield,
    stats,
    wave,
    isWaveSpawning,
    scorePopups,
    gameConfig,
  });

  // Keep stateRef synced
  useEffect(() => {
    stateRef.current = {
      stage,
      enemies,
      projectiles,
      particles,
      playerOrientation,
      shield,
      stats,
      wave,
      isWaveSpawning,
      scorePopups,
      gameConfig,
    };
  }, [stage, enemies, projectiles, particles, playerOrientation, shield, stats, wave, isWaveSpawning, scorePopups, gameConfig]);

  // Load High score on mount
  useEffect(() => {
    const saved = localStorage.getItem('ar_shooter_highscore');
    if (saved) {
      setStats((prev) => ({ ...prev, highScore: parseInt(saved, 10) }));
    }
  }, []);

  // Set player orientation from CameraView trigger updates
  const updatePlayerOrientation = (yaw: number, pitch: number) => {
    setPlayerOrientation({ yaw, pitch });
  };

  // Start the Game session
  const startGame = (gyros: boolean, config: { speedMultiplier: number; sensitivity: number }) => {
    setUseGyros(gyros);
    setGameConfig(config);
    setShield(maxShield);
    setWave(1);
    setEnemies([]);
    setProjectiles([]);
    setParticles([]);
    setScorePopups([]);
    
    setStats((prev) => ({
      ...prev,
      score: 0,
      combo: 0,
      maxCombo: 0,
      enemiesDefeated: 0,
      damageTaken: 0,
      shotsFired: 0,
    }));

    setStage(GameStage.PLAYING);
    setIsWaveSpawning(true);
    triggerWaveSpawn(1, config.speedMultiplier);
  };

  // Build different Wave Configurations
  const triggerWaveSpawn = (waveNum: number, forcedSpeedMultiplier?: number) => {
    audio.playReadyChime();
    
    setTimeout(() => {
      const generatedEnemies: Enemy[] = [];
      const speedMult = forcedSpeedMultiplier ?? stateRef.current.gameConfig.speedMultiplier;
      
      // Determine configuration of enemy spawns based on Wave number
      const numEnemies = Math.min(10, 2 + waveNum);
      const isBossWave = waveNum % 5 === 0;

      if (isBossWave) {
        // Boss battle wave
        const currentYaw = (stateRef.current.playerOrientation.yaw * 180) / Math.PI;
        const currentPitch = (stateRef.current.playerOrientation.pitch * 180) / Math.PI;

        const bossYaw = (currentYaw + (Math.random() * 30 - 15) + 360) % 360;
        // Keep within very mild vertical bounds so it's always easy to find horizontally
        const bossPitch = Math.max(-10, Math.min(10, currentPitch + (Math.random() * 10 - 5)));

        generatedEnemies.push({
          id: 'boss-' + Date.now(),
          type: EnemyType.BOSS,
          yaw: bossYaw,
          pitch: bossPitch,
          distance: 40,
          maxHp: 400 + waveNum * 50,
          hp: 400 + waveNum * 50,
          speed: 0.15 * speedMult,
          size: 26,
          phase: Math.random() * 10,
          color: '#22d3ee', // Glowing Cyan
          targetYaw: Math.random() * 360,
          targetPitch: Math.random() * 20 - 10, // Max 10 deg pitch up/down
          lastShootTime: Date.now() + 1000,
        });

        // Add 2 escort drones
        for (let i = 0; i < 2; i++) {
          generatedEnemies.push(createProceduralEnemy(EnemyType.DRONE, waveNum, speedMult));
        }
      } else {
        // Normal Wave
        for (let i = 0; i < numEnemies; i++) {
          let type = EnemyType.DRONE;
          
          if (waveNum >= 2 && Math.random() > 0.6) {
            type = EnemyType.CRAWLER;
          }
          if (waveNum >= 3 && Math.random() > 0.75) {
            type = EnemyType.PHANTOM;
          }

          generatedEnemies.push(createProceduralEnemy(type, waveNum, speedMult));
        }
      }

      setEnemies(generatedEnemies);
      setIsWaveSpawning(false);
    }, 2200);
  };

  const createProceduralEnemy = (type: EnemyType, waveNum: number, forcedSpeedMultiplier?: number): Enemy => {
    const mult = forcedSpeedMultiplier ?? stateRef.current.gameConfig.speedMultiplier;
    let hp = 40 + waveNum * 10;
    let speed = (0.25 + waveNum * 0.05) * mult;
    let size = 12;
    let color = '#ef4444'; // default red drone

    if (type === EnemyType.CRAWLER) {
      hp = 90 + waveNum * 15;
      speed = (0.12 + waveNum * 0.02) * mult;
      size = 18;
      color = '#a855f7'; // purple crawler
    } else if (type === EnemyType.PHANTOM) {
      hp = 60 + waveNum * 12;
      speed = (0.35 + waveNum * 0.04) * mult;
      size = 14;
      color = '#eab308'; // gold phantom
    }

    // Determine coordinate spawns based on player orientation to guarantee swift search
    const currentYaw = (stateRef.current.playerOrientation.yaw * 180) / Math.PI;
    const currentPitch = (stateRef.current.playerOrientation.pitch * 180) / Math.PI;

    const roll = Math.random();
    let spawnYaw = 0;
    let spawnPitch = 0;

    if (roll < 0.65) {
      // 65% spawn right in front
      spawnYaw = currentYaw + (Math.random() * 60 - 30);
      spawnPitch = currentPitch + (Math.random() * 10 - 5);
    } else if (roll < 0.85) {
      // 20% span peripheral sectors
      spawnYaw = currentYaw + (Math.random() * 140 - 70);
      spawnPitch = currentPitch + (Math.random() * 16 - 8);
    } else {
      // 15% spawn behind (keeping the 360-degree gameplay loop)
      spawnYaw = currentYaw + 180 + (Math.random() * 80 - 40);
      spawnPitch = currentPitch + (Math.random() * 16 - 8);
    }

    // Normalization adjustments with extremely mild pitch constraints so it's always visible horizontally
    const finalYaw = (spawnYaw % 360 + 360) % 360;
    const finalPitch = Math.max(-12, Math.min(12, spawnPitch));

    return {
      id: `${type}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      yaw: finalYaw,
      pitch: finalPitch,
      distance: 35 + Math.random() * 15, // starts far away
      maxHp: hp,
      hp: hp,
      speed: speed,
      size: size,
      phase: Math.random() * 20,
      color: color,
      targetYaw: Math.random() * 360,
      targetPitch: Math.random() * 20 - 10, // -10 to 10 degrees range
      lastShootTime: Date.now() + Math.random() * 3000,
      warpTimer: type === EnemyType.PHANTOM ? Date.now() + 4000 : undefined,
    };
  };

  // Spawn visual score text popups on impact coordinate
  const spawnScorePopup = (text: string, yaw: number, pitch: number) => {
    // Project relative coordinate of popup onto central viewport
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Relative position conversion
    let diffY = yaw - stateRef.current.playerOrientation.yaw;
    while (diffY > Math.PI) diffY -= Math.PI * 2;
    while (diffY < -Math.PI) diffY += Math.PI * 2;

    const diffP = pitch - stateRef.current.playerOrientation.pitch;

    const sx = (width / 2) + (diffY / (FOV_X / 2)) * (width / 2);
    const sy = (height / 2) - (diffP / (FOV_Y / 2)) * (height / 2);

    const newPopup = {
      id: Math.random().toString(),
      text,
      x: sx,
      y: sy - 30, // slightly above target
      life: 1.0,
    };

    setScorePopups((prev) => [...prev, newPopup]);
  };

  // Add neon spark burst effects
  const spawnExplosionSparks = (yaw: number, pitch: number, distance: number, color: string, count = 12) => {
    const newSparks: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      
      newSparks.push({
        id: Math.random().toString(),
        yaw: yaw,
        pitch: pitch,
        distance,
        vx: Math.cos(angle) * speed * 0.01,
        vy: Math.sin(angle) * speed * 0.01,
        vd: (Math.random() - 0.5) * 0.2,
        color: color,
        size: 2 + Math.random() * 5,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
    setParticles((prev) => [...prev, ...newSparks]);
  };

  // Player Trigger Shot (Tap/Fire event)
  const handlePlayerFire = (lockedEnemyId: string | null) => {
    if (stage !== GameStage.PLAYING) return;

    audio.playLaser();
    
    setStats((prev) => ({ ...prev, shotsFired: prev.shotsFired + 1 }));

    // Instant Hitcheck
    if (lockedEnemyId) {
      const targetedEnemy = enemies.find((e) => e.id === lockedEnemyId);
      if (targetedEnemy) {
        // Hit successfully!
        setTimeout(() => {
          audio.playHit();
        }, 50);

        const damage = 25; // Player weapon power
        const newHp = Math.max(0, targetedEnemy.hp - damage);

        // Update enemies list state
        setEnemies((prev) =>
          prev.map((e) => (e.id === targetedEnemy.id ? { ...e, hp: newHp } : e))
        );

        // Floating hit particle sparks
        const enemyYawRad = (targetedEnemy.yaw * Math.PI) / 180;
        const enemyPitchRad = (targetedEnemy.pitch * Math.PI) / 180;
        spawnExplosionSparks(enemyYawRad, enemyPitchRad, targetedEnemy.distance, '#ffffff', 4);
        spawnExplosionSparks(enemyYawRad, enemyPitchRad, targetedEnemy.distance, targetedEnemy.color, 8);
        
        spawnScorePopup(`-${damage}`, enemyYawRad, enemyPitchRad);

        // Accuracy combo adjustment
        setStats((prev) => ({
          ...prev,
          combo: prev.combo + 1,
          maxCombo: Math.max(prev.maxCombo, prev.combo + 1),
        }));

        if (newHp <= 0) {
          // Enemy slain!
          setEnemies((prev) => prev.filter((e) => e.id !== targetedEnemy.id));
          audio.playExplosion(targetedEnemy.type === EnemyType.BOSS);

          // Spawn large firework spark ring
          spawnExplosionSparks(enemyYawRad, enemyPitchRad, targetedEnemy.distance, targetedEnemy.color, 25);

          // Calculate score added
          let baseReward = 150;
          if (targetedEnemy.type === EnemyType.CRAWLER) baseReward = 300;
          if (targetedEnemy.type === EnemyType.PHANTOM) baseReward = 500;
          if (targetedEnemy.type === EnemyType.BOSS) baseReward = 2500;

          // Multiply based on multiplier combo status
          const currentCombo = stats.combo;
          const comboMult = currentCombo > 1 ? currentCombo : 1;
          const finalScore = baseReward * comboMult;

          setStats((prev) => {
            const nextScore = prev.score + finalScore;
            // Update high score instantly
            if (nextScore > prev.highScore) {
              localStorage.setItem('ar_shooter_highscore', nextScore.toString());
            }
            return {
              ...prev,
              score: nextScore,
              highScore: Math.max(prev.highScore, nextScore),
              enemiesDefeated: prev.enemiesDefeated + 1,
            };
          });

          spawnScorePopup(`+${finalScore.toLocaleString()} (COMBO x${comboMult})`, enemyYawRad, enemyPitchRad);
        }
      }
    } else {
      // Missed shot! Reset combo count
      setStats((prev) => ({ ...prev, combo: 0 }));
    }
  };

  // Main real-time ticker / game loop
  useEffect(() => {
    let animId: number;

    const gameLoopTick = () => {
      const { stage, enemies, projectiles, particles, playerOrientation, shield, stats, wave, isWaveSpawning, scorePopups } = stateRef.current;

      if (stage !== GameStage.PLAYING) {
        animId = requestAnimationFrame(gameLoopTick);
        return;
      }

      // A. SPARK PARTICLES TICK
      const updatedParticles = particles
        .map((p) => ({
          ...p,
          yaw: p.yaw + p.vx,
          pitch: p.pitch + p.vy,
          distance: p.distance + p.vd,
          life: p.life - p.decay,
        }))
        .filter((p) => p.life > 0);

      // B. FLOATING POPUPS ANIMATION TICK
      const updatedPopups = scorePopups
        .map((pop) => ({
          ...pop,
          y: pop.y - 1.2, // FLOAT UPWARDS
          life: pop.life - 0.025,
        }))
        .filter((pop) => pop.life > 0);

      // C. ENEMY BULLETS PROJECTILE MOVEMENT TICK
      const remainingProjectiles: Projectile[] = [];
      let shieldDamageAmount = 0;

      projectiles.forEach((proj) => {
        // Enemy physical shots move closer to player screen (distance down to 0)
        const nextDist = proj.distance - proj.speed;
        
        if (nextDist <= 1.5) {
          // Bullets reached player proximity, calculate if hits screen view boundaries
          let relYaw = proj.yaw - playerOrientation.yaw;
          while (relYaw > Math.PI) relYaw -= Math.PI * 2;
          while (relYaw < -Math.PI) relYaw += Math.PI * 2;

          const relPitch = proj.pitch - playerOrientation.pitch;

          const toleranceX = FOV_X / 3;
          const toleranceY = FOV_Y / 3;

          if (Math.abs(relYaw) < toleranceX && Math.abs(relPitch) < toleranceY) {
            // Firing hit player lens!
            shieldDamageAmount += proj.damage;
          }
        } else {
          remainingProjectiles.push({
            ...proj,
            distance: nextDist,
          });
        }
      });

      // Handle Shield and Damage flashes
      if (shieldDamageAmount > 0) {
        audio.playShieldDamage();
        setDamageFlash(true);
        setTimeout(() => setDamageFlash(false), 180);

        setShield((prevShield) => {
          const nextShield = Math.max(0, prevShield - shieldDamageAmount);
          if (nextShield <= 0) {
            // Trigger Death
            setStage(GameStage.GAMEOVER);
            audio.playGameOver();
          }
          return nextShield;
        });

        // Break combo count
        setStats((prev) => ({
          ...prev,
          combo: 0,
          damageTaken: prev.damageTaken + shieldDamageAmount,
        }));
      }

      // D. ENEMY PHYSICAL POSITION STEERING TICK & WEAPON FIRE
      const updatedEnemies = enemies.map((enemy) => {
        let eyYaw = enemy.yaw;
        let eyPitch = enemy.pitch;
        let eyDistance = enemy.distance;

        // Compute angle difference to player's center view (Reticle field of view)
        let diffYRad = (enemy.yaw * Math.PI) / 180 - playerOrientation.yaw;
        while (diffYRad > Math.PI) diffYRad -= Math.PI * 2;
        while (diffYRad < -Math.PI) diffYRad += Math.PI * 2;
        const diffYDeg = (diffYRad * 180) / Math.PI;

        const diffPDeg = enemy.pitch - (playerOrientation.pitch * 180 / Math.PI);
        const degToReticle = Math.hypot(diffYDeg, diffPDeg);

        // Aim Assist: If player is aiming close to this target (within generous 16 degrees), slow down movement
        const isFocused = degToReticle < 16.0;
        const slowFactor = isFocused ? 0.12 : 1.0; // 88% speed dampening on target when focused
        const isOffscreen = Math.abs(diffYDeg) > 28 || Math.abs(diffPDeg) > 20;

        // Smoothly steer enemy towards they target positions
        const yawDistance = enemy.targetYaw - eyYaw;
        const pitchDistance = enemy.targetPitch - eyPitch;

        // Micro adjustments with slowFactor integrated
        let finalYaw = eyYaw + Math.sign(yawDistance) * enemy.speed * slowFactor * (0.8 + Math.sin(Date.now() / 300) * 0.4);
        let finalPitch = eyPitch + Math.sign(pitchDistance) * enemy.speed * slowFactor * 0.5;

        // Wobbling wave
        finalPitch += Math.sin((Date.now() / 250) + enemy.phase) * 0.15;

        // Cycle warp timers for Phantom stealth fighters
        let nextWarpTimer = enemy.warpTimer;
        if (enemy.type === EnemyType.PHANTOM && nextWarpTimer && Date.now() > nextWarpTimer) {
          // Phantom warp randomly near the visual bounds only if player isn't actively locking them down
          if (!isFocused) {
            const currentYaw = (playerOrientation.yaw * 180) / Math.PI;
            const currentPitch = (playerOrientation.pitch * 180) / Math.PI;
            
            finalYaw = (currentYaw + (Math.random() * 60 - 30) + 360) % 360;
            finalPitch = Math.max(-10, Math.min(10, currentPitch + (Math.random() * 12 - 6)));
            eyDistance = 35 + Math.random() * 15;
            nextWarpTimer = Date.now() + 5000 + Math.random() * 2000;
            audio.playLockBeep(); // indicator warps
          }
        }

        // Steer distance closer (to lock player focus!)
        let nextDist = eyDistance;
        if (eyDistance > 9) {
          // Also slow down approach when focused so they don't crash into the player screen while focused
          nextDist -= (0.05 + (wave * 0.005)) * (isFocused ? 0.25 : 1.0);
        } else {
          // Strafe left/right when already near (slowed down when focused)
          finalYaw += Math.sin(Date.now() / 600) * 0.4 * (isFocused ? 0.15 : 1.0);
        }

        // Enemy weapons tracking loop and trigger firing
        let updatedLastShoot = enemy.lastShootTime;
        const isBoss = enemy.type === EnemyType.BOSS;
        const cooldown = isBoss ? 1400 : 2600 - Math.min(1000, wave * 100);

        if (Date.now() > enemy.lastShootTime + cooldown) {
          audio.playEnemyShoot();
          updatedLastShoot = Date.now();

          // Spawn an enemy projectile headed towards the player's view direction
          const radiansYaw = (finalYaw * Math.PI) / 180;
          const radiansPitch = (finalPitch * Math.PI) / 180;

          const projDmg = isBoss ? 20 : 12;
          const projColor = isBoss ? '#67e8f9' : '#f97316'; // Cyan vs orange

          // Scaled laser speed for slower response setups
          const bulletSpeedFactor = 0.5 + stateRef.current.gameConfig.speedMultiplier * 0.5;
          const laserSpeed = (0.35 + (wave * 0.02)) * bulletSpeedFactor;

          remainingProjectiles.push({
            id: Math.random().toString(),
            isPlayer: false,
            yaw: radiansYaw,
            pitch: radiansPitch,
            distance: nextDist,
            speed: laserSpeed, // Bullet fly speed
            size: isBoss ? 8 : 4.5,
            color: projColor,
            damage: projDmg,
          });
        }

        // Check random re-orienting coordinates steering
        let nextTargetYaw = enemy.targetYaw;
        let nextTargetPitch = enemy.targetPitch;
        
        // Direction change ONLY when not under active player crosshair focus
        if (!isFocused) {
          // Intermittent Return Assist: Limit pulling helper to offscreen targets to at most once per 6.5 seconds.
          // This keeps standard non-guided spatial orientation exploration active and prevents cluster crowding.
          if (isOffscreen && (Date.now() - lastAssistTimeRef.current > 6500) && Math.random() < 0.03) {
            lastAssistTimeRef.current = Date.now();
            const currentYawDeg = (playerOrientation.yaw * 180) / Math.PI;
            const currentPitchDeg = (playerOrientation.pitch * 180) / Math.PI;
            nextTargetYaw = (currentYawDeg + (Math.random() * 40 - 20) + 360) % 360;
            nextTargetPitch = Math.max(-10, Math.min(10, currentPitchDeg + (Math.random() * 10 - 5)));
          } else if (Math.random() < 0.005) {
            const currentYaw = (playerOrientation.yaw * 180) / Math.PI;
            const currentPitch = (playerOrientation.pitch * 180) / Math.PI;

            // Float naturally instead of crazy sudden 180-degree turn, keep vertically easy
            nextTargetYaw = (currentYaw + (Math.random() * 80 - 40) + 360) % 360;
            nextTargetPitch = Math.max(-10, Math.min(10, currentPitch + (Math.random() * 16 - 8)));
          }
        }

        return {
          ...enemy,
          yaw: (finalYaw + 360) % 360,
          pitch: Math.max(-12, Math.min(12, finalPitch)), // Hard limit enemy pitch strictly between -12 and 12 deg
          distance: nextDist,
          lastShootTime: updatedLastShoot,
          warpTimer: nextWarpTimer,
          targetYaw: nextTargetYaw,
          targetPitch: nextTargetPitch,
        };
      });

      // E. SPANNING NEXT WAVE CHECK
      // If no enemies remain and not in transition spawning wave
      if (updatedEnemies.length === 0 && !isWaveSpawning) {
        setIsWaveSpawning(true);
        const nextWave = wave + 1;
        setWave(nextWave);
        triggerWaveSpawn(nextWave);
      }

      // F. SET STATES ONCE PER FRAME TO REMAIN SMOOTH OUTSIDE RE-RENDERING
      setEnemies(updatedEnemies);
      setProjectiles(remainingProjectiles);
      setParticles(updatedParticles);
      setScorePopups(updatedPopups);

      animId = requestAnimationFrame(gameLoopTick);
    };

    animId = requestAnimationFrame(gameLoopTick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Exit from active game back to main menu
  const exitGameToMenu = () => {
    setStage(GameStage.MAIN_MENU);
    setEnemies([]);
    setProjectiles([]);
    setParticles([]);
  };

  const isBossActive = enemies.some((e) => e.type === EnemyType.BOSS);

  return (
    <div className="w-full h-screen overflow-hidden bg-black select-none relative">
      
      {/* Dynamic Camera view & interactive target project layer */}
      {stage === GameStage.PLAYING && (
        <>
          <CameraView
            useGyros={useGyros}
            enemies={enemies}
            projectiles={projectiles}
            particles={particles}
            playerYaw={playerOrientation.yaw}
            playerPitch={playerOrientation.pitch}
            setPlayerOrientation={updatePlayerOrientation}
            onFire={handlePlayerFire}
            shield={shield}
            maxShield={maxShield}
            score={stats.score}
            damageFlash={damageFlash}
            scorePopups={scorePopups}
            swipeSensitivity={gameConfig.sensitivity}
          />
          
          <GameHUD
            shield={shield}
            maxShield={maxShield}
            stats={stats}
            enemies={enemies}
            playerYaw={playerOrientation.yaw}
            onExit={exitGameToMenu}
            bossActive={isBossActive}
          />
        </>
      )}

      {/* Main menu selector logic */}
      {stage === GameStage.MAIN_MENU && (
        <MainMenu onStart={startGame} />
      )}

      {/* Game Over Screen */}
      {stage === GameStage.GAMEOVER && (
        <div className="absolute inset-0 z-50 flex flex-col justify-center items-center p-6 bg-slate-950/95 text-slate-100 select-none text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(153,27,27,0.3)_0%,rgba(2,6,23,0.95)_90%)] pointer-events-none z-0" />
          
          <div className="w-20 h-20 bg-rose-950/60 border border-rose-500/50 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse z-10">
            <Shield className="w-10 h-10 text-rose-500" />
          </div>

          <h2 className="text-4xl font-black tracking-wider text-rose-500 uppercase font-mono mb-2 z-10">
            SHIELD COMPROMISED
          </h2>
          <p className="text-xs uppercase tracking-[0.2em] font-mono text-slate-500 mb-6 z-10">
            SYSTEM CRASHED — DEFENSE OFFLINE
          </p>

          {/* Score Stats Summary Box */}
          <div className="max-w-xs w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5 mb-8 text-left space-y-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-10 font-mono">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 uppercase font-semibold">FINAL SCORE</span>
              <span className="text-lg font-black text-cyan-400 tabular-nums">{stats.score.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-2.5">
              <span className="text-slate-500 uppercase font-semibold">ENEMIES SLAIN</span>
              <span className="text-sm font-bold text-white tabular-nums">{stats.enemiesDefeated}</span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-2.5">
              <span className="text-slate-500 uppercase font-semibold">MAX COMBOS</span>
              <span className="text-sm font-bold text-amber-400 tabular-nums">x{stats.maxCombo}</span>
            </div>

            {stats.score === stats.highScore && stats.score > 0 && (
              <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-lg text-emerald-400 text-xs font-bold leading-tight select-none">
                <Trophy className="w-4 h-4 flex-shrink-0" />
                <span>NEW PERSONAL HIGH SCORE RECORDED!</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs z-10">
            <button
              onClick={() => startGame(useGyros, gameConfig)}
              className="w-full bg-gradient-to-r from-rose-650 to-red-550 hover:from-rose-700 hover:to-red-650 text-white font-mono font-bold text-sm tracking-wider py-4 px-6 rounded-xl hover:scale-[1.02] transform transition-all flex items-center justify-center gap-2 border border-red-405 shadow-[0_0_20px_rgba(239,68,68,0.45)] cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: '6s' }} />
              <span>RESTART DEFIANCE</span>
            </button>

            <button
              onClick={exitGameToMenu}
              className="w-full bg-slate-900 border border-slate-800 text-slate-350 hover:bg-slate-800 hover:text-white font-mono py-3 px-6 rounded-xl transition-all text-xs tracking-wider cursor-pointer font-bold"
            >
              RETURN TO MENU
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
