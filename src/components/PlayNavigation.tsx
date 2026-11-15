import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { playHref, playModes, type PlayModeId } from '../lib/playNavigation';
import './play-navigation.css';

export function PlayNavigation({ active, mode, mobile = false, onNavigate }: {
  active: boolean; mode?: PlayModeId; mobile?: boolean; onNavigate: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);

  function positionMenu() {
    const bounds = root.current?.getBoundingClientRect();
    const menu = panel.current;
    if (!bounds || !menu) return;
    const margin = 8;
    const left = Math.max(margin, Math.min(bounds.left, window.innerWidth - menu.offsetWidth - margin));
    const below = bounds.bottom + 4;
    const top = below + menu.offsetHeight <= window.innerHeight - margin ? below : Math.max(margin, bounds.top - menu.offsetHeight - 4);
    menu.style.setProperty('--play-menu-left', `${left}px`);
    menu.style.setProperty('--play-menu-top', `${top}px`);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function show() {
    clearTimeout(timer.current);
    if (panel.current && !panel.current.matches(':popover-open')) panel.current.showPopover({ source: toggle.current ?? undefined });
    positionMenu();
  }

  function close() {
    clearTimeout(timer.current);
    pinned.current = false;
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    close();
    onNavigate();
  }

  return <div ref={root} className="play-nav" data-mobile={mobile || undefined}
    onPointerEnter={event => { if (event.pointerType === 'mouse') show(); }}
    onPointerLeave={event => {
      if (event.pointerType !== 'mouse' || pinned.current || panel.current?.contains(document.activeElement)) return;
      timer.current = setTimeout(close, 160);
    }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && panel.current?.matches(':popover-open')) {
        event.preventDefault();
        event.stopPropagation();
        close();
        toggle.current?.focus();
      }
      if (event.key === 'ArrowDown' && !panel.current?.contains(event.target as Node)) {
        event.preventDefault();
        pinned.current = true;
        show();
        panel.current?.querySelector('a')?.focus();
      }
    }}>
    <a href={playHref()} className="navlink play-nav-link" aria-current={active ? 'page' : undefined} onClick={navigate}>Play</a>
    <button ref={toggle} type="button" className="play-nav-toggle" aria-label="Play modes" aria-expanded={open} aria-controls={id} popoverTarget={id}
      onClick={event => {
        event.preventDefault();
        if (pinned.current && panel.current?.matches(':popover-open')) { close(); return; }
        pinned.current = true;
        show();
      }}><span aria-hidden="true" /></button>
    <div ref={panel} id={id} popover="auto" className="play-nav-menu" onToggle={event => {
      const expanded = event.currentTarget.matches(':popover-open');
      if (!expanded) pinned.current = false;
      setOpen(expanded);
    }}>
      {playModes.map(option => <a key={option.id} data-mode={option.id} href={playHref(option.id)}
        aria-current={mode === option.id ? 'page' : undefined} onClick={navigate}>
        <span className="play-nav-mark" aria-hidden="true" />
        <span><strong>{option.label}</strong><small>{mobile && option.id === 'free' ? 'Matches on desktop' : option.detail}</small></span>
        <span className="play-nav-arrow" aria-hidden="true">↗</span>
      </a>)}
    </div>
  </div>;
}
