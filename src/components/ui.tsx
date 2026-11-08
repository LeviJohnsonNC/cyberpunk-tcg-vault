// Shared Afterlife components. See docs/design-system.md ("Component patterns").
import { useEffect, useRef, type ReactNode } from 'react';
import './ui.css';

/** The screen's poster focal point. `hero` = Price Book scale; `compact` = every other screen. */
export function Masthead({
  eyebrow,
  title,
  bang,
  sub,
  size = 'compact',
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  bang?: string;
  sub?: ReactNode;
  size?: 'hero' | 'compact';
  children?: ReactNode;
}) {
  const mark = bang ?? (size === 'hero' ? '!' : '.');
  return (
    <header className={`al-masthead al-masthead-${size}`}>
      <div className="al-masthead-text">
        <p className="al-eyebrow">
          <span className="al-eyebrow-mark" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1 className="al-title">
          {title}
          {mark && <span className="al-bang">{mark}</span>}
        </h1>
        {sub && <p className="al-subline">{sub}</p>}
      </div>
      {children && <div className="al-masthead-aside">{children}</div>}
    </header>
  );
}

export interface Metric {
  label: string;
  context?: ReactNode;
  value: ReactNode;
}

/** Cream ticket strip for a screen's headline metrics. */
export function MetricStrip({ items }: { items: Metric[] }) {
  return (
    <dl className="al-strip" data-count={items.length} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((m) => (
        <div key={m.label}>
          <dt>
            {m.label}
            {m.context != null && <span>{m.context}</span>}
          </dt>
          <dd className="al-num">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Modal confirmation built on <dialog>: native focus trapping, Esc to cancel, inert background.
 * The cancel button receives initial focus so Enter never destroys data by accident.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'accent';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancelRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`al-dialog tone-${tone}`}
      aria-labelledby="al-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel(); // backdrop click
      }}
    >
      <div className="al-dialog-body">
        <h2 id="al-dialog-title">{title}</h2>
        <div className="al-dialog-content">{children}</div>
        <div className="al-dialog-actions">
          <button ref={cancelRef} className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${tone === 'danger' ? 'danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
