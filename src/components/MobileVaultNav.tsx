import { useEffect, useState } from 'react';
import type { PrimaryTab, TabId } from '../lib/vaultNavigation';

const KEYBOARD_INPUT = `:is(input:not([type]), input:is([type=text], [type=search], [type=email],
  [type=number], [type=tel], [type=url], [type=password]), textarea):not([readonly], :disabled)`;
const MIN_KEYBOARD_HEIGHT = 100;

const links = [
  { id: 'collection', label: 'Vault', icon: 'M3 8h18v12H3zM3 8l2-4h14l2 4M10 12h4v4h-4z' },
  { id: 'prices', label: 'Prices', icon: 'M4 19V5m0 14h16M8 15l4-4 3 2 5-6' },
  { id: 'add', label: 'Add', icon: 'M12 5v14M5 12h14' },
  { id: 'builder', label: 'Decks', icon: 'M7 4h11v15H7zM4 7v14h11M10 8h5m-5 4h5' },
  { id: 'meta', label: 'Intel', icon: 'M3 12a9 9 0 0 0 18 0M12 3a9 9 0 0 0-9 9m9-9a9 9 0 0 1 9 9m-9 0 6-6M8 12a4 4 0 0 0 8 0' },
] satisfies { id: PrimaryTab; label: string; icon: string }[];

export function MobileVaultNav({ tab }: { tab: TabId }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && focused.inputMode !== 'none'
        && (focused.isContentEditable || focused.matches(KEYBOARD_INPUT));
      // Normalize for pinch zoom. Small height differences can come from browser toolbars.
      const obscuredHeight = window.innerHeight - viewport.height * viewport.scale;
      setKeyboardOpen(editing && obscuredHeight >= MIN_KEYBOARD_HEIGHT);
    };

    function schedule() {
      frame ??= window.requestAnimationFrame(update);
    }

    schedule();
    viewport.addEventListener('resize', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      viewport.removeEventListener('resize', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  const active = tab === 'shared' || tab === 'upgrade' ? 'builder' : tab;
  return (
    <nav className="vault-mobile-nav" aria-label="Sections" data-keyboard-open={keyboardOpen || undefined}>
      {links.map(({ id, label, icon }) => (
        <a key={id} href={`#/${id}`} aria-current={active === id ? 'page' : undefined}>
          <span className="vault-mobile-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
          </span>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
