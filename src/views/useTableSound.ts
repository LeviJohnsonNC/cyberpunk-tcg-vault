import { useCallback, useEffect, useRef, useState } from 'react';
import { renderCue, renderDice, type TableCue } from '../lib/play/tableSound';
import { duckMusic } from '../lib/musicSignal';
const preference = 'cptv.play.dice-sound.v1', volumeKey = 'cptv.play.sound-volume.v1';
function read(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Session only. */ } }

/** Small, bounded voices. No sound until a gesture unlocks the context; explicit mute is always respected. */
export function useTableSound() {
  const [enabled, setEnabled] = useState(() => read(preference, 'on') !== 'off');
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, Number(read(volumeKey, '.45')) || 0)));
  const active = useRef(enabled), level = useRef(volume);
  const audio = useRef<AudioContext | null>(null), master = useRef<GainNode | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const voices = useRef(new Set<() => void>());
  const recent = useRef(new Map<string, number>());
  const serial = useRef(0);
  const duckTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  function clear() { for (const timer of duckTimers.current) clearTimeout(timer); duckTimers.current.clear(); for (const stop of [...voices.current]) stop(); recent.current.clear(); }
  function unlock() {
    if (!active.current || typeof AudioContext === 'undefined') return;
    try {
      if (!audio.current) {
        const context = audio.current = new AudioContext();
        const gain = master.current = context.createGain(); gain.gain.value = level.current;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .16;
        gain.connect(limiter); limiter.connect(context.destination);
      }
      if (audio.current.state === 'suspended') void audio.current.resume().catch(() => {});
    } catch { /* Silent play remains available. */ }
  }
  function toggle() {
    const next = !active.current; active.current = next; setEnabled(next); save(preference, next ? 'on' : 'off');
    if (next) unlock(); else { clear(); if (audio.current?.state === 'running') void audio.current.suspend().catch(() => {}); }
  }
  function changeVolume(value: number) {
    const next = Math.min(1, Math.max(0, value)); level.current = next; setVolume(next); save(volumeKey, String(next));
    if (audio.current && master.current) master.current.gain.setTargetAtTime(next, audio.current.currentTime, .025);
    if (!next) clear();
  }
  const play = useCallback((key: string, samples: (rate: number) => Float32Array, delayMs: number, pan: number, weight = 1) => {
    const context = audio.current, output = master.current;
    if (!active.current || !level.current || !output || context?.state !== 'running' || document.hidden) return;
    const now = context.currentTime, startsAt = now + Math.max(0, delayMs) / 1000;
    if (Math.abs(startsAt - (recent.current.get(key) ?? -1)) < .045) return;
    recent.current.set(key, startsAt);
    while (voices.current.size >= 10) voices.current.values().next().value?.();
    let buffer = buffers.current.get(key);
    if (!buffer) { const data = samples(context.sampleRate); buffer = context.createBuffer(1, data.length, context.sampleRate); buffer.getChannelData(0).set(data); buffers.current.set(key, buffer); }
    const source = context.createBufferSource(), gain = context.createGain(), stereo = context.createStereoPanner();
    source.buffer = buffer; source.playbackRate.value = 1 + ((serial.current++ % 5) - 2) * .012;
    gain.gain.value = weight; stereo.pan.value = Math.max(-.4, Math.min(.4, pan));
    source.connect(gain); gain.connect(stereo); stereo.connect(output);
    let ended = false;
    function cleanup() { if (ended) return; ended = true; voices.current.delete(stop); source.disconnect(); gain.disconnect(); stereo.disconnect(); }
    function stop() { try { source.stop(); } catch { /* Already ended. */ } cleanup(); }
    voices.current.add(stop); source.onended = cleanup; source.start(startsAt);
    return stop;
  }, []);
  const impact = useCallback((type: string, soft: boolean, launch = false) => play(`die:${type}:${soft}:${launch}`, (rate) => renderDice(type, soft, launch, rate), 0, 0), [play]);
  const cue = useCallback((name: TableCue, delayMs = 0, pan = 0) => {
    const stop = play(name, (rate) => renderCue(name, rate), delayMs, pan, name === 'draw' ? .65 : 1);
    // Brief music headroom for important outcomes, never a pump on every click or draw.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (stop && ['hit', 'defeat', 'call', 'win', 'lose'].includes(name)) { timer = setTimeout(() => { if (timer) duckTimers.current.delete(timer); if (active.current && level.current && !document.hidden) duckMusic(name === 'win' ? .8 : .28); }, delayMs); duckTimers.current.add(timer); }
    return stop ? () => { clearTimeout(timer); if (timer) duckTimers.current.delete(timer); stop(); } : undefined;
  }, [play]);
  useEffect(() => {
    const cache = buffers.current;
    const hide = () => { if (document.hidden) clear(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); clear(); const context = audio.current; audio.current = null; master.current = null; cache.clear(); if (context) void context.close().catch(() => {}); };
  }, []);
  return { enabled, volume, changeVolume, toggle, unlock, impact, cue };
}
