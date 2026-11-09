// Compact background-music player pinned bottom-left. Never autoplays: music starts only
// when the visitor presses play. Survives tab changes (hash routing never reloads the page).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PLAYLIST, type Track } from '../lib/playlist';

const KEY = 'cptv.music.track.v1';
const OPEN_KEY = 'cptv.music.open.v1';

function readIndex(n: number) {
  try {
    const i = Number(localStorage.getItem(KEY));
    return Number.isInteger(i) && i >= 0 && i < n ? i : 0;
  } catch {
    return 0;
  }
}

const Icon = {
  back: <path d="M6 5h2v14H6zM20 5v14L9 12z" />,
  fwd: <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />,
  play: <path d="M7 4l13 8-13 8z" />,
  stop: <path d="M6 6h12v12H6z" />,
  note: <path d="M9 3v11.3A3.5 3.5 0 1 0 11 17.5V8h8V3z" />,
  collapse: <path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" />,
};
const Svg = ({ d }: { d: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">{d}</svg>
);

export function MusicPlayer({ tracks = PLAYLIST, controlsContainer }: { tracks?: Track[]; controlsContainer?: HTMLElement | null }) {
  const inline = controlsContainer !== undefined;
  const audio = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(() => readIndex(tracks.length));
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  // Collapsed to a small music-note tab by default so it never covers content.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const tabRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    // Keep keyboard focus with the control the user just used (skip the first render).
    if (!moved.current) return;
    if (open) barRef.current?.querySelector<HTMLButtonElement>('.music-btn.main')?.focus();
    else tabRef.current?.focus();
  }, [open]);
  const toggle = (v: boolean) => {
    moved.current = true;
    setOpen(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };
  const track = tracks[index];
  const empty = tracks.length === 0;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(index));
    } catch {
      /* storage blocked */
    }
  }, [index]);

  // When the track changes while playing, start the new one.
  useEffect(() => {
    const a = audio.current;
    if (!a || !track) return;
    setError(false);
    a.load();
    if (playing) a.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, track?.src]);

  const play = () => {
    const a = audio.current;
    if (!a || !track) return;
    a.play().then(() => setPlaying(true)).catch(() => setError(true));
  };
  const stop = () => {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPlaying(false);
  };
  const step = (d: number) => setIndex((i) => (i + d + tracks.length) % tracks.length);

  // Lock-screen / headset controls where the browser supports them.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist ?? 'Cyberpunk TCG Vault' });
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('stop', stop);
    navigator.mediaSession.setActionHandler('pause', stop);
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  });

  const label = empty ? 'No tracks yet' : error ? `Can't play ${track.title}` : track.title;

  const audioEl = track && (
    <audio
      ref={audio}
      src={track.src}
      preload="none"
      onEnded={() => (tracks.length > 1 ? step(1) : stop())}
      onError={() => {
        setError(true);
        setPlaying(false);
      }}
    />
  );

  const view = !open && !inline ? (
      <div className={`music-tab-wrap ${playing ? 'is-playing' : ''}`}>
        <button
          ref={tabRef}
          className="music-tab"
          onClick={() => toggle(true)}
          aria-expanded={false}
          aria-controls="music-player"
          aria-label={playing ? `Open music player, playing ${track?.title ?? ''}` : 'Open music player'}
          title={playing ? `Playing: ${track?.title}` : 'Music'}
        >
          <Svg d={Icon.note} />
          {playing && <span className="music-eq" aria-hidden="true"><i /><i /><i /></span>}
        </button>
      </div>
  ) : (
    <div ref={barRef} id="music-player" className={`music${inline ? ' music-inline' : ''}${playing ? ' is-playing' : ''}`} role="region" aria-label="Music player">
      <button className="music-btn" onClick={() => step(-1)} disabled={empty || tracks.length < 2} aria-label="Previous track">
        <Svg d={Icon.back} />
      </button>
      {playing ? (
        <button className="music-btn main" onClick={stop} aria-label={`Stop ${track?.title ?? ''}`}>
          <Svg d={Icon.stop} />
        </button>
      ) : (
        <button className="music-btn main" onClick={play} disabled={empty} aria-label={empty ? 'Play (no tracks yet)' : `Play ${track.title}`}>
          <Svg d={Icon.play} />
        </button>
      )}
      <button className="music-btn" onClick={() => step(1)} disabled={empty || tracks.length < 2} aria-label="Next track">
        <Svg d={Icon.fwd} />
      </button>
      <span className="music-title" title={track ? `${track.title}${track.artist ? ` · ${track.artist}` : ''}` : undefined} aria-live="polite">
        {playing && <span className="music-eq" aria-hidden="true"><i /><i /><i /></span>}
        <span className="music-name">{label}</span>
      </span>
      {!inline && <button className="music-btn collapse" onClick={() => toggle(false)} aria-expanded={true} aria-label="Collapse music player" title="Collapse">
        <Svg d={Icon.collapse} />
      </button>}
    </div>
  );

  // The <audio> sits outside both views so expanding or collapsing never interrupts playback.
  return (
    <>
      {audioEl}
      {inline ? controlsContainer && createPortal(view, controlsContainer) : view}
    </>
  );
}
