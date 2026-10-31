import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoundName =
  | 'claim'
  | 'attack'
  | 'victory'
  | 'defeat'
  | 'pickup'
  | 'reinforce'
  | 'notification'
  | 'countdown'
  | 'error';

export interface UseSoundReturn {
  playSound: (name: SoundName) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'landgrab_sound_enabled';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadSoundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true; // default: enabled
    return stored === 'true';
  } catch {
    return true;
  }
}

function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable – silently ignore
  }
}

// ---------------------------------------------------------------------------
// Synthesized sound effects (Web Audio API oscillators)
// ---------------------------------------------------------------------------
// Each function creates short-lived oscillator/gain nodes, schedules them,
// and lets the browser garbage-collect them after playback.
// Volume is capped at 0.3 to stay comfortable on speakers / outdoors.
// ---------------------------------------------------------------------------

function playClaim(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.setValueAtTime(400, ctx.currentTime + 0.1);

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

function playAttack(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const distortion = ctx.createWaveShaper();

  // Simple distortion curve
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = (Math.PI + 50) * x / (Math.PI + 50 * Math.abs(x));
  }
  distortion.curve = curve;
  distortion.oversample = '4x';

  osc.connect(distortion);
  distortion.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100, ctx.currentTime);

  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

function playVictory(ctx: AudioContext): void {
  const frequencies = [300, 400, 500];
  const noteDuration = 0.15;

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime + i * noteDuration;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + noteDuration);

    osc.start(start);
    osc.stop(start + noteDuration);
  });
}

function playDefeat(ctx: AudioContext): void {
  const frequencies = [400, 200];
  const noteDuration = 0.15;

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime + i * noteDuration;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + noteDuration);

    osc.start(start);
    osc.stop(start + noteDuration);
  });
}

function playPickup(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);

  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}

function playReinforce(ctx: AudioContext): void {
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime + i * 0.08; // slight gap between blips

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, start);

    gain.gain.setValueAtTime(0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.05);

    osc.start(start);
    osc.stop(start + 0.05);
  }
}

function playNotification(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  // Bell-like: use a triangle wave at 800Hz with a slow decay
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(800, ctx.currentTime);

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

function playCountdown(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'square';
  osc.frequency.setValueAtTime(1000, ctx.currentTime);

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

function playError(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, ctx.currentTime);

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

// ---------------------------------------------------------------------------
// Sound dispatcher
// ---------------------------------------------------------------------------

const SOUND_PLAYERS: Record<SoundName, (ctx: AudioContext) => void> = {
  claim: playClaim,
  attack: playAttack,
  victory: playVictory,
  defeat: playDefeat,
  pickup: playPickup,
  reinforce: playReinforce,
  notification: playNotification,
  countdown: playCountdown,
  error: playError,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSound(): UseSoundReturn {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(loadSoundEnabled);
  const ctxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);

  // Lazily create / resume the AudioContext.
  // Returns the context or null if creation failed.
  const getContext = useCallback((): AudioContext | null => {
    if (ctxRef.current) {
      // Resume if suspended (e.g. after tab backgrounding)
      if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume().catch(() => {
          // Resuming failed – nothing we can do
        });
      }
      return ctxRef.current;
    }

    try {
      ctxRef.current = new AudioContext();
      return ctxRef.current;
    } catch {
      // AudioContext unavailable – silently disable
      return null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Mobile audio unlock: create/resume AudioContext on first user gesture
  // -----------------------------------------------------------------------
  useEffect(() => {
    function unlockAudio(): void {
      if (unlockedRef.current) return;
      unlockedRef.current = true;

      const ctx = getContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {
          // Best-effort – ignore failures
        });
      }

      // Remove listeners after first successful interaction
      document.removeEventListener('click', unlockAudio, true);
      document.removeEventListener('touchstart', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
    }

    document.addEventListener('click', unlockAudio, true);
    document.addEventListener('touchstart', unlockAudio, true);
    document.addEventListener('keydown', unlockAudio, true);

    return () => {
      document.removeEventListener('click', unlockAudio, true);
      document.removeEventListener('touchstart', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
    };
  }, [getContext]);

  // -----------------------------------------------------------------------
  // Cleanup: close the AudioContext on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {
          // Ignore close errors during teardown
        });
        ctxRef.current = null;
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const playSound = useCallback(
    (name: SoundName): void => {
      if (!soundEnabled) return;

      const ctx = getContext();
      if (!ctx) return;

      try {
        SOUND_PLAYERS[name](ctx);
      } catch {
        // Playback failed – swallow to avoid breaking game flow
      }
    },
    [soundEnabled, getContext],
  );

  const setSoundEnabled = useCallback((enabled: boolean): void => {
    setSoundEnabledState(enabled);
    saveSoundEnabled(enabled);
  }, []);

  const toggleSound = useCallback((): void => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      saveSoundEnabled(next);
      return next;
    });
  }, []);

  return { playSound, soundEnabled, toggleSound, setSoundEnabled };
}
