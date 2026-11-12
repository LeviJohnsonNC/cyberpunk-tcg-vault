type PlayOption = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };

export function PlayOptionsMenu({ label, options }: { label: string; options: PlayOption[] }) {
  return <details className="play-more" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key !== 'Escape' || !event.currentTarget.open) return;
    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector('summary')?.focus();
  }}>
    <summary className="btn quiet" aria-label={label}>…</summary>
    <div className="play-more-actions">
      {options.map(option => <button key={option.label} type="button" className={`btn ${option.danger ? 'danger-ghost' : 'quiet'}`}
        disabled={option.disabled} onClick={event => {
          const menu = event.currentTarget.closest('details');
          if (menu) {
            menu.open = false;
            menu.querySelector('summary')?.focus();
          }
          option.onSelect();
        }}>{option.label}</button>)}
    </div>
  </details>;
}

export function PlayResetMenu({ mode, disabled, onReset }: {
  mode: 'Free Play' | 'Campaign'; disabled: boolean; onReset: () => void;
}) {
  return <PlayOptionsMenu label={`More ${mode} options`} options={[{
    label: mode === 'Campaign' ? 'Reset campaign' : 'Reset Free Play', onSelect: onReset, disabled, danger: true,
  }]} />;
}
