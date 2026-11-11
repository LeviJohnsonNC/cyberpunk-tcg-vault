import { useCallback, useEffect, useRef, useState } from 'react';
import { renderCue, type TableCue } from '../lib/play/tableSound';

// The key predates the wider table sounds. Keeping it preserves each player's choice.
const preference = 'cptv.play.dice-sound.v1';

/** Table sound: dice impacts plus short cues for cards, Eddies, combat and the match result. Off until the player turns it on. */
export function useTableSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(preference) === 'on'; } catch { return false; }
  });
  const active = useRef(enabled);
  const audio = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<TableCue, AudioBuffer>());

  function unlock() {
    if (!active.current || typeof AudioContext === 'undefined') return;
    try {
      const context = audio.current ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* The table can still play silently when audio is unavailable. */ }
  }

  function toggle() {
    const next = !active.current;
    active.current = next;
    setEnabled(next);
    try { localStorage.setItem(preference, next ? 'on' : 'off'); } catch { /* Use the setting for this visit. */ }
    if (next) unlock();
    else if (audio.current?.state === 'running') void audio.current.suspend().catch(() => {});
  }

  const impact = useCallback((type: string, soft: boolean) => {
    const context = audio.current;
    if (!active.current || context?.state !== 'running') return;
    const sides = Number(type.slice(1)) || 6;
    const duration = soft ? .07 : .12;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let noise = 1759;
    for (let i = 0; i < samples.length; i++) {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const time = i / context.sampleRate;
      const thud = Math.sin(2 * Math.PI * (228 - sides * 5) * time) * Math.exp(-54 * time);
      const tap = Math.sin(2 * Math.PI * (1200 + sides * 17) * time) * Math.exp(-115 * time);
      const grain = (noise / 2147483648 - 1) * Math.exp(-138 * time);
      samples[i] = Math.min(1, time * 1800) * (.5 * thud + .28 * tap + .22 * grain);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = soft ? .065 : .15;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    return () => {
      try { source.stop(); } catch { /* This impact already ended. */ }
    };
  }, []);

  /** Plays a cue now or after a delay. Returns a way to call it off before it starts. */
  const cue = useCallback((name: TableCue, delayMs = 0) => {
    const context = audio.current;
    if (!active.current || context?.state !== 'running') return;
    let buffer = buffers.current.get(name);
    if (!buffer) {
      const samples = renderCue(name, context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      buffers.current.set(name, buffer);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startsAt = context.currentTime + Math.max(0, delayMs) / 1000;
    source.start(startsAt);
    source.onended = () => source.disconnect();
    return () => {
      if (context.state === 'closed' || context.currentTime >= startsAt) return;
      try { source.stop(); } catch { /* Already stopped. */ }
    };
  }, []);

  useEffect(() => () => {
    const context = audio.current;
    audio.current = null;
    buffers.current.clear();
    if (context) void context.close().catch(() => {});
  }, []);

  return { enabled, toggle, unlock, impact, cue };
}
