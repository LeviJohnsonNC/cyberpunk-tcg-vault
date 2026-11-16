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
    const rest = { x: 77, y: 34, tiltX: 0, tiltY: 0 };
    let current = { ...rest };
    let target = { ...rest };
    let lastTime = 0;
    let active = false;
    const resetLighting = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      active = false;
      current = { ...rest };
      target = { ...rest };
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
    const animate = (time: number) => {
      const amount = 1 - Math.exp(-Math.min(lastTime ? time - lastTime : 16, 64) / 65);
      lastTime = time;
      let distance = 0;
      for (const key of ['x', 'y', 'tiltX', 'tiltY'] as const) {
        current[key] += (target[key] - current[key]) * amount;
        distance = Math.max(distance, Math.abs(target[key] - current[key]));
      }
      art.style.setProperty('--foil-x', `${current.x.toFixed(2)}%`);
      art.style.setProperty('--foil-y', `${current.y.toFixed(2)}%`);
      if (mode === 'inspection') {
        art.style.setProperty('--foil-tilt-x', `${current.tiltX.toFixed(2)}deg`);
        art.style.setProperty('--foil-tilt-y', `${current.tiltY.toFixed(2)}deg`);
      }
      frame = 0;
      if (distance > .02) frame = window.requestAnimationFrame(animate);
      else {
        lastTime = 0;
        if (!active) resetLighting();
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(animate); };
    const leave = () => {
      active = false;
      target = { ...rest };
      delete art.dataset.foilActive;
      if (motion.matches || document.hidden) resetLighting();
      else schedule();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || motion.matches || document.hidden) return;
      if (foil.hasAttribute('data-foil-glint')) stopGlint();
      const bounds = hitArea.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
      active = true;
      art.dataset.foilActive = '';
      target = { x: 19 + x * 62, y: 18 + y * 48, tiltX: (0.5 - y) * 8, tiltY: (x - 0.5) * 8 };
      schedule();
    };
    const resetTouch = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') resetLighting();
    };
    hitArea.addEventListener('pointerdown', resetTouch);
    hitArea.addEventListener('pointermove', move, { passive: true });
    hitArea.addEventListener('pointerleave', leave);
    hitArea.addEventListener('pointercancel', resetLighting);
    document.addEventListener('visibilitychange', stopMotion);
    window.addEventListener('blur', stopMotion);
    motion.addEventListener?.('change', stopMotion);
    return () => {
      stopMotion();
      if (glint) foil.removeEventListener('animationend', glintEnded);
      hitArea.removeEventListener('pointerdown', resetTouch);
      hitArea.removeEventListener('pointermove', move);
      hitArea.removeEventListener('pointerleave', leave);
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
