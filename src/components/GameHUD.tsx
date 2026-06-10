/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Target, Shield, Volume2, VolumeX, Flame, LogOut, Swords, AlertOctagon } from 'lucide-react';
import { Enemy, EnemyType, GameStats } from '../types';
import { audio } from '../utils/audio';

interface GameHUDProps {
  shield: number;
  maxShield: number;
  stats: GameStats;
  enemies: Enemy[];
  playerYaw: number;
  onExit: () => void;
  bossActive: boolean;
}

export default function GameHUD({
  shield,
  maxShield,
  stats,
  enemies,
  playerYaw,
  onExit,
  bossActive,
}: GameHUDProps) {
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsMuted(audio.getMuteStatus());
  }, []);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !isMuted;
    setIsMuted(nextVal);
    audio.setMute(nextVal);
  };

  // Convert shield percentage
  const shieldPct = Math.max(0, Math.min(100, (shield / maxShield) * 100));

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-30 font-mono text-slate-100 flex flex-col justify-between p-4 select-none">
      
      {/* 1. TOP HUD STATS HEADER */}
      <div className="w-full flex justify-between items-start pointer-events-auto mt-4">
        
        {/* Left Stats Console */}
        <div className="flex flex-col gap-1 bg-slate-950/85 border border-slate-800/80 p-3 rounded-xl backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
          <div className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">SCORE</div>
          <div className="text-2xl font-black text-cyan-400 tracking-wide tabular-nums">
            {stats.score.toLocaleString()}
          </div>
          
          <div className="flex items-center gap-1.5 mt-1 border-t border-slate-900 pt-1">
            <span className="text-[9px] text-slate-500 uppercase">HIGH:</span>
            <span className="text-xs text-teal-400 font-bold tabular-nums">{stats.highScore.toLocaleString()}</span>
          </div>
        </div>

        {/* Center Alert - Boss Mode Warning */}
        {bossActive && (
          <div className="px-5 py-2 bg-rose-950/90 border border-rose-500/40 rounded-xl flex items-center gap-2 text-rose-450 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse max-w-[200px] text-center">
            <AlertOctagon className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <div className="text-left">
              <div className="text-xs font-bold leading-tight">BOSS INTRUDER</div>
              <p className="text-[9px] text-rose-400">MAINFRAME COMPROMISED</p>
            </div>
          </div>
        )}

        {/* Right Exit & Audio buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="p-2.5 bg-slate-950/85 border border-slate-800/80 rounded-xl hover:bg-slate-900 hover:border-slate-700 text-sky-400 pointer-events-auto transition-all cursor-pointer flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
            title="Mute Toggle"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          
          <button
            onClick={onExit}
            className="p-2.5 bg-slate-950/85 border border-slate-800/80 rounded-xl hover:bg-rose-950 hover:border-rose-900 text-rose-400 hover:text-rose-300 pointer-events-auto transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold shadow-[0_4px_12px_rgba(0,0,0,0.4)] text-xs"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">MENU</span>
          </button>
        </div>

      </div>

      {/* 2. DYNAMIC COMBO OVERLAY */}
      {stats.combo > 1 && (
        <div className="absolute top-24 left-4 flex items-center gap-2 bg-gradient-to-r from-amber-500/15 to-transparent border border-amber-500/30 pl-3 pr-6 py-1.5 rounded-full backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.35)] animate-[bounce_0.6s_ease]">
          <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
          <div className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
            <span>COMBO</span>
            <span className="text-sm font-bold text-white bg-amber-500 px-1.5 py-0.2 select-none border border-amber-400 rounded-md">
              x{stats.combo}
            </span>
          </div>
        </div>
      )}

      {/* 3. SHIELD GRAPH GAUGES (BOTTOM SECTION) */}
      <div className="w-full flex flex-col items-center gap-3 mt-auto mb-4">
        
        {/* Dynamic Spatial Radar Indicator */}
        <div id="ar-radar-unit" className="relative w-28 h-28 bg-slate-950/90 border border-emerald-500/25 rounded-full flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.65)] pointer-events-auto backdrop-blur-sm pr-0">
          
          {/* Radar Scanning Circles and crosshair marks */}
          <div className="absolute inset-0 rounded-full border border-dashed border-emerald-500/10 animate-[spin_40s_linear_infinite]" />
          <div className="absolute w-20 h-20 rounded-full border border-emerald-500/10" />
          <div className="absolute w-12 h-12 rounded-full border border-emerald-500/15" />
          
          {/* Direction indicator ticks */}
          <div className="absolute top-1 text-[8px] font-bold text-emerald-400/50">N</div>
          <div className="absolute bottom-1 text-[8px] font-bold text-emerald-400/50">S</div>
          <div className="absolute left-1 text-[8px] font-bold text-emerald-400/50">W</div>
          <div className="absolute right-1 text-[8px] font-bold text-emerald-400/50">E</div>

          {/* Compass cone representing player's gaze direction (fixed centered cone) */}
          <div 
            className="absolute -top-1 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-cyan-400 animate-pulse" 
            style={{ filter: 'drop-shadow(0 0 4px #00ffff)' }}
          />

          {/* Render individual relative enemy radar dots */}
          {enemies.map((enemy) => {
            const enemyYawRad = (enemy.yaw * Math.PI) / 180;
            
            // Difference relative to player's Yaw
            let relYaw = enemyYawRad - playerYaw;
            while (relYaw > Math.PI) relYaw -= Math.PI * 2;
            while (relYaw < -Math.PI) relYaw += Math.PI * 2;

            // distance mapped 0 to 50 radius limits
            const maxRadius = 45;
            const mappedRadius = Math.max(10, Math.min(maxRadius, (enemy.distance / 50) * maxRadius));
            
            // Polar to Cartesian
            const rx = Math.sin(relYaw) * mappedRadius;
            const ry = -Math.cos(relYaw) * mappedRadius; // Negative because top of circle is 12 o'clock

            // Color coordinate
            const dotColor = enemy.type === EnemyType.BOSS ? '#06b6d4' : '#ef4444';

            return (
              <div
                key={enemy.id}
                className="absolute w-2.5 h-2.5 rounded-full flex items-center justify-center animate-[ping_1.5s_infinite]"
                style={{
                  transform: `translate(${rx}px, ${ry}px)`,
                  backgroundColor: dotColor,
                  outline: '1.5px solid rgba(255, 255, 255, 0.45)',
                  boxShadow: `0 0 6px ${dotColor}`,
                  animationDuration: enemy.type === EnemyType.BOSS ? '2s' : '0.8s'
                }}
                title={`Enemy: ${enemy.type}`}
              />
            );
          })}

          {/* Target core */}
          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_4px_#38bdf8]" />
        </div>

        {/* Shield and HP Status console */}
        <div className="w-full max-w-sm bg-slate-950/85 border border-slate-800/80 p-3 rounded-2xl flex flex-col gap-2 shadow-[0_6px_20px_rgba(0,0,0,0.5)] backdrop-blur-md pointer-events-auto">
          
          {/* Header Row */}
          <div className="flex justify-between items-center text-xs px-1">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold uppercase">
              <Shield className="w-4 h-4" />
              <span>DEFENSE SHIELD</span>
            </div>
            <div className="text-slate-100 font-bold tabular-nums">
              {shield} / {maxShield}
            </div>
          </div>

          {/* Bar track */}
          <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-800 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 rounded-full flex justify-end pr-3 ${
                shieldPct > 55 
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : shieldPct > 25
                  ? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : 'bg-gradient-to-r from-red-650 to-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.85)] animate-pulse'
              }`}
              style={{ width: `${shieldPct}%` }}
            />
          </div>

          {/* Meta Info */}
          <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase font-semibold px-1 mt-0.5">
            <span>ACTIVE DEFENSE CHANNELS</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              <span>STABLE FEED</span>
            </span>
          </div>

        </div>

      </div>

    </div>
  );
}
