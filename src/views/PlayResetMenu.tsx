export function PlayResetMenu({ mode, disabled, onReset }: {
  mode: 'Free Play' | 'Campaign'; disabled: boolean; onReset: () => void;
}) {
  return <details className="play-more" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key !== 'Escape' || !event.currentTarget.open) return;
    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector('summary')?.focus();
  }}>
    <summary className="btn quiet" aria-label={`More ${mode} options`}>…</summary>
    <div className="play-more-actions">
      <button type="button" className="btn danger-ghost" disabled={disabled} onClick={event => {
        const menu = event.currentTarget.closest('details');
        if (menu) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
        }
        onReset();
      }}>{mode === 'Campaign' ? 'Reset campaign' : 'Reset Free Play'}</button>
    </div>
  </details>;
}
