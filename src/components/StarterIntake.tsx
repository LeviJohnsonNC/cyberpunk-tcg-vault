// One-click intake for the physical retail starter decks.
import { useRef, useState } from 'react';
import { ConfirmDialog } from './ui';
import { CardImg, Pip } from './bits';
import { PENDING_DECK_KEY } from './VaultBuilds';
import { BY_SLUG } from '../lib/data';
import { newId, useStore } from '../lib/store';
import { EDITIONS, looksAlreadyLogged, starterAsDeck, starterCardCount, starterEntries, STARTERS, type StarterDeck, type StarterEdition } from '../lib/starters';

export interface StarterAdded {
  starter: StarterDeck;
  edition: StarterEdition;
}

export function StarterIntake({ onAdded, compact = false }: { onAdded: (a: StarterAdded) => void; compact?: boolean }) {
  const { entries, addMany, demo, exitDemo } = useStore();
  const [pending, setPending] = useState<StarterDeck | null>(null);
  const [edition, setEdition] = useState<StarterEdition>('retail');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false); // guards double-clicks and retries racing the same add

  const dup = pending ? looksAlreadyLogged(entries, pending, edition) : false;

  const confirm = async () => {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    const ok = await addMany(starterEntries(pending, edition), 'add');
    setBusy(false);
    lock.current = false;
    if (!ok) return; // store explained the failure; dialog stays open so the player can retry
    const added = { starter: pending, edition };
    setPending(null);
    onAdded(added);
  };

  if (demo)
    return (
      <p className="tiny muted starter-demo-note">
        Own a starter deck? <button className="linklike" onClick={exitDemo}>Exit the demo</button> to log your own cards.
      </p>
    );

  return (
    <div className={`starters ${compact ? 'compact' : ''}`} role="group" aria-label="Log a starter deck">
      {STARTERS.map((s) => (
        <button key={s.key} className="starter-btn" onClick={() => { setEdition('retail'); setPending(s); }}>
          <span className="starter-legends" aria-hidden="true">
            {s.legends.map((l) => <CardImg key={l} slug={l} alt="" />)}
          </span>
          <span className="starter-text">
            <span className="starter-name">I own {s.name}</span>
            <span className="starter-meta">
              {s.colors.map((c) => <Pip key={c} color={c} bare />)} {starterCardCount(s)} cards
            </span>
          </span>
        </button>
      ))}
      <ConfirmDialog
        open={!!pending}
        tone="accent"
        title={pending ? `Add ${pending.name}?` : ''}
        confirmLabel={dup ? 'Add another copy' : `Add ${pending ? starterCardCount(pending) : 0} cards`}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => !busy && setPending(null)}
      >
        {pending && (
          <>
            <p>
              Adds all {starterCardCount(pending)} cards ({pending.legends.map((l) => BY_SLUG.get(l)?.name).join(', ')} plus the 40-card deck) on top of what you already have.
            </p>
            <fieldset className="edition-pick">
              <legend className="label">Which printing?</legend>
              {EDITIONS.map((e) => (
                <label key={e.id} className={`edition ${edition === e.id ? 'on' : ''}`}>
                  <input type="radio" name="starter-edition" value={e.id} checked={edition === e.id} onChange={() => setEdition(e.id)} />
                  <span><b>{e.label}</b> <span className="muted">{e.hint}</span></span>
                </label>
              ))}
            </fieldset>
            {dup && (
              <p className="callout y" role="alert" style={{ marginTop: 12 }}>
                Your collection already has a full {pending.name} ({edition}). Add a second copy only if you really own two.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Compact confirmation shown after an intake, with the next steps. */
export function StarterAddedBanner({ added, onDismiss, goPrices }: { added: StarterAdded; onDismiss: () => void; goPrices: () => void }) {
  const openInBuilder = () => {
    const { starter } = added;
    const deck = {
      id: newId(),
      name: `${starter.name} (starter)`,
      ...starterAsDeck(starter),
      sideboard: {},
      notes: `Official ${starter.name} starter list.`,
      updatedAt: '',
    };
    try {
      sessionStorage.setItem(PENDING_DECK_KEY, JSON.stringify(deck));
    } catch {
      /* storage blocked: builder opens empty */
    }
    window.location.hash = '/builder?deck=__pending';
  };
  return (
    <div className="callout starter-added" role="status">
      <div className="row">
        <span>
          <b>Added {added.starter.name}</b> ({added.edition === 'retail' ? 'Retail' : 'Beta'}): {starterCardCount(added.starter)} cards.
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={openInBuilder}>Open the deck</button>
        <button className="btn quiet sm" onClick={goPrices}>See what it&apos;s worth</button>
        <button className="btn ghost sm" onClick={onDismiss} aria-label="Dismiss">Done</button>
      </div>
    </div>
  );
}
