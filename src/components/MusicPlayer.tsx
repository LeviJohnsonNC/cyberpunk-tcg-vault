import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PLAYLIST, type Track } from '../lib/playlist';
import { connectMusic, setRoomMotion, subscribeMusic } from '../lib/musicSignal';
import './music-player.css';

function read(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Optional preferences. */ } }
const KEY = 'cptv.music.track.v1', OPEN = 'cptv.music.open.v1', VOLUME = 'cptv.music.volume.v1', ROOM = 'cptv.music.room.v1';
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const paths = {
  previous: 'M6 5h2v14H6zM20 5v14L9 12z', next: 'M16 5h2v14h-2zM4 5l11 7-11 7z',
  play: 'M7 4l13 8-13 8z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z', close: 'M6 11h12v2H6z',
};
const Icon = ({ name }: { name: keyof typeof paths }) => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d={paths[name]} /></svg>;
function Spectrum() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => subscribeMusic((signal) => {
    ref.current?.querySelectorAll<HTMLElement>('i').forEach((bar, i) => { bar.style.transform = `scaleY(${.12 + signal.bands[i] * .88})`; });
  }), []);
  return <span className="radio-spectrum" ref={ref} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</span>;
}

export function MusicPlayer({ tracks = PLAYLIST, controlsContainer }: { tracks?: Track[]; controlsContainer?: HTMLElement | null }) {
  const inline = controlsContainer !== undefined;
  const audio = useRef<HTMLAudioElement>(null);
  const graph = useRef<ReturnType<typeof connectMusic> | null>(null);
  const wantPlay = useRef(false);
  const request = useRef(0);
  const [index, setIndex] = useState(() => Math.max(0, Number(read(KEY, '0')) || 0));
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(() => read(OPEN, '0') === '1');
  const [volume, setVolume] = useState(() => Math.min(1, Math.max(0, Number(read(VOLUME, '.45')) || 0)));
  const [room, setRoom] = useState(() => read(ROOM, 'on') !== 'off');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const tabRef = useRef<HTMLButtonElement>(null), barRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const safeIndex = Number.isInteger(index) && tracks.length ? index % tracks.length : 0;
  const track = tracks[safeIndex];
  useEffect(() => { if (audio.current) audio.current.volume = volume; save(VOLUME, String(volume)); }, [volume]);
  useEffect(() => { setRoomMotion(room); save(ROOM, room ? 'on' : 'off'); }, [room]);
  useEffect(() => {
    if (!moved.current) return;
    if (open) barRef.current?.querySelector<HTMLButtonElement>('.radio-main')?.focus(); else tabRef.current?.focus();
  }, [open]);
  function expand(value: boolean) { moved.current = true; setOpen(value); save(OPEN, value ? '1' : '0'); }
  function start() {
    const el = audio.current;
    if (!el || !track) return;
    const id = ++request.current;
    wantPlay.current = true; setError(false); setLoading(true);
    // Keep ordinary HTML audio as the fallback if Web Audio is unavailable.
    try { if (!graph.current && typeof AudioContext !== 'undefined') graph.current = connectMusic(el); } catch { /* Music still works without room analysis. */ }
    void (graph.current?.resume() ?? Promise.resolve()).then(() => el.play()).catch((e: unknown) => {
      if (id !== request.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError(true); setLoading(false); setPlaying(false); wantPlay.current = false;
    });
  }
  function pause() { request.current++; wantPlay.current = false; audio.current?.pause(); setPlaying(false); setLoading(false); }
  function step(delta: number) { if (tracks.length > 1) setIndex((i) => (i + delta + tracks.length) % tracks.length); }
  useEffect(() => {
    save(KEY, String(safeIndex)); setPosition(0); setDuration(0); setError(false);
    if (wantPlay.current) start();
    // Track changes preserve the user's explicit playback intent, not a transient pause during loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.src]);
  useEffect(() => () => { request.current++; graph.current?.dispose(); graph.current = null; }, []);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist ?? 'Afterhours Radio · Cyberpunk Vault' });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const handlers = { play: start, pause, stop: pause, previoustrack: () => step(-1), nexttrack: () => step(1) };
    for (const [action, handler] of Object.entries(handlers)) try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler); } catch { /* Some mobile browsers expose only part of Media Session. */ }
    return () => { for (const action of Object.keys(handlers)) try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null); } catch { /* Unsupported. */ } };
  });
  const status = error ? 'Signal lost · tap play to retry' : !track ? 'No tracks loaded' : loading ? 'Tuning in…' : playing ? 'On air' : 'Off air';
  const view = !open && !inline ? <div className="radio-dock" data-playing={playing}>
    <button ref={tabRef} className="radio-tab" onClick={() => expand(true)} aria-expanded={false} aria-controls="music-player" aria-label={`Open music player${playing ? `, playing ${track?.title}` : ''}`}><Spectrum /><span>Afterhours <b>Radio</b></span><i className="radio-led" /></button>
  </div> : <div ref={barRef} id="music-player" className={`afterhours-radio${inline ? ' radio-inline' : ''}`} data-playing={playing} role="region" aria-label="Music player" onKeyDown={(e) => { if (e.key === 'Escape' && !inline) { e.stopPropagation(); expand(false); } }}>
    <header className="radio-header"><span>AF / <b>AFTERHOURS RADIO</b></span>{!inline && <button className="radio-button radio-collapse" onClick={() => expand(false)} aria-label="Collapse music player" aria-expanded={true}><Icon name="close" /></button>}</header>
    <div className="radio-display"><div><span className="radio-status" role="status"><i className="radio-led" />{status}</span><strong>{track?.title ?? 'The frequency is yours'}</strong><small>Night City sessions <span>{String(safeIndex + 1).padStart(2, '0')} / {String(tracks.length).padStart(2, '0')}</span></small></div><Spectrum /></div>
    <div className="radio-timeline"><span>{time(position)}</span><input type="range" aria-label="Track position" min="0" max={duration || 1} step="1" value={Math.min(position, duration || 1)} disabled={!duration} onChange={(e) => { const seconds = Number(e.target.value); if (audio.current) audio.current.currentTime = seconds; setPosition(seconds); }} /><span>{time(duration)}</span></div>
    <div className="radio-transport"><button className="radio-button" onClick={() => step(-1)} disabled={tracks.length < 2} aria-label="Previous track"><Icon name="previous" /></button><button className="radio-button radio-main" onClick={playing || loading ? pause : start} disabled={!track} aria-label={`${playing || loading ? 'Pause' : 'Play'} ${track?.title ?? 'music'}`}><Icon name={playing || loading ? 'pause' : 'play'} /></button><button className="radio-button" onClick={() => step(1)} disabled={tracks.length < 2} aria-label="Next track"><Icon name="next" /></button><label className="radio-volume">VOL<input aria-label="Music volume" type="range" min="0" max="1" step=".01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /><output>{Math.round(volume * 100)}</output></label></div>
    <footer className="radio-footer"><span>Music-reactive play room</span><button className="radio-room" aria-pressed={room} onClick={() => setRoom(!room)}>Room motion <b>{room ? 'On' : 'Off'}</b></button></footer>
  </div>;
  return <>{track && <audio ref={audio} src={track.src} preload="none" onPlaying={() => { setPlaying(true); setLoading(false); setError(false); }} onPause={() => setPlaying(false)} onWaiting={() => setLoading(wantPlay.current)} onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onEnded={() => { if (tracks.length > 1) step(1); else pause(); }} onError={() => { setError(true); setPlaying(false); setLoading(false); wantPlay.current = false; }} />}{inline ? controlsContainer && createPortal(view, controlsContainer) : view}</>;
}
