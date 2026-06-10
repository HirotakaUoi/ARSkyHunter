/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { Camera, CameraOff, Compass, Target, RefreshCw } from 'lucide-react';
import { Enemy, EnemyType, Projectile, Particle, GameStage } from '../types';
import { audio } from '../utils/audio';

interface CameraViewProps {
  useGyros: boolean;
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  playerYaw: number;
  playerPitch: number;
  setPlayerOrientation: (yaw: number, pitch: number) => void;
  onFire: (targetEnemyId: string | null) => void;
  shield: number;
  maxShield: number;
  score: number;
  damageFlash: boolean;
  scorePopups: { id: string; text: string; x: number; y: number; life: number }[];
  swipeSensitivity?: number;
}

export default function CameraView({
  useGyros,
  enemies,
  projectiles,
  particles,
  playerYaw,
  playerPitch,
  setPlayerOrientation,
  onFire,
  shield,
  maxShield,
  score,
  damageFlash,
  scorePopups,
  swipeSensitivity = 0.0035,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lockedEnemy, setLockedEnemy] = useState<Enemy | null>(null);
  const [gyroActive, setGyroActive] = useState<boolean>(false);

  // Field of View (in radians)
  const FOV_X = (80 * Math.PI) / 180;
  const FOV_Y = (60 * Math.PI) / 180;

  // Gyro Base Calibration values
  const gyroBaseRef = useRef({ yaw: 0, pitch: 0 });
  const isFirstGyroRef = useRef(true);

  // For screen swipe / touch movement
  const isDraggingRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const orientationStartRef = useRef({ yaw: 0, pitch: 0 });
  const totalDragRef = useRef(0);

  // Access user's camera
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Rear-facing camera
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCamera(true);
          activeStream = stream;
        }
      } catch (err: any) {
        console.warn('Camera access failed:', err);
        setCameraError(err.message || 'Camera blocked or absent');
        setHasCamera(false);
      }
    }

    setupCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Set up Device Gyro sensors
  useEffect(() => {
    if (!useGyros) return;

    function handleOrientation(event: DeviceOrientationEvent) {
      let alpha = event.alpha ?? 0; // Rotation around z-axis [0, 360]
      let beta = event.beta ?? 0;   // Left/right/front tilt [-180, 180]
      let gamma = event.gamma ?? 0; // Left/right tilt [-90, 90]

      // Detect active hardware gyro signal
      if (event.alpha !== null && event.beta !== null && (event.alpha !== 0 || event.beta !== 0)) {
        if (!gyroActive) {
          setGyroActive(true);
        }
      }

      // Map phone rotation degrees to Radians
      // In iOS vertical-standing mode, beta is tilted around 60-80 degrees.
      // We'll calibrate so initial tilt is centering (0).
      const rawYaw = (alpha * Math.PI) / 180;
      const rawPitch = (((beta - 65) * Math.PI) / 180);

      if (isFirstGyroRef.current) {
        // Calibrate home point
        gyroBaseRef.current = { yaw: rawYaw, pitch: rawPitch };
        isFirstGyroRef.current = false;
      }

      // Calculate relative gazes, scaling smooth transitions
      // INVERT both Yaw and Pitch so they correctly match camera background translation!
      // - When rotating device right (alpha or compass orientation heading decreases), camera view slides left.
      //   So playerYaw must INCREASE to make enemy diffY decrease, shifting enemy left.
      // - When tilting device up (beta decreases), camera view slides down.
      //   So playerPitch must INCREASE to make enemy diffP decrease, shifting enemy down.
      let targetYaw = -(rawYaw - gyroBaseRef.current.yaw);
      let targetPitch = -(rawPitch - gyroBaseRef.current.pitch);

      // Wrap yaw between -PI and PI
      while (targetYaw > Math.PI) targetYaw -= Math.PI * 2;
      while (targetYaw < -Math.PI) targetYaw += Math.PI * 2;

      // Keep pitch in boundaries [-80, 80] degrees
      const maxP = (80 * Math.PI) / 180;
      targetPitch = Math.max(-maxP, Math.min(maxP, targetPitch));

      // Merge orientation updates
      setPlayerOrientation(targetYaw, targetPitch);
    }

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [useGyros, setPlayerOrientation, gyroActive]);

  // Recalibrate gyroscope center
  const forceRecalibrateGaze = () => {
    isFirstGyroRef.current = true;
    audio.playCalibrated();
  };

  // Refs to hold the absolute latest values, bypassing React schedule/rendering jitter
  const latestPropsRef = useRef({
    playerYaw,
    playerPitch,
    enemies,
    projectiles,
    particles,
    lockedEnemy,
    scorePopups,
    hasCamera,
  });

  // Sync ref values instantly on every single React render pass
  latestPropsRef.current = {
    playerYaw,
    playerPitch,
    enemies,
    projectiles,
    particles,
    lockedEnemy,
    scorePopups,
    hasCamera,
  };

  // Drag controls for swipe-to-aim fallback on desktop/mouse/failed orientation
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    touchStartRef.current = { x: e.clientX, y: e.clientY };
    orientationStartRef.current = { yaw: playerYaw, pitch: playerPitch };
    totalDragRef.current = 0;
    
    // Set pointer capture to tracking dragging outside elements
    const element = e.currentTarget;
    element.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - touchStartRef.current.x;
    const deltaY = e.clientY - touchStartRef.current.y;

    // Track total cumulative movement distance
    totalDragRef.current += Math.hypot(deltaX, deltaY);

    // Update touchStartRef to latest so that delta acts relatively
    touchStartRef.current = { x: e.clientX, y: e.clientY };

    const sens = swipeSensitivity;
    const { playerYaw: curPlayerYaw, playerPitch: curPlayerPitch } = latestPropsRef.current;

    if (useGyros && gyroActive) {
      // In active Gyro mode, adjust the gyro calibration baseline dynamically!
      // This allows the user to swipe to offset their camera angle seamlessly!
      gyroBaseRef.current.yaw += deltaX * sens;
      gyroBaseRef.current.pitch += deltaY * sens;
    } else {
      // Standard relative swipe controls in swipe fallback / desktop mode
      let targetYaw = curPlayerYaw + deltaX * sens;
      let targetPitch = curPlayerPitch + deltaY * sens;

      // Wrap yaw between -PI and PI
      while (targetYaw > Math.PI) targetYaw -= Math.PI * 2;
      while (targetYaw < -Math.PI) targetYaw += Math.PI * 2;

      // Keep pitch in boundaries [-80, 80] degrees
      const maxP = (80 * Math.PI) / 180;
      targetPitch = Math.max(-maxP, Math.min(maxP, targetPitch));

      setPlayerOrientation(targetYaw, targetPitch);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Trigger weapon shoot if they barely dragged (interpreted as a click/tap to fire)
    if (totalDragRef.current < 15) {
      // Fire action! Pass locked enemy if any to verify direct hitting
      onFire(lockedEnemy ? lockedEnemy.id : null);
    }
  };

  // Canvas main rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      // Pull absolute latest state variables from synchronized refs
      const {
        playerYaw: curPlayerYaw,
        playerPitch: curPlayerPitch,
        enemies: curEnemies,
        projectiles: curProjectiles,
        particles: curParticles,
        lockedEnemy: curLockedEnemy,
        scorePopups: curScorePopups,
        hasCamera: curHasCamera,
      } = latestPropsRef.current;

      // Set adaptive dimensions (handle rotating layouts gracefully)
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Starfield & Grid Backdrop Fallback if No Camera
      if (!curHasCamera) {
        // Sky glow background gradient
        const bgGrad = ctx.createRadialGradient(
          width / 2, height / 2, 10,
          width / 2, height / 2, Math.max(width, height)
        );
        bgGrad.addColorStop(0, '#020617');
        bgGrad.addColorStop(0.5, '#050b24');
        bgGrad.addColorStop(1, '#000005');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Draw cosmic stars rotating based on player gaze
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        for (let i = 0; i < 60; i++) {
          // Generate pseudo deterministic stars based on index
          const sYaw = ((i * 11) % 360) * Math.PI / 180;
          const sPitch = ((((i * 7) % 120) - 60) * Math.PI) / 180;

          let diffY = sYaw - curPlayerYaw;
          while (diffY > Math.PI) diffY -= Math.PI * 2;
          while (diffY < -Math.PI) diffY += Math.PI * 2;

          const diffP = sPitch - curPlayerPitch;

          if (Math.abs(diffY) < FOV_X && Math.abs(diffP) < FOV_Y) {
            const sx = (width / 2) + (diffY / (FOV_X / 2)) * (width / 2);
            const sy = (height / 2) - (diffP / (FOV_Y / 2)) * (height / 2);
            const size = ((i % 3) + 1);
            
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw a technological wireframe coordinate grid
        ctx.strokeStyle = 'rgba(14, 116, 144, 0.15)';
        ctx.lineWidth = 1;
        // Horizontal lat lines
        for (let lat = -60; lat <= 60; lat += 20) {
          const latRad = (lat * Math.PI) / 180;
          const diffP = latRad - curPlayerPitch;
          if (Math.abs(diffP) < FOV_Y / 2 + 0.1) {
            const sy = (height / 2) - (diffP / (FOV_Y / 2)) * (height / 2);
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(width, sy);
            ctx.stroke();
          }
        }
        // Vertical lon lines
        for (let lon = 0; lon < 360; lon += 30) {
          const lonRad = (lon * Math.PI) / 180;
          let diffY = lonRad - curPlayerYaw;
          while (diffY > Math.PI) diffY -= Math.PI * 2;
          while (diffY < -Math.PI) diffY += Math.PI * 2;

          if (Math.abs(diffY) < FOV_X / 2 + 0.1) {
            const sx = (width / 2) + (diffY / (FOV_X / 2)) * (width / 2);
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, height);
            ctx.stroke();
          }
        }
      }

      // Check center proximity for laser locking
      let bestLocked: Enemy | null = null;
      let closestDistanceToCenter = 9999;

      // 2. Project and Render Enemies
      curEnemies.forEach((enemy) => {
        const enemyYawRad = (enemy.yaw * Math.PI) / 180;
        const enemyPitchRad = (enemy.pitch * Math.PI) / 180;

        let diffY = enemyYawRad - curPlayerYaw;
        while (diffY > Math.PI) diffY -= Math.PI * 2;
        while (diffY < -Math.PI) diffY += Math.PI * 2;

        const diffP = enemyPitchRad - curPlayerPitch;

        // Is the enemy visible inside camera FOV boundaries?
        if (Math.abs(diffY) < FOV_X / 2 + 0.15 && Math.abs(diffP) < FOV_Y / 2 + 0.15) {
          const sx = (width / 2) + (diffY / (FOV_X / 2)) * (width / 2);
          const sy = (height / 2) - (diffP / (FOV_Y / 2)) * (height / 2);

          // Deep sizing scaling
          const rawScale = 20 / enemy.distance;
          const size = Math.max(12, Math.min(65, enemy.size * rawScale * 2.2));

          // Compute distance to center reticle
          const distToCenter = Math.hypot(sx - width / 2, sy - height / 2);
          if (distToCenter < closestDistanceToCenter && distToCenter < 95) {
            closestDistanceToCenter = distToCenter;
            bestLocked = enemy;
          }

          // A. Draw LOCK-ON HUD reticle box on the enemy
          const isTargeted = bestLocked?.id === enemy.id;
          ctx.save();
          
          if (isTargeted) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // Red locks
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
          } else {
            ctx.strokeStyle = enemy.color;
            ctx.lineWidth = 1.2;
          }

          // Draw neon tracking corners
          const rSize = size + 16;
          // Top Left Corner
          ctx.beginPath();
          ctx.moveTo(sx - rSize / 2, sy - rSize / 2 + 10);
          ctx.lineTo(sx - rSize / 2, sy - rSize / 2);
          ctx.lineTo(sx - rSize / 2 + 10, sy - rSize / 2);
          ctx.stroke();

          // Top Right
          ctx.beginPath();
          ctx.moveTo(sx + rSize / 2, sy - rSize / 2 + 10);
          ctx.lineTo(sx + rSize / 2, sy - rSize / 2);
          ctx.lineTo(sx + rSize / 2 - 10, sy - rSize / 2);
          ctx.stroke();

          // Bottom Left
          ctx.beginPath();
          ctx.moveTo(sx - rSize / 2, sy + rSize / 2 - 10);
          ctx.lineTo(sx - rSize / 2, sy + rSize / 2);
          ctx.lineTo(sx - rSize / 2 + 10, sy + rSize / 2);
          ctx.stroke();

          // Bottom Right
          ctx.beginPath();
          ctx.moveTo(sx + rSize / 2, sy + rSize / 2 - 10);
          ctx.lineTo(sx + rSize / 2, sy + rSize / 2);
          ctx.lineTo(sx + rSize / 2 - 10, sy + rSize / 2);
          ctx.stroke();

          // Draw health bar overlay
          const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(sx - rSize / 2, sy - rSize / 2 - 12, rSize, 4);
          ctx.fillStyle = hpPercent > 0.4 ? 'rgba(52, 211, 153, 0.9)' : 'rgba(239, 68, 68, 0.9)';
          ctx.fillRect(sx - rSize / 2, sy - rSize / 2 - 12, rSize * hpPercent, 4);

          // Draw numerical indicators
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`DST: ${enemy.distance.toFixed(1)}m`, sx, sy - rSize / 2 - 18);

          // Name label
          const label = enemy.type === EnemyType.BOSS ? 'MOTHERSHIPS [!] BOSS' : enemy.type;
          ctx.fillText(label, sx, sy + rSize / 2 + 12);

          ctx.restore();

          // B. Draw Procedural SVGs/Vectors for the actual Enemy
          ctx.save();
          ctx.translate(sx, sy);
          ctx.shadowBlur = 12;
          ctx.shadowColor = enemy.color;

          // Add animated rotation/hovering oscillation
          const animOffset = Math.sin((Date.now() / 150) + enemy.phase) * 3;

          switch (enemy.type) {
            case EnemyType.DRONE: {
              // Neon Red Triangular fighter
              ctx.strokeStyle = enemy.color;
              ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
              ctx.lineWidth = 2.5;

              ctx.beginPath();
              ctx.moveTo(0, -size / 2 + animOffset);
              ctx.lineTo(size / 2, size / 3 + animOffset);
              ctx.lineTo(size / 8, size / 2 + animOffset);
              ctx.lineTo(-size / 8, size / 2 + animOffset);
              ctx.lineTo(-size / 2, size / 3 + animOffset);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Core reactor glow
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(0, size / 6 + animOffset, size / 6, 0, Math.PI * 2);
              ctx.fill();
              break;
            }
            case EnemyType.CRAWLER: {
              // Purple Shield hexagon
              ctx.strokeStyle = enemy.color;
              ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
              ctx.lineWidth = 3;

              ctx.beginPath();
              for (let side = 0; side < 6; side++) {
                const angle = (side * Math.PI) / 3 + (Date.now() / 1000);
                const ex = Math.cos(angle) * (size / 2);
                const ey = Math.sin(angle) * (size / 2);
                if (side === 0) ctx.moveTo(ex, ey);
                else ctx.lineTo(ex, ey);
              }
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Interconnect wing shield nodes
              ctx.fillStyle = enemy.color;
              for (let side = 0; side < 6; side++) {
                const angle = (side * Math.PI) / 3 + (Date.now() / 1000);
                const ex = Math.cos(angle) * (size / 2);
                const ey = Math.sin(angle) * (size / 2);
                ctx.beginPath();
                ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
                ctx.fill();
              }

              // Glowing weapon core
              ctx.fillStyle = '#f3e8ff';
              ctx.beginPath();
              ctx.ellipse(0, animOffset, size / 5, size / 5, 0, 0, Math.PI * 2);
              ctx.fill();
              break;
            }
            case EnemyType.PHANTOM: {
              // Double diamond gold warp-glider (stealthy flickering)
              const visible = Math.random() > 0.15; // flicker effect
              if (!visible) break;

              ctx.strokeStyle = enemy.color;
              ctx.fillStyle = 'rgba(234, 179, 8, 0.3)';
              ctx.lineWidth = 2;

              ctx.beginPath();
              ctx.moveTo(0, -size / 2 + animOffset);
              ctx.lineTo(size * 0.4, 0);
              ctx.lineTo(0, size / 2 + animOffset);
              ctx.lineTo(-size * 0.4, 0);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Lateral wing appendages
              ctx.beginPath();
              ctx.moveTo(-size * 0.4, 0);
              ctx.lineTo(-size * 0.8, size * 0.25);
              ctx.lineTo(-size * 0.4, size * 0.3);
              ctx.moveTo(size * 0.4, 0);
              ctx.lineTo(size * 0.8, size * 0.25);
              ctx.lineTo(size * 0.4, size * 0.3);
              ctx.stroke();

              // Nuclear reactor core
              const corePulse = 3 + Math.sin(Date.now() / 60) * 3;
              ctx.fillStyle = '#fef08a';
              ctx.beginPath();
              ctx.arc(0, animOffset, corePulse, 0, Math.PI * 2);
              ctx.fill();
              break;
            }
            case EnemyType.BOSS: {
              // Giant Cyan mechanical behemoth ship
              ctx.strokeStyle = enemy.color;
              ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
              ctx.lineWidth = 4;

              // Main shield saucer
              ctx.beginPath();
              ctx.ellipse(0, animOffset, size, size * 0.4, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              // Command tower upward
              ctx.beginPath();
              ctx.moveTo(-size * 0.35, -size * 0.1);
              ctx.lineTo(-size * 0.1, -size * 0.45);
              ctx.lineTo(size * 0.1, -size * 0.45);
              ctx.lineTo(size * 0.35, -size * 0.1);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Side defense wings
              ctx.beginPath();
              ctx.moveTo(-size, 0);
              ctx.lineTo(-size * 1.5, size * 0.4);
              ctx.lineTo(-size * 0.8, size * 0.5);
              ctx.moveTo(size, 0);
              ctx.lineTo(size * 1.5, size * 0.4);
              ctx.lineTo(size * 0.8, size * 0.5);
              ctx.stroke();

              // Bottom reactor nodes (flashing cyan engine thrusters)
              const flare = 4 + Math.sin(Date.now() / 40) * 4;
              ctx.fillStyle = '#67e8f9';
              ctx.beginPath();
              ctx.arc(-size * 0.5, size * 0.1 + animOffset, flare, 0, Math.PI * 2);
              ctx.arc(size * 0.5, size * 0.1 + animOffset, flare, 0, Math.PI * 2);
              ctx.arc(0, size * 0.2 + animOffset, flare * 1.3, 0, Math.PI * 2);
              ctx.fill();
              break;
            }
          }

          ctx.restore();
        }
      });

      // Update targeted enemy state
      if (lockedEnemy?.id !== bestLocked?.id) {
        setLockedEnemy(bestLocked);
        if (bestLocked) {
          // Play indicator beep locking sound
          audio.playLockBeep();
        }
      }

      // 3. Render Floating Projectiles
      curProjectiles.forEach((proj) => {
        let diffY = proj.yaw - curPlayerYaw;
        while (diffY > Math.PI) diffY -= Math.PI * 2;
        while (diffY < -Math.PI) diffY += Math.PI * 2;

        const diffP = proj.pitch - curPlayerPitch;

        // Is projectile on screen?
        if (Math.abs(diffY) < FOV_X / 2 + 0.1 && Math.abs(diffP) < FOV_Y / 2 + 0.1) {
          const sx = (width / 2) + (diffY / (FOV_X / 2)) * (width / 2);
          const sy = (height / 2) - (diffP / (FOV_Y / 2)) * (height / 2);

          // Project distance depth size
          // Starts small/large depending on sender
          let size = Math.max(2, Math.min(30, proj.size * (25 / proj.distance)));

          ctx.save();
          ctx.translate(sx, sy);
          ctx.beginPath();

          if (proj.isPlayer) {
            // High intensity fluorescent Cyan laser beam trail
            ctx.shadowBlur = 15;
            ctx.shadowColor = proj.color;
            ctx.strokeStyle = proj.color;
            ctx.lineWidth = size * 0.5;
            ctx.moveTo(0, size * 2);
            ctx.lineTo(0, -size * 2);
            ctx.stroke();
          } else {
            // Glowing orange/hot-red enemy fire spheres (getting bigger!)
            const pGrad = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size);
            pGrad.addColorStop(0, '#ffffff');
            pGrad.addColorStop(0.3, proj.color);
            pGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');
            
            ctx.fillStyle = pGrad;
            ctx.shadowBlur = size * 1.5;
            ctx.shadowColor = proj.color;
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });

      // 4. Render Particle Explosions
      curParticles.forEach((p) => {
        let diffY = p.yaw - curPlayerYaw;
        while (diffY > Math.PI) diffY -= Math.PI * 2;
        while (diffY < -Math.PI) diffY += Math.PI * 2;

        const diffP = p.pitch - curPlayerPitch;

        if (Math.abs(diffY) < FOV_X / 2 + 0.1 && Math.abs(diffP) < FOV_Y / 2 + 0.1) {
          const sx = (width / 2) + (diffY / (FOV_X / 2)) * (width / 2);
          const sy = (height / 2) - (diffP / (FOV_Y / 2)) * (height / 2);
          
          const rawScale = 20 / p.distance;
          const rSize = Math.max(1, p.size * rawScale * p.life);

          ctx.save();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.life;
          ctx.shadowBlur = rSize * 2;
          ctx.shadowColor = p.color;

          ctx.beginPath();
          ctx.arc(sx, sy, rSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // 5. Draw Target Reticle (Central crosshairs in the screen middle)
      ctx.save();
      const cx = width / 2;
      const cy = height / 2;
      const rColor = lockedEnemy ? '#ea3838' : '#22d3ee'; // Red when locked on target, Cyan otherwise
      
      ctx.strokeStyle = rColor;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = lockedEnemy ? 12 : 6;
      ctx.shadowColor = rColor;

      // Draw outer circle ticks
      ctx.beginPath();
      // Radius around 25px
      ctx.arc(cx, cy, 22, 0, Math.PI * 0.3);
      ctx.moveTo(cx, cy);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 22, Math.PI * 0.5, Math.PI * 0.8);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 22, Math.PI, Math.PI * 1.3);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 22, Math.PI * 1.5, Math.PI * 1.8);
      ctx.stroke();

      // Sharp central reticle mark
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy);
      ctx.lineTo(cx + 3, cy);
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx, cy + 3);
      ctx.stroke();

      // Hairline ticks pointing out
      const tick = 35;
      ctx.beginPath();
      // Left
      ctx.moveTo(cx - tick, cy);
      ctx.lineTo(cx - tick + 8, cy);
      // Right
      ctx.moveTo(cx + tick, cy);
      ctx.lineTo(cx + tick - 8, cy);
      // Up
      ctx.moveTo(cx, cy - tick);
      ctx.lineTo(cx, cy - tick + 8);
      // Down
      ctx.moveTo(cx, cy + tick);
      ctx.lineTo(cx, cy + tick - 8);
      ctx.stroke();

      // Draw dynamic loading ring if target locked
      if (lockedEnemy) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Ring sweeps with speed based on time
        const sweepAngle = (Date.now() / 120) % (Math.PI * 2);
        ctx.arc(cx, cy, 32, sweepAngle, sweepAngle + Math.PI * 0.5);
        ctx.stroke();
      }

      ctx.restore();

      // 6. Draw floating score damage numbers
      ctx.save();
      curScorePopups.forEach((popup) => {
        if (popup.life > 0) {
          ctx.fillStyle = 'rgba(52, 211, 153, ' + popup.life + ')';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#10b981';
          ctx.fillText(popup.text, popup.x, popup.y);
        }
      });
      ctx.restore();

      // 6.5 Draw offscreen indicators for enemies that are out of standard view scope
      curEnemies.forEach((enemy) => {
        const enemyYawRad = (enemy.yaw * Math.PI) / 180;
        const enemyPitchRad = (enemy.pitch * Math.PI) / 180;

        let diffY = enemyYawRad - curPlayerYaw;
        while (diffY > Math.PI) diffY -= Math.PI * 2;
        while (diffY < -Math.PI) diffY += Math.PI * 2;

        const diffP = enemyPitchRad - curPlayerPitch;

        const isOffscreen = Math.abs(diffY) >= (FOV_X / 2) || Math.abs(diffP) >= (FOV_Y / 2);
        if (isOffscreen) {
          // Find directional angle from visual display center
          const angle = Math.atan2(-diffP, diffY); // Screen relative coordinates: up is -Y, right is +X
          
          const margin = 26;
          const cx = width / 2;
          const cy = height / 2;

          // Project line segment onto screen edges (bounding box clamp)
          let ix = cx + Math.cos(angle) * (cx - margin);
          let iy = cy + Math.sin(angle) * (cy - margin);

          // Boundaries clamp
          ix = Math.max(margin, Math.min(width - margin, ix));
          iy = Math.max(margin, Math.min(height - margin, iy));

          // Draw custom neon navigation arrow pointer (Enlarged with robust stroke width)
          ctx.save();
          ctx.translate(ix, iy);
          ctx.rotate(angle);

          const scaleVal = 1 + Math.sin((Date.now() / 150) + enemy.phase) * 0.12;
          // Scale increased to 1.9 for better contrast visibility
          ctx.scale(scaleVal * 1.9, scaleVal * 1.9);

          ctx.strokeStyle = enemy.color;
          ctx.fillStyle = enemy.color + '66'; // semi-transparent glow fill
          ctx.lineWidth = 2.4;
          ctx.shadowBlur = 12;
          ctx.shadowColor = enemy.color;

          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-7, -6);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-7, 6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Distance and lock warning label overlay
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px monospace';
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#000000';
          
          let textX = ix;
          let textY = iy;
          let labelText = `${enemy.distance.toFixed(0)}m`;
          
          // Determine precise quadrant from center-relative screen-space angle
          // angle range: -Math.PI to Math.PI (derived from Math.atan2(-diffP, diffY))
          // Canvas coordinates: right is +, left is -, down is +Y, up is -Y.
          if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
            // Right edge (▶)
            ctx.textAlign = 'right';
            textX -= 18;
            labelText = `(${enemy.distance.toFixed(0)}m) 敵は右 ▶`;
            ctx.fillStyle = '#f87171'; // Glowing high-contrast light red
          } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
            // Bottom edge (▼)
            ctx.textAlign = 'center';
            textY -= 14;
            labelText = `▼ 敵は下 (${enemy.distance.toFixed(0)}m)`;
          } else if (angle >= -(3 * Math.PI) / 4 && angle < -Math.PI / 4) {
            // Top edge (▲)
            ctx.textAlign = 'center';
            textY += 22;
            labelText = `▲ 敵は上 (${enemy.distance.toFixed(0)}m)`;
          } else {
            // Left edge (◀)
            ctx.textAlign = 'left';
            textX += 18;
            labelText = `◀ 敵は左 (${enemy.distance.toFixed(0)}m)`;
            ctx.fillStyle = '#f87171'; // Glowing high-contrast light red
          }
          
          ctx.fillText(labelText, textX, textY);
          ctx.restore();
        }
      });

      // Overlap next animation frame for silky-smooth continuous hardware rendering (60fps)
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="camera-view-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`absolute inset-0 w-full h-full cursor-crosshair select-none z-10 overflow-hidden ${
        damageFlash ? 'ring-inset ring-[14px] ring-red-650/80 animate-pulse duration-75' : ''
      }`}
    >
      {/* 1. Underlying live Camera stream node */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover z-0 pointer-events-none transition-opacity duration-1000 ${
          hasCamera ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 2. Interactive HUD canvas layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      />

      {/* Calibration option for Gyroscopes */}
      {useGyros && (
        <button
          id="recalibrate-btn"
          onClick={(e) => {
            e.stopPropagation(); // Stop firing trigger on click
            forceRecalibrateGaze();
          }}
          className="absolute bottom-24 right-4 pointer-events-auto bg-slate-900/95 border border-cyan-500/40 p-3 rounded-full hover:bg-slate-800 text-cyan-400 active:scale-95 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center cursor-pointer z-35"
          title="ジャイロ再キャリブレーション"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      )}

      {/* Screen swipe instructions indicator */}
      {!useGyros && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-slate-950/80 border border-slate-800/80 rounded-full py-1.5 px-4 text-[10px] font-mono text-cyan-300 pointer-events-none flex items-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-30">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
          <span>画面ドラッグ（指 swipe / マウス）で 360° を見回す</span>
        </div>
      )}
    </div>
  );
}
