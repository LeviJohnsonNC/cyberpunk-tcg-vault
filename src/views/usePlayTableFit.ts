import { useLayoutEffect, type RefObject } from 'react';

/** Measure the space below the real Vault and match headers, including at browser zoom. */
export function usePlayTableFit(tableRef: RefObject<HTMLDivElement | null>, showingResult: boolean) {
  useLayoutEffect(() => {
    const table = tableRef.current;
    const command = table?.querySelector<HTMLElement>('.play-command');
    if (!table || !command) return;

    const measure = () => {
      // Keep the budget anchored to document position when the page already has a scroll offset.
      const top = table.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(0, document.documentElement.clientHeight - Math.ceil(top) - 10);
      const commandHeight = Math.ceil(command.getBoundingClientRect().height);
      const style = table.style;
      if (style.getPropertyValue('--play-available-height') !== `${height}px`)
        style.setProperty('--play-available-height', `${height}px`);
      if (style.getPropertyValue('--play-command-used') !== `${commandHeight}px`)
        style.setProperty('--play-command-used', `${commandHeight}px`);
    };

    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(command);
    observer.observe(document.body);
    const header = table.closest('.play-direct')?.querySelector('.play-match-header');
    if (header) observer.observe(header);
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      cancelAnimationFrame(frame);
      table.style.removeProperty('--play-available-height');
      table.style.removeProperty('--play-command-used');
    };
  }, [tableRef, showingResult]);
}
