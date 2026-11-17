// Runs in the browser being measured, including stock Safari. Use real animation frames.
export async function profileDice(types: string[], launch: (type: string, pair: boolean) => void, signal: AbortSignal) {
  const samples = [];
  let gpu: string | null = null;
  for (const type of types) {
    for (const scenario of ['single', 'repeat', 'pair']) {
      if (signal.aborted || document.hidden) throw new Error('Keep this tab visible to profile rolls.');
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const previous = document.querySelector('.play-gig-roll');
      const started = performance.now();
      launch(type, scenario === 'pair');
      let last = started;
      let wasInFlight = false;
      let firstFrameMs: number | null = null;
      const renderers = new Set<string>();
      const intervals: number[] = [];
      for (;;) {
        const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
        if (signal.aborted || document.hidden) throw new Error('The profile was interrupted.');
        if (now - started > 8000) throw new Error('A roll timed out before docking.');
        const dice = [...document.querySelectorAll<HTMLElement>('.play-gig-roll')];
        if (!dice.length || dice[0] === previous) continue;
        if (firstFrameMs === null) firstFrameMs = now - started;
        if (wasInFlight) intervals.push(now - last);
        wasInFlight = dice.some(die => die.dataset.phase === 'air');
        if (wasInFlight) {
          for (const die of dice) {
            renderers.add(die.dataset.renderer ?? 'pending');
            if (!gpu && die.dataset.renderer === 'webgl') {
              const canvas = die.querySelector<HTMLCanvasElement>('.play-gig-mesh canvas:last-child');
              const gl = canvas?.getContext('webgl2');
              const info = gl?.getExtension('WEBGL_debug_renderer_info');
              if (gl) gpu = gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
            }
          }
        }
        last = now;
        if (dice.every(die => die.dataset.phase === 'docked')) break;
      }
      intervals.sort((a, b) => a - b);
      const percentile = (p: number) => intervals.length ? Math.round(intervals[Math.ceil(p * intervals.length) - 1] * 10) / 10 : null;
      samples.push({ type, scenario, renderers: [...renderers], flightIntervals: intervals.length,
        firstFrameMs: firstFrameMs === null ? null : Math.max(0, Math.round(firstFrameMs)), p50Ms: percentile(.5), p95Ms: percentile(.95),
        maxMs: percentile(1), over33ms: intervals.filter(ms => ms > 33.34).length });
    }
  }
  return { browser: navigator.userAgent, gpu, viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, samples };
}
