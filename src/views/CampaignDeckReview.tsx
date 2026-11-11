import { useEffect, useRef, useState } from 'react';
import { CardImg, Rules } from '../components/bits';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG, ramLimits } from '../lib/data';
import { deckStats } from '../lib/handtest';
import type { Deck } from '../lib/store';
import type { CampaignRun } from '../lib/play/campaign';
import { latestPack, packCardContext, previewCampaignEdit } from '../lib/play/campaignPresentation';

export function CampaignNewCards({ run, review }: { run: CampaignRun; review: (slug: string) => void }) {
  const pack = latestPack(run);
  if (!pack.length) return null;
  return <section className="campaign-new-cards"><div className="campaign-section-heading"><div><p className="play-eyebrow">Your latest pack / {pack.length} cards earned</p><h3>What changes next?</h3></div><span>Compare before you commit</span></div><p>Choose a card to preview an addition or a one-for-one swap. Everything you take out stays in reserve.</p><div className="campaign-new-grid">{pack.map(slug => { const card = BY_SLUG.get(slug); const used = card?.type === 'Legend' ? Number(run.deck.legends.includes(slug)) : run.deck.cards[slug] ?? 0; return <button key={slug} onClick={() => review(slug)} aria-label={`Compare ${card?.display}`}><CardImg slug={slug} alt="" /><strong>{card?.name ?? slug}</strong><small>{used} in deck · {run.inventory[slug]} earned</small><span>{used >= run.inventory[slug] ? 'Review card' : card?.type === 'Legend' ? 'Compare crew' : 'Compare swap'} ↗</span></button>; })}</div></section>;
}

export function CampaignDeckNumbers({ deck }: { deck: Deck }) {
  const stats = deckStats(deck.cards);
  const ram = ramLimits(deck.legends);
  return <div className="campaign-deck-numbers"><span><strong>{stats.n}</strong> main cards</span><span><strong>{stats.avgCost.toFixed(1)}</strong> avg cost</span><span><strong>{stats.units}</strong> Units</span><span><strong>{stats.sellable}</strong> sellable</span>{Object.entries(ram).map(([color, value]) => <span key={color}><strong>{value}</strong> {color} RAM</span>)}</div>;
}

/** Keyed by incoming card so a new review starts with a fresh, explicit proposal. */
export function CampaignUpgradeDialog({ run, slug, busy, error, close, commit }: { run: CampaignRun; slug: string; busy: boolean; error?: string; close: () => void; commit: (deck: Deck) => void }) {
  const card = BY_SLUG.get(slug)!;
  const isLegend = card.type === 'Legend';
  const alternatives = isLegend ? run.deck.legends.filter(item => BY_SLUG.get(item)?.color === card.color && item !== slug)
    : Object.keys(run.deck.cards).filter(item => item !== slug && run.deck.cards[item] > 0).sort((a, b) => {
      const ca = BY_SLUG.get(a)!, cb = BY_SLUG.get(b)!;
      return Number(cb.type === card.type) - Number(ca.type === card.type) || Math.abs((ca.cost ?? 0) - (card.cost ?? 0)) - Math.abs((cb.cost ?? 0) - (card.cost ?? 0)) || ca.display.localeCompare(cb.display);
    });
  const [outgoing, setOutgoing] = useState(isLegend ? alternatives[0] ?? '' : '');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const proposal = previewCampaignEdit(run, slug, outgoing || undefined);
  const before = deckStats(run.deck.cards), after = deckStats(proposal.deck.cards);
  const beforeRAM = ramLimits(run.deck.legends), afterRAM = ramLimits(proposal.deck.legends);
  const prior = BY_SLUG.get(outgoing);
  const used = isLegend ? Number(run.deck.legends.includes(slug)) : run.deck.cards[slug] ?? 0;
  const available = run.inventory[slug] - used;
  const rows: [string, string | number, string | number][] = [
    ['Main cards', before.n, after.n], ['Average cost', before.avgCost.toFixed(2), after.avgCost.toFixed(2)],
    ['Units', before.units, after.units], ['Gear', before.gear, after.gear], ['Programs', before.programs, after.programs], ['Sellable', before.sellable, after.sellable],
    ...Object.keys(beforeRAM).map(color => [`${color} RAM`, beforeRAM[color], afterRAM[color] ?? 0] as [string, number, number]),
  ];
  return <dialog ref={dialog} className="campaign-upgrade-dialog" aria-labelledby="campaign-edit-title" onClose={close}>
    <header><div><p className="play-eyebrow">Workshop / Preview an edit</p><h2 id="campaign-edit-title">{available > 0 ? 'Make room for something new.' : 'Already working for your crew.'}</h2></div><button className="btn quiet" onClick={close}>Close</button></header>
    <div className="campaign-upgrade-layout"><section><div className="campaign-compare-art"><div><span className="play-eyebrow">{available > 0 ? 'Into your deck' : 'In your deck'}</span><CardImg slug={slug} alt={card.display} priority /><strong>{card.display}</strong></div>{outgoing && <><span className="campaign-swap-arrow" aria-hidden="true">⇄</span><div className="campaign-outgoing"><span className="play-eyebrow">Back to reserve</span><CardImg slug={outgoing} alt={prior?.display ?? outgoing} priority /><strong>{prior?.display}</strong></div></>}</div><p className="campaign-card-facts">{card.color} · {card.type} · {isLegend ? '' : `Cost ${card.cost ?? '—'} · `}RAM {card.ram ?? '—'}</p><p className="campaign-rules"><Rules text={card.text} /></p><p className="campaign-fit">{packCardContext(run, slug)}</p></section>
      <section className="campaign-edit-proposal"><p>{used} in deck · {run.inventory[slug]} earned · {available} in reserve</p>{available > 0 ? <><label htmlFor="campaign-return">{isLegend ? 'Replace a same-colour Legend' : 'Return one copy to reserve'}</label><VaultSelect id="campaign-return" value={outgoing} onValueChange={setOutgoing} options={[...(!isLegend ? [{ value: '', label: 'Add a copy without removing a card' }] : []), ...alternatives.map(item => ({ value: item, label: `${BY_SLUG.get(item)?.display}${isLegend ? ` · RAM ${BY_SLUG.get(item)?.ram}` : ` · Cost ${BY_SLUG.get(item)?.cost ?? '—'}`}` }))]} />
        <table className="campaign-compare-stats"><caption>Your deck, before and after</caption><thead><tr><th scope="col">Deck</th><th scope="col">Now</th><th scope="col">After</th></tr></thead><tbody>{rows.map(([label, from, to]) => <tr key={label} data-changed={from !== to}><th scope="row">{label}</th><td>{from}</td><td>{to}</td></tr>)}</tbody></table>
        <details className="campaign-curve-compare"><summary>Cost curve, before and after</summary><div>{before.curve.map((bucket, index) => <div key={bucket.label}><span>Cost {bucket.label}</span><span>{bucket.value} → {after.curve[index].value}</span></div>)}</div></details>
        {proposal.issues.length > 0 ? <div className="play-error" role="status">{proposal.issues.map(issue => <p key={issue}>{issue}</p>)}</div> : <p className="campaign-fit" role="status">Legal after this {outgoing ? 'swap' : 'addition'}. {outgoing ? 'The removed card stays in your reserve.' : 'No cards removed.'}</p>}
        <button className="btn campaign-commit-edit" disabled={busy || proposal.issues.length > 0} onClick={() => commit(proposal.deck)}>{busy ? 'Saving…' : outgoing ? isLegend ? 'Confirm crew swap' : 'Swap one copy' : 'Add one copy'}</button><small>You can undo this edit in the workshop.</small>
      </> : <p>All your earned copies are already in the deck. You can manage quantities in the workshop below.</p>}{error && <p className="play-error" role="alert">{error}</p>}</section></div>
  </dialog>;
}
