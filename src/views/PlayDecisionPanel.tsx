import { useId, useRef, useState, type ReactNode } from 'react';

/** Expands above the command bar while leaving the mat and its controls in place. */
export function PlayDecisionPanel({ label, title, defaultOpen = false, children }: {
  label: string; title: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState<boolean>();
  const visible = open ?? defaultOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
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
