import { useEffect, useRef } from 'react';
import type { FoilMode } from '../lib/iconicFoil';
import './iconic-foil.css';

export function IconicFoil({ mode }: { mode: Exclude<FoilMode, 'off'> }) {
  const surface = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const art = surface.current?.parentElement;
    if (!art || mode === 'compact') return;
    // The viewer tilts the inner surface. Measure the stationary figure to avoid drifting hit coordinates.
    const hitArea = mode === 'inspection' ? art.parentElement ?? art : art;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let point: { x: number; y: number };
    const reset = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      delete art.dataset.foilActive;
      for (const property of ['--foil-x', '--foil-y', '--foil-tilt-x', '--foil-tilt-y']) art.style.removeProperty(property);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || motion.matches || document.hidden) return;
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const bounds = hitArea.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const x = Math.min(1, Math.max(0, (point.x - bounds.left) / bounds.width));
        const y = Math.min(1, Math.max(0, (point.y - bounds.top) / bounds.height));
        art.dataset.foilActive = '';
        art.style.setProperty('--foil-x', `${(19 + x * 62).toFixed(1)}%`);
        art.style.setProperty('--foil-y', `${(18 + y * 48).toFixed(1)}%`);
        if (mode === 'inspection') {
          art.style.setProperty('--foil-tilt-x', `${((0.5 - y) * 8).toFixed(2)}deg`);
          art.style.setProperty('--foil-tilt-y', `${((x - 0.5) * 8).toFixed(2)}deg`);
        }
      });
    };
    const resetTouch = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') reset();
    };
    hitArea.addEventListener('pointerdown', resetTouch);
    hitArea.addEventListener('pointermove', move, { passive: true });
    hitArea.addEventListener('pointerleave', reset);
    hitArea.addEventListener('pointercancel', reset);
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('blur', reset);
    motion.addEventListener?.('change', reset);
    return () => {
      reset();
      hitArea.removeEventListener('pointerdown', resetTouch);
      hitArea.removeEventListener('pointermove', move);
      hitArea.removeEventListener('pointerleave', reset);
      hitArea.removeEventListener('pointercancel', reset);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('blur', reset);
      motion.removeEventListener?.('change', reset);
    };
  }, [mode]);

  return <span ref={surface} aria-hidden="true" className="iconic-foil" data-foil-mode={mode} />;
}
