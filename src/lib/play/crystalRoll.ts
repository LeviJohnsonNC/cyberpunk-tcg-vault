import { createCrystalStage } from './crystalRenderer';
import type { DicePalette } from './diceMesh';

type Stage = NonNullable<ReturnType<typeof createCrystalStage>>;
interface Slot {
  canvas: HTMLCanvasElement;
  stage: Stage;
  model?: ReturnType<Stage['die']>;
  key?: string;
  busy: boolean;
  expiry?: ReturnType<typeof setTimeout>;
}

// Consecutive rolls reuse the studio and shader programs. Extra simultaneous dice use Canvas.
const slots = new Set<Slot>();
const idleLifetime = 30_000;
let retryAfter = 0;

function discard(slot: Slot) {
  if (!slots.delete(slot)) return;
  clearTimeout(slot.expiry);
  slot.canvas.remove();
  slot.model?.dispose();
  slot.stage.dispose();
}

export function acquireCrystal(type: string, result: number, palette: DicePalette) {
  const key = JSON.stringify([type, palette]);
  let slot = [...slots].find(item => !item.busy && item.key === key)
    ?? [...slots].find(item => !item.busy);
  if (!slot) {
    if (slots.size >= 2 || performance.now() < retryAfter) return;
    const canvas = document.createElement('canvas');
    const stage = createCrystalStage(canvas, true);
    if (!stage) {
      retryAfter = performance.now() + idleLifetime;
      return;
    }
    const created: Slot = { canvas, stage, busy: false };
    slot = created;
    slots.add(created);
    canvas.addEventListener('webglcontextlost', () => discard(created), { once: true });
  }
  const active = slot;
  clearTimeout(active.expiry);
  active.busy = true;
  let ready: Promise<unknown>;
  try {
    if (!active.model || key !== active.key) {
      active.model?.dispose();
      active.model = active.stage.die(type, result, palette);
      active.key = key;
    } else {
      active.model.setResult(result);
    }
    ready = active.model.prepare();
  } catch (error) {
    discard(active);
    throw error;
  }
  return {
    canvas: active.canvas,
    ready,
    render: active.model.render,
    release() {
      if (!slots.has(active) || !active.busy) return;
      active.canvas.remove();
      active.busy = false;
      active.expiry = setTimeout(() => discard(active), idleLifetime);
    },
    discard: () => discard(active),
  };
}

// Pointer and keyboard selection provide a chance to compile before the die is released.
export function warmCrystal(type: string, palette: DicePalette) {
  if ([...slots].some(slot => slot.busy)) return;
  const crystal = acquireCrystal(type, 1, palette);
  if (!crystal) return;
  crystal.release();
  void crystal.ready.catch(() => { /* A roll can still start in Canvas. */ });
}
