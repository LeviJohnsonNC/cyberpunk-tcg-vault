import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { paintDie } from '../lib/play/diceMesh';
import { dicePalette } from '../lib/play/dicePalette';
import type { CrystalRenderer } from '../lib/play/crystalRenderer';
import artwork from '../assets/play/dice/crystal-d20-proof.png';
import './crystal-dice-proof.css';

type Seat = 'player' | 'rival';
function Artwork({ seat, size = 300, value = 'd20' }: { seat: Seat; size?: number; value?: string }) {
  return <span className="crystal-proof-art" data-seat={seat} style={{ '--proof-size': `${size}px` } as CSSProperties}>
    <span className="crystal-proof-crop"><img src={artwork} alt="" /></span><b>{value}</b>
  </span>;
}
function Previous({ seat }: { seat: Seat }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current!;
    paintDie(canvas.getContext('2d')!, 'd20', 20, [.16, -.13, 0], 130, 320, dicePalette(canvas, seat), true, 'd20');
  }, [seat]);
  return <canvas ref={ref} width={320} height={320} aria-label={`Previous ${seat} d20`} />;
}
function LiveCrystal({ seat, rotating, angle, size = 360 }: { seat: Seat; rotating: boolean; angle: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null), reflection = useRef<HTMLCanvasElement>(null);
  const requestDraw = useRef<() => void>(() => {});
  const latest = useRef({ rotating, angle });
  const [status, setStatus] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  useLayoutEffect(() => { latest.current = { rotating, angle }; requestDraw.current(); });
  useEffect(() => {
    const canvas = ref.current!;
    let disposed = false, frame = 0, rotation = 0, last = 0, visible = true;
    let renderer: CrystalRenderer | undefined;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const schedule = () => {
      if (disposed || !renderer || !visible || document.hidden) {
        cancelAnimationFrame(frame); frame = 0; last = 0; return;
      }
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const draw = (time: number) => {
      frame = 0;
      if (!renderer || disposed || !visible || document.hidden) { last = 0; return; }
      const elapsed = last ? Math.min(.08, (time - last) / 1000) : 0; last = time;
      const moving = latest.current.rotating && !query.matches;
      if (moving) rotation += elapsed * .45;
      const y = latest.current.angle * Math.PI / 180 + rotation;
      renderer.render([.16 + Math.sin(rotation * .7) * .12, y - .13, .02], size * .39, size);
      const mirror = reflection.current;
      if (mirror) { const ctx = mirror.getContext('2d')!; ctx.clearRect(0, 0, size, size); ctx.drawImage(canvas, 0, 0, size, size); }
      if (moving) schedule(); else last = 0;
    };
    const fallback = () => {
      if (disposed) return;
      cancelAnimationFrame(frame); frame = 0;
      renderer?.dispose(); renderer = undefined;
      setStatus('fallback');
    };
    const contextLost = (event: Event) => { event.preventDefault(); fallback(); };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); });
    observer.observe(canvas);
    requestDraw.current = schedule;
    document.addEventListener('visibilitychange', schedule);
    query.addEventListener('change', schedule);
    canvas.addEventListener('webglcontextlost', contextLost);
    void Promise.all([import('../lib/play/crystalRenderer'), document.fonts.ready]).then(([{ createCrystalRenderer }]) => {
      if (disposed) return;
      renderer = createCrystalRenderer(canvas, 'd20', 20, dicePalette(canvas, seat));
      if (!renderer) { fallback(); return; }
      setStatus('webgl'); schedule();
    }).catch(fallback);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); requestDraw.current = () => {};
      document.removeEventListener('visibilitychange', schedule); query.removeEventListener('change', schedule);
      canvas.removeEventListener('webglcontextlost', contextLost); renderer?.dispose();
    };
  }, [seat, size]);
  return <div className="crystal-proof-live" data-seat={seat} data-renderer={status} style={{ '--proof-size': `${size}px` } as CSSProperties}>
    <span className="crystal-proof-pool" />
    <canvas className="crystal-proof-reflection" ref={reflection} width={size} height={size} aria-hidden="true" />
    {status !== 'webgl' && <div className="crystal-proof-fallback" role="img" aria-label={`${seat} crystal d20, result 20`}><Artwork seat={seat} size={size} value="20" /></div>}
    <canvas ref={ref} className="crystal-proof-webgl" aria-hidden={status !== 'webgl'} aria-label={`${seat} rotating crystal d20, result 20`} />
    <small>{status === 'webgl' ? 'Live 3D material' : status === 'loading' ? 'Loading crystal' : 'Static artwork · 3D unavailable'}</small>
  </div>;
}

export function CrystalDiceProof() {
  const [rotating, setRotating] = useState(false);
  const [angle, setAngle] = useState(0);
  return <main className="crystal-proof">
    <header><p>AFTERLIFE / DICE MATERIAL STUDY</p><h1>Cut from light.</h1><span>D20 visual proof · sapphire & ruby</span></header>
    <section className="crystal-proof-comparison" aria-label="D20 artwork comparison">
      {(['player', 'rival'] as const).map(seat => <article key={seat} data-seat={seat}>
        <h2>{seat === 'player' ? 'SAPPHIRE / PLAYER' : 'RUBY / OPPONENT'}</h2>
        <div className="crystal-proof-pair"><figure><Previous seat={seat} /><figcaption>Previous</figcaption></figure>
          <figure><Artwork seat={seat} size={320} /><figcaption>New crystal artwork</figcaption></figure></div>
        <div className="crystal-proof-sizes"><span>On the board</span><Artwork seat={seat} size={44} /><Artwork seat={seat} size={56} value="20" /><Artwork seat={seat} size={80} value="20" /></div>
      </article>)}
    </section>
    <section className="crystal-proof-motion" aria-label="Live crystal material">
      <div className="crystal-proof-controls"><div><h2>Crystal in motion</h2><p>Glass, internal cuts, and moving reflections.</p></div>
        <button className="btn quiet" onClick={() => setRotating(!rotating)}>{rotating ? 'Pause rotation' : 'Rotate dice'}</button>
        <label>Inspect angle <input type="range" min="-180" max="180" value={angle} onChange={event => setAngle(Number(event.target.value))} /></label>
      </div>
      <div className="crystal-proof-live-pair"><LiveCrystal seat="player" rotating={rotating} angle={angle} /><LiveCrystal seat="rival" rotating={rotating} angle={angle} /></div>
    </section>
  </main>;
}
