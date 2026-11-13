import { useEffect, useRef, useState } from 'react';
import { BY_SLUG, CARDS, defaultPrinting, type Printing } from '../lib/data';
import { totalCopies } from '../lib/deckDraft';
import { COPY_MAX, MAIN_MAX, MAIN_MIN } from '../lib/decks';
import { campaignCardFit, campaignDeckSizeIssue, isCampaignLegend, previewCampaignCrew } from '../lib/play/campaignDeckRules';
import type { CampaignRun } from '../lib/play/campaign';
import type { Deck } from '../lib/store';
import { CampaignRewardArt } from './CampaignRewardArt';

export function CampaignCrewEditor({ run, printings, slot, incoming, busy, error, inspect, close, commit }: {
  run: CampaignRun; printings: ReadonlyMap<string, Printing>; slot?: number; incoming?: string; busy: boolean; error?: string;
  inspect: (slug: string, printingId?: string) => void; close: () => void; commit: (deck: Deck) => void;
}) {
  const [legends, setLegends] = useState(() => run.deck.legends.map((slug, index) => index === (slot ?? 0) && incoming
    && !run.deck.legends.some((item, i) => i !== index && BY_SLUG.get(item)?.name === BY_SLUG.get(incoming)?.name) ? incoming : slug));
  const initialSlot = useRef<HTMLSelectElement>(null);
  const [fill, setFill] = useState('');
  const [added, setAdded] = useState<Record<string, number>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const legendPool = CARDS.filter(card => isCampaignLegend(card) && run.inventory[card.slug] > 0)
    .sort((a, b) => a.display.localeCompare(b.display));
  const impact = previewCampaignCrew(run, legends);
  const changed = legends.some((slug, index) => slug !== run.deck.legends[index]);
  const cards = { ...impact.deck.cards };
  for (const [slug, qty] of Object.entries(added)) cards[slug] = (cards[slug] ?? 0) + qty;
  const total = totalCopies(cards);
  const sizeIssue = campaignDeckSizeIssue(total);
  const removedCopies = impact.removed.reduce((count, item) => count + item.copies, 0);
  const colours = [...new Set([...impact.before.colours, ...impact.after.colours])];
  const staged = Object.entries(added).filter(([, qty]) => qty > 0);
  const candidates = CARDS.filter(card => !campaignCardFit(card, impact.after) && (run.inventory[card.slug] ?? 0) > 0)
    .sort((a, b) => a.display.localeCompare(b.display));
  const available = (slug: string) => Math.min(run.inventory[slug] ?? 0, COPY_MAX) - (cards[slug] ?? 0);
  const nextCard = candidates.find(card => card.slug === fill && available(card.slug) > 0)?.slug ?? '';
  const addable = nextCard ? Math.max(0, Math.min(available(nextCard), MAIN_MAX - total)) : 0;
  function stageCopies(qty: number) {
    if (qty > addable || qty < 1) return;
    setAdded(items => ({ ...items, [nextCard]: (items[nextCard] ?? 0) + qty }));
  }
  const refillCount = candidates.reduce((count, card) => count + Math.max(0, available(card.slug)), 0);
  const targetCount = Math.max(0, MAIN_MIN - total);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    initialSlot.current?.focus();
    return () => node?.close();
  }, []);

  return <dialog ref={dialog} className="campaign-upgrade-dialog campaign-crew-editor" aria-labelledby="campaign-crew-editor-title"
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header>
      <div><p className="campaign-invitation-eyebrow">Deck Workbench</p><h2 id="campaign-crew-editor-title">Manage Legends</h2></div>
      <button type="button" className="btn quiet" disabled={busy} onClick={close}>Cancel</button>
    </header>
    <div className="campaign-crew-editor-grid">
      <section aria-label="Proposed crew">
        <div className="campaign-crew-editor-slots">
          {legends.map((slug, index) => {
            const card = BY_SLUG.get(slug)!;
            const printing = printings.get(slug) ?? defaultPrinting(card);
            const current = BY_SLUG.get(run.deck.legends[index])!;
            const usedNames = new Set(legends.filter((_, i) => i !== index).map(item => BY_SLUG.get(item)?.name));
            return <div key={index}>
              <label htmlFor={`crew-slot-${index}`}>Legend {index + 1}</label>
              <button type="button" className="campaign-workbench-card-art" title={card.display} aria-label={`Inspect ${card.display}`} onClick={() => inspect(slug, printing?.id)}>
                <CampaignRewardArt pull={{ slug, printing }} alt="" exact />
              </button>
              <select ref={index === (slot ?? 0) ? initialSlot : undefined} id={`crew-slot-${index}`} value={slug} disabled={busy} onChange={event => {
                const replacement = event.target.value;
                setLegends(items => items.map((item, i) => i === index ? replacement : item));
                setAdded({}); setFill('');
              }}>
                {legendPool.filter(item => item.slug === slug || !usedNames.has(item.name)).map(item => <option key={item.slug} value={item.slug}>
                  {item.display} · {item.color}
                </option>)}
              </select>
              {slug !== current.slug && <small>Replaces {current.display}</small>}
            </div>;
          })}
        </div>
        <div className="campaign-crew-ram-change" aria-label="RAM before and after">
          {colours.map(colour => <span key={colour}><b>{colour} RAM</b> {impact.before.ram[colour] ?? 0} → {impact.after.ram[colour] ?? 0}</span>)}
        </div>
        {impact.issue && <p className="play-error" role="alert">{impact.issue}</p>}
      </section>

      <section className="campaign-crew-editor-impact" aria-label="Deck impact">
        <h3>{total} / {MAIN_MAX} cards after swap</h3>
        {sizeIssue && <p role="status" className="campaign-crew-warning">{sizeIssue} to launch a match.</p>}
        {removedCopies > 0 ? <details open>
          <summary>{removedCopies} {removedCopies === 1 ? 'copy returns' : 'copies return'} to your reserve</summary>
          <ul className="campaign-crew-removals">{impact.removed.map(item => <li key={item.slug}>
            <b>{item.copies} × {BY_SLUG.get(item.slug)?.display ?? item.slug}</b><small>{item.reason}</small>
          </li>)}</ul>
        </details> : changed && <p>Your current main-deck cards fit this crew.</p>}
        {changed && !impact.issue && <div className="campaign-crew-refill">
          <label htmlFor="crew-refill">Add from the reserve <small>{refillCount} compatible copies available</small></label>
          {targetCount > refillCount && <p className="campaign-crew-warning campaign-crew-shortfall">You need {targetCount - refillCount} more compatible {targetCount - refillCount === 1 ? 'copy' : 'copies'} in your reserve to play with this crew.</p>}
          <div>
            <select id="crew-refill" value={nextCard} disabled={busy || total >= MAIN_MAX || !refillCount} onChange={event => setFill(event.target.value)}>
              <option value="">Choose a card</option>
              {candidates.filter(card => available(card.slug) > 0).map(card => <option key={card.slug} value={card.slug}>{card.display} · {available(card.slug)} available</option>)}
            </select>
            <button type="button" className="btn quiet" disabled={busy || !addable} onClick={() => stageCopies(1)}>Add copy</button>
            {addable > 1 && <button type="button" className="btn quiet" disabled={busy} onClick={() => stageCopies(addable)}>Add {addable}</button>}
          </div>
          {!!staged.length && <ul className="campaign-crew-staged" aria-label="Staged reserve copies">{staged.map(([slug, qty]) => <li key={slug}>
            <span>{qty} × {BY_SLUG.get(slug)?.display}</span>
            <button type="button" className="btn quiet" aria-label={`Remove staged ${BY_SLUG.get(slug)?.display}`} disabled={busy}
              onClick={() => setAdded(items => ({ ...items, [slug]: qty - 1 }))}>−</button>
          </li>)}</ul>}
        </div>}
      </section>
    </div>
    <footer>
      {error && <p className="play-error" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={busy || !changed || !!impact.issue || total > MAIN_MAX}
        onClick={() => commit({ ...impact.deck, cards })}>
        {busy ? 'Saving…' : sizeIssue ? 'Confirm swap and save draft' : 'Confirm crew swap'}
      </button>
    </footer>
  </dialog>;
}
