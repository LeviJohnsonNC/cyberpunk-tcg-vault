import { useCallback, useEffect, useRef, useState } from 'react';
import { renderCue, type TableCue } from '../lib/play/tableSound';
import { duckMusic } from '../lib/musicSignal';
import diceRoll from '../assets/play/dice-roll.mp3';
import cardPlay from '../assets/play/card-play.mp3';
import unitKill from '../assets/play/unit-kill.mp3';

import dealMultiple from '../assets/play/deal-multiple.mp3';
import dealSingle from '../assets/play/deal-single.mp3';
import turnStart from '../assets/play/turn-start.mp3';
import eddieSale from '../assets/play/eddie-sale.mp3';
import gigStolen from '../assets/play/gig-stolen.mp3';
import matchWin from '../assets/play/match-win.mp3';
import matchLoss from '../assets/play/match-loss.mp3';

const recordings = [
  { cue: 'dice-roll', url: diceRoll, gain: 2.1 },
  { cue: 'card-play', url: cardPlay, gain: 1.4 },
  { cue: 'unit-kill', url: unitKill, gain: .65 },
  { cue: 'deal', url: dealMultiple, gain: 1.3 },
  { cue: 'draw', url: dealSingle, gain: 1.3 },
  { cue: 'turn', url: turnStart, gain: 1.3 },
  { cue: 'eddie', url: eddieSale, gain: .82 },
  { cue: 'gig-steal', url: gigStolen, gain: .7 },
  { cue: 'win', url: matchWin, gain: 1.35 },
  { cue: 'lose', url: matchLoss, gain: 1.4 },
] satisfies { cue: TableCue; url: string; gain: number }[];

async function decodeRecording(context: AudioContext, url: string) {
  try {
    const response = await fetch(url);
    return response.ok ? await context.decodeAudioData(await response.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

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
  const clips = useRef(new Map<TableCue, { gain: number; ready: Promise<AudioBuffer | undefined>; buffer?: AudioBuffer }>());
  const pending = useRef(new Set<() => void>());
  const voices = useRef(new Set<() => void>());
  const recent = useRef(new Map<string, number>());
  const serial = useRef(0);
  const duckTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  function clear() { for (const cancel of pending.current) cancel(); for (const timer of duckTimers.current) clearTimeout(timer); duckTimers.current.clear(); for (const stop of [...voices.current]) stop(); recent.current.clear(); }
  function unlock() {
    if (!active.current || typeof AudioContext === 'undefined') return;
    try {
      if (!audio.current) {
        const context = audio.current = new AudioContext();
        const gain = master.current = context.createGain(); gain.gain.value = level.current;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .16;
        gain.connect(limiter); limiter.connect(context.destination);
        for (const recording of recordings) {
          const clip: { gain: number; ready: Promise<AudioBuffer | undefined>; buffer?: AudioBuffer } = {
            gain: recording.gain, ready: decodeRecording(context, recording.url),
          };
          clips.current.set(recording.cue, clip);
          void clip.ready.then((buffer) => { clip.buffer = buffer; });
        }
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
  const play = useCallback((key: TableCue, delayMs: number, pan: number, clip?: AudioBuffer, clipGain = 1) => {
    const context = audio.current, output = master.current;
    if (!active.current || !level.current || !output || context?.state !== 'running' || document.hidden) return;
    const now = context.currentTime, startsAt = now + Math.max(0, delayMs) / 1000;
    if (Math.abs(startsAt - (recent.current.get(key) ?? -1)) < .045) return;
    recent.current.set(key, startsAt);
    while (voices.current.size >= 10) voices.current.values().next().value?.();
    let buffer = clip ?? buffers.current.get(key);
    if (!buffer) { const data = renderCue(key, context.sampleRate); buffer = context.createBuffer(1, data.length, context.sampleRate); buffer.getChannelData(0).set(data); buffers.current.set(key, buffer); }
    const source = context.createBufferSource(), gain = context.createGain(), stereo = context.createStereoPanner();
    source.buffer = buffer; source.playbackRate.value = clip ? 1 : 1 + ((serial.current++ % 5) - 2) * .012;
    gain.gain.value = clip ? clipGain : key === 'draw' ? .65 : 1; stereo.pan.value = Math.max(-.4, Math.min(.4, pan));
    source.connect(gain); gain.connect(stereo); stereo.connect(output);
    let ended = false;
    function cleanup() { if (ended) return; ended = true; voices.current.delete(stop); source.disconnect(); gain.disconnect(); stereo.disconnect(); }
    function stop() { try { source.stop(); } catch { /* Already ended. */ } cleanup(); }
    voices.current.add(stop); source.onended = cleanup; source.start(startsAt);
    return stop;
  }, []);
  const cue = useCallback((name: TableCue, delayMs = 0, pan = 0) => {
    const clip = clips.current.get(name);
    const context = audio.current;
    if (!active.current || !level.current || !context || document.hidden) return;
    function start(delay: number, buffer?: AudioBuffer) {
      const stop = play(name, delay, pan, buffer, clip?.gain);
      if (!stop) return;
      // Brief music headroom for important outcomes.
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (['hit', 'defeat', 'unit-kill', 'call', 'gig-steal', 'win', 'lose'].includes(name)) {
        timer = setTimeout(() => {
          if (timer) duckTimers.current.delete(timer);
          if (active.current && level.current && !document.hidden) duckMusic(name === 'win' || name === 'lose' ? 2.6 : .28);
        }, delay);
        duckTimers.current.add(timer);
      }
      return () => { clearTimeout(timer); if (timer) duckTimers.current.delete(timer); stop(); };
    }
    if (!clip || clip.buffer) return start(delayMs, clip?.buffer);

    const due = performance.now() + delayMs;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const cancel = () => { cancelled = true; pending.current.delete(cancel); stop?.(); };
    pending.current.add(cancel);
    void clip.ready.then((buffer) => {
      pending.current.delete(cancel);
      if (!cancelled && audio.current === context) stop = start(Math.max(0, due - performance.now()), buffer);
    });
    return cancel;
  }, [play]);
  useEffect(() => {
    const cache = buffers.current, decoded = clips.current;
    const hide = () => { if (document.hidden) clear(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); clear(); const context = audio.current; audio.current = null; master.current = null; cache.clear(); decoded.clear(); if (context) void context.close().catch(() => {}); };
  }, []);
  return { enabled, volume, changeVolume, toggle, unlock, cue };
}
