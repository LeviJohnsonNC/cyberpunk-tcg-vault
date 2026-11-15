import { useEffect, useRef } from 'react';
import type { FoilFinish, FoilMode } from '../lib/printingFoil';
import './printing-foil.css';

export function PrintingFoil({ finish, mode, glintOnOpen }: { finish: FoilFinish; mode: Exclude<FoilMode, 'off'>; glintOnOpen: boolean }) {
  const surface = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const foil = surface.current;
    const art = foil?.parentElement;
    if (!foil || !art || mode === 'compact') return;
    // The viewer tilts the inner surface. Measure the stationary figure to avoid drifting hit coordinates.
    const hitArea = mode === 'inspection' ? art.parentElement ?? art : art;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let point: { x: number; y: number };
    const resetLighting = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      delete art.dataset.foilActive;
      for (const property of ['--foil-x', '--foil-y', '--foil-tilt-x', '--foil-tilt-y']) art.style.removeProperty(property);
    };
    const stopGlint = () => { delete foil.dataset.foilGlint; };
    const stopMotion = () => {
      resetLighting();
      stopGlint();
    };
    const glintEnded = (event: AnimationEvent) => {
      if (event.animationName === 'printing-foil-glint') stopGlint();
    };
    const glint = mode === 'inspection' && glintOnOpen && !motion.matches && !document.hidden;
    if (glint) {
      foil.addEventListener('animationend', glintEnded);
      foil.dataset.foilGlint = '';
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || motion.matches || document.hidden) return;
      if (foil.hasAttribute('data-foil-glint')) stopGlint();
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
      if (event.pointerType !== 'mouse') resetLighting();
    };
    hitArea.addEventListener('pointerdown', resetTouch);
    hitArea.addEventListener('pointermove', move, { passive: true });
    hitArea.addEventListener('pointerleave', resetLighting);
    hitArea.addEventListener('pointercancel', resetLighting);
    document.addEventListener('visibilitychange', stopMotion);
    window.addEventListener('blur', stopMotion);
    motion.addEventListener?.('change', stopMotion);
    return () => {
      stopMotion();
      if (glint) foil.removeEventListener('animationend', glintEnded);
      hitArea.removeEventListener('pointerdown', resetTouch);
      hitArea.removeEventListener('pointermove', move);
      hitArea.removeEventListener('pointerleave', resetLighting);
      hitArea.removeEventListener('pointercancel', resetLighting);
      document.removeEventListener('visibilitychange', stopMotion);
      window.removeEventListener('blur', stopMotion);
      motion.removeEventListener?.('change', stopMotion);
    };
  }, [mode, glintOnOpen]);

  return <span ref={surface} aria-hidden="true" className="printing-foil" data-foil-mode={mode} data-foil-finish={finish}>
    <span className="printing-foil-light" />
  </span>;
}
