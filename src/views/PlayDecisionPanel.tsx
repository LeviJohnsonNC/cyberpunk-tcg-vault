import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Expands above the command bar, reserving space when the panel exceeds the upper mat. */
export function PlayDecisionPanel({ label, title, defaultOpen = false, children }: {
  label: string; title: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState<boolean>();
  const visible = open ?? defaultOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const section = panel.current;
    const command = section?.closest<HTMLElement>('.play-command');
    const table = command?.parentElement;
    if (!section || !command || !table) return;

    let reserved = 0;
    const fitPanel = () => {
      const room = command.getBoundingClientRect().top - table.getBoundingClientRect().top - reserved;
      const next = Math.max(0, Math.ceil(section.offsetHeight + 12 - room));
      if (reserved === next) return;
      reserved = next;
      command.style.marginBlockStart = `${reserved}px`;
    };
    fitPanel();
    const observer = new ResizeObserver(fitPanel);
    observer.observe(section);
    observer.observe(table);
    return () => {
      observer.disconnect();
      command.style.removeProperty('margin-block-start');
    };
  }, [visible]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  return <>
    <button ref={trigger} className="btn quiet play-decision-panel-trigger" type="button" aria-expanded={visible}
      aria-controls={id} onClick={() => {
        if (visible) close();
        else {
          setOpen(true);
          requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
        }
      }}>{label}</button>
    {visible && <section ref={panel} id={id} className="play-decision-panel" aria-labelledby={`${id}-title`} tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      }}>
      <div className="play-decision-panel-heading">
        <h4 id={`${id}-title`}>{title}</h4>
        <button type="button" className="btn quiet" aria-label={`Close ${title.toLowerCase()}`} onClick={close}>×</button>
      </div>
      <div className="play-decision-panel-body">{children}</div>
    </section>}
  </>;
}
