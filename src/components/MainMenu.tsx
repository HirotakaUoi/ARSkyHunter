/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Target, Smartphone, Volume2, VolumeX, Sparkles, Camera, ShieldAlert, Award } from 'lucide-react';
import { audio } from '../utils/audio';

interface MainMenuProps {
  onStart: (useGyros: boolean, config: { speedMultiplier: number; sensitivity: number }) => void;
}

export default function MainMenu({ onStart }: MainMenuProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [supportsOrientation, setSupportsOrientation] = useState<boolean | null>(null);

  // Difficulty & Movement settings
  const [speedVal, setSpeedVal] = useState<'slow' | 'normal' | 'fast'>('slow');
  const [sensitivityVal, setSensitivityVal] = useState<'normal' | 'high' | 'extreme'>('high');

  useEffect(() => {
    // Check high score
    const saved = localStorage.getItem('ar_shooter_highscore');
    if (saved) {
      setHighScore(parseInt(saved, 10));
    }

    // Check if orientation API might be available
    if (typeof window !== 'undefined') {
      const hasOrientation = 'DeviceOrientationEvent' in window;
      setSupportsOrientation(hasOrientation);
    }
  }, []);

  const toggleMute = () => {
    const nextVal = !isMuted;
    setIsMuted(nextVal);
    audio.setMute(nextVal);
    if (!nextVal) {
      audio.playLaser();
    }
  };

  const getMultiplierConfig = () => {
    let speedMultiplier = 0.45; // Default slower to fulfill request
    if (speedVal === 'normal') speedMultiplier = 0.9;
    if (speedVal === 'fast') speedMultiplier = 1.45;

    let sensitivity = 0.0035;
    if (sensitivityVal === 'high') sensitivity = 0.0065;
    if (sensitivityVal === 'extreme') sensitivity = 0.011;

    return { speedMultiplier, sensitivity };
  };

  const handleStartWithSensors = async () => {
    audio.playReadyChime();

    // Request device orientation permission for iOS (if applicable)
    const DeviceOrientationEventAny = window.DeviceOrientationEvent as any;
    if (DeviceOrientationEventAny && typeof DeviceOrientationEventAny.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEventAny.requestPermission();
        if (response === 'granted') {
          onStart(true, getMultiplierConfig());
        } else {
          // Fallback to screen controls
          alert('方位センサーの許可がありませんでした。画面ドラッグ（指スワイプ）操作モードで起動します。');
          onStart(false, getMultiplierConfig());
        }
      } catch (err) {
        console.warn('DeviceOrientation permission request failed:', err);
        // Fallback
        onStart(false, getMultiplierConfig());
      }
    } else {
      // Standard Android/Desktop check
      onStart(true, getMultiplierConfig());
    }
  };

  const handleStartScreenOnly = () => {
    audio.playReadyChime();
    onStart(false, getMultiplierConfig());
  };

  return (
    <div id="main-menu" className="relative w-full h-screen overflow-hidden flex flex-col justify-between items-center p-6 text-slate-100 bg-slate-950 font-sans select-none z-50">
      
      {/* Sci-Fi Background grid decorator */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,47,73,0.35)_0%,rgba(2,6,23,0.95)_90%)] pointer-events-none z-0" />
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]" 
        style={{
          backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} 
      />

      {/* Cyber scanning line */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-[bounce_5s_infinite] pointer-events-none" />

      {/* Header and Sound Toggle */}
      <div className="w-full max-w-md flex justify-between items-center z-10 pt-4">
        <div className="flex items-center gap-1 bg-sky-950/40 border border-sky-800/40 px-3 py-1.5 rounded-full text-xs font-mono text-sky-400">
          <Award className="w-4 h-4" />
          <span>SCORE LIMITS UNLOCKED</span>
        </div>
        <button
          id="toggle-sound-btn"
          onClick={toggleMute}
          className="p-3 bg-slate-900/80 border border-slate-800 rounded-full hover:bg-slate-800 text-sky-450 hover:text-sky-300 transition-all flex items-center justify-center cursor-pointer shadow-[0_0_12px_rgba(0,0,0,0.5)]"
          aria-label="Toggle Sound"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Title & Logo section */}
      <div className="text-center my-auto flex flex-col items-center max-w-sm w-full z-10 px-4">
        {/* Decorative reticle container */}
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute w-24 h-24 border border-dashed border-sky-500/40 rounded-full animate-[spin_20s_linear_infinite]" />
          <div className="absolute w-20 h-20 border border-sky-500/30 rounded-full animate-[spin_12s_linear_infinite_reverse]" />
          <div className="absolute w-28 h-28 border-2 border-transparent border-t-sky-400 border-b-sky-450 rounded-full animate-[spin_6s_linear_infinite]" />
          <div className="w-16 h-16 bg-gradient-to-tr from-sky-900/60 to-purple-900/60 rounded-full flex items-center justify-center border border-sky-400/50 shadow-[0_0_20px_rgba(56,189,248,0.3)]">
            <Target className="w-8 h-8 text-sky-400 animate-[pulse_1.5s_infinite]" />
          </div>
        </div>

        <h1 className="text-4xl font-extrabold tracking-wider bg-gradient-to-r from-sky-450 via-sky-300 to-indigo-400 bg-clip-text text-transparent font-mono mb-2">
          REALITY SLAYER
        </h1>
        <p className="text-[11px] uppercase tracking-[0.3em] font-mono text-cyan-400/80 font-bold mb-4">
          AR 360° Tactical Defiance
        </p>

        {highScore > 0 && (
          <div className="mb-6 flex items-center gap-2 bg-gradient-to-r from-teal-950/60 via-slate-900/60 to-teal-950/60 border border-teal-500/30 px-5 py-2 rounded-xl shadow-[0_0_15px_rgba(20,184,166,0.1)]">
            <span className="text-xs text-teal-400 font-mono tracking-wider font-semibold">HIGH SCORE</span>
            <span className="text-lg font-mono font-black text-teal-300">{highScore.toLocaleString()}</span>
          </div>
        )}

        {/* Dynamic Instruction Cards */}
        <div className="w-full bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.6)] backdrop-blur-md space-y-3">
          <div className="flex gap-3">
            <div className="bg-sky-500/10 p-2 rounded-lg text-sky-400 self-start">
              <Camera className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">1. カメラで現実空間を投影</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                画面の背景にiPhone/iPadの背面カメラを通した現実世界がそのまま映し出されます。
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="bg-sky-500/10 p-2 rounded-lg text-sky-400 self-start">
              <Smartphone className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">2. 360°を見回す(センサー/スワイプ)</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                iPadやiPhoneを上下左右に傾けると、現実に合わせて3Dゲーム空間が回転。ドラッグ操作でも視点移動が可能です。
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="bg-sky-500/10 p-2 rounded-lg text-rose-400 self-start">
              <Target className="w-5 h-5 flex-shrink-0 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">3. トリガー ＆ 命中シューティング</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                画面中央のレティクル（照準）を飛ぶ敵に合わせて、画面タップで撃ち落とします。敵の強烈なレーザー弾幕に注目！
              </p>
            </div>
          </div>
        </div>

        {/* Difficulty Speed and Point Sensitivity Controls */}
        <div className="w-full bg-slate-900/85 border border-slate-800 rounded-2xl p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.65)] hover:border-sky-500/30 transition-all font-mono space-y-3.5 z-10 my-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] font-bold text-slate-350">敵のスピード（難易度）</span>
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                {speedVal === 'slow' ? 'ゆっくり(超おすすめ)' : speedVal === 'normal' ? 'ふつう(標準)' : '高速(ハード)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSpeedVal('slow')}
                className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                  speedVal === 'slow'
                    ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 font-semibold shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                ゆっくり
              </button>
              <button
                type="button"
                onClick={() => setSpeedVal('normal')}
                className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                  speedVal === 'normal'
                    ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 font-semibold shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                ふつう
              </button>
              <button
                type="button"
                onClick={() => setSpeedVal('fast')}
                className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                  speedVal === 'fast'
                    ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 font-semibold shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                高速
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] font-bold text-slate-350">視点移動の感度 (スワイプ)</span>
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                {sensitivityVal === 'normal' ? '標準' : sensitivityVal === 'high' ? '強め(推奨)' : '最強(激速)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSensitivityVal('normal')}
                className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                  sensitivityVal === 'normal'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-400 font-semibold shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                標準
              </button>
              <button
                type="button"
                onClick={() => setSensitivityVal('high')}
                className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                  sensitivityVal === 'high'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-400 font-semibold shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                強め
              </button>
              <button
                type="button"
                onClick={() => setSensitivityVal('extreme')}
                className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                  sensitivityVal === 'extreme'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-400 font-semibold shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                最強
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Buttons at the bottom */}
      <div className="w-full max-w-sm flex flex-col gap-3 pb-8 z-10 px-4">
        {supportsOrientation !== false ? (
          <button
            id="start-ar-btn"
            onClick={handleStartWithSensors}
            className="w-full bg-gradient-to-r from-sky-650 via-sky-500 to-indigo-600 hover:from-sky-700 hover:to-indigo-750 text-white font-mono font-bold text-sm tracking-wider py-4 px-6 rounded-xl shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:shadow-[0_0_25px_rgba(56,189,248,0.65)] hover:scale-[1.02] transform transition-all flex items-center justify-center gap-2 border border-sky-305 cursor-pointer"
          >
            <Smartphone className="w-5 h-5" />
            <span>ARジャイロ ＆ カメラで開始</span>
          </button>
        ) : (
          <div className="w-full flex items-center gap-2 p-2.5 bg-rose-950/40 border border-rose-800/30 rounded-xl mb-1 text-rose-400 text-[10px]">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>ジャイロセンサーが非対応の可能性があります</span>
          </div>
        )}

        <button
          id="start-drag-btn"
          onClick={handleStartScreenOnly}
          className="w-full bg-slate-900 border border-slate-800/80 text-cyan-400 hover:bg-slate-800 font-mono py-3 px-6 rounded-xl hover:text-white hover:border-cyan-500 transition-all text-xs tracking-wider font-semibold cursor-pointer flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>画面ドラッグ（スワイプ）操作で開始</span>
        </button>

        <p className="text-[10px] text-center text-slate-500 font-mono">
          推奨: iOS Safari, iPadOS / Chrome (Mobile/Tablet/PC)
        </p>
      </div>

    </div>
  );
}
