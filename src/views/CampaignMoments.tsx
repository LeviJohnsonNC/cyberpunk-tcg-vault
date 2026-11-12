import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CardImg, CARD_BACK, Rules } from '../components/bits';
import { BY_SLUG, imageUrl } from '../lib/data';
import { STARTERS } from '../lib/starters';
import { CAMPAIGN_ACTS, campaignRecap, packCardContext } from '../lib/play/campaignPresentation';
import { campaignActStory } from '../lib/play/campaignStory';
import { CampaignDispatch, CampaignEpilogue } from './CampaignStory';
import { ENCOUNTERS, ENVIRONMENTS, type CampaignRun, type Environment } from '../lib/play/campaign';
import booth from '../assets/play/campaign-booth.webp';
import rooftop from '../assets/play/campaign-rooftop.webp';
import arasaka from '../assets/play/campaign-arasaka.webp';

const ROOM_ART: Record<Environment, string> = { booth, rooftop, arasaka };
const ROOM_MOOD: Record<Environment, string> = {
  booth: 'Private neon. Warm leather. The city can wait.',
  rooftop: 'Cool rain. Open sky. A little room to breathe.',
  arasaka: 'Black marble. Champagne light. A view you earned.',
};
const roomStyle = (room: Environment): CSSProperties => ({ '--campaign-art': `url("${ROOM_ART[room]}")` } as CSSProperties);

export function CampaignPack({ run, busy, revealTo, choose, inspect }: {
  run: CampaignRun; busy: boolean; revealTo: (count: number) => void; choose: (slug: string) => void; inspect: (slug: string) => void;
}) {
  const reward = run.rewards[run.encounter];
  const reveal = run.revealed ?? 0;
  const artManifest = [...reward.cards, ...reward.offers].join('|');
  useEffect(() => {
    // Warm the browser cache behind the sealed pack; failures never gate a reveal.
    for (const slug of artManifest.split('|')) { const image = new Image(); image.decoding = 'async'; image.src = imageUrl(slug); }
  }, [artManifest]);
  const [selected, setSelected] = useState<{ index: number; reveal: number }>();
  const active = selected?.reveal === reveal ? selected.index : Math.max(0, reveal - 1);
  const slug = reward.cards[active];
  const card = BY_SLUG.get(slug);
  const [opening, setOpening] = useState(false);
  const choicePanel = useRef<HTMLDivElement>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(stopTimer.current), []);
  function open(count: number) {
    if (!reveal && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOpening(true);
      clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => setOpening(false), 650);
    }
    revealTo(count);
  }
  return <section className="campaign-reward campaign-pack panel hot" aria-label="Earned pack">
    <div className="campaign-section-heading"><div><p className="play-eyebrow">{ENCOUNTERS[run.encounter].title} / Contract cleared</p><h2>Your take.</h2></div><span className="campaign-stamp">PAID IN CARDS</span></div>
    <CampaignDispatch encounter={ENCOUNTERS[run.encounter].id} />
    <div className="campaign-pack-stage" data-opening={opening}>
      <aside className="campaign-pack-receipt"><span className="play-eyebrow">AF / SUPPLY DROP {String(run.encounter + 1).padStart(2, '0')}</span><strong>7 yours.<br />1 your call.</strong><p>Seven cards for your reserve. Then choose the eighth to shape your next match.</p><span className="campaign-reveal-count" role="status">{reveal} / 7 revealed</span>
        <div className="campaign-pack-actions"><button className="btn" disabled={busy} onClick={() => { if (reveal < 7) open(reveal + 1); else { choicePanel.current?.scrollIntoView({ block: 'start' }); choicePanel.current?.focus({ preventScroll: true }); } }}>{reveal === 0 ? 'Tear the seal' : reveal < 7 ? 'Reveal next card' : 'Choose your eighth card ↓'}</button><button className="btn quiet" disabled={busy || reveal >= 7} onClick={() => open(7)}>Reveal all</button></div>
        <small>Your pack is saved. You can leave and come back.</small>
      </aside>
      <div className="campaign-reveal-spotlight">
        {!reveal ? <button className="campaign-sealed-pack" disabled={busy} onClick={() => open(1)} aria-label="Tear the seal and reveal the first card"><span className="campaign-pack-code">AF / AFTERLIFE<br />CONTRACT {String(run.encounter + 1).padStart(2, '0')}</span><span className="campaign-foil-mark" aria-hidden="true">◆</span><strong>YOUR<br />TAKE.</strong><span className="campaign-pack-seal">Tear the seal ↗</span><span className="campaign-pack-count">07 CARDS + 01 CHOICE</span></button>
          : <button className="campaign-reveal-art" key={`${active}:${slug}`} onClick={() => inspect(slug)} aria-label={`Inspect ${card?.display ?? slug}`}><CardImg slug={slug} alt={card?.display ?? slug} priority /><span>Inspect card ↗</span></button>}
        {opening && <div className="campaign-seal-tear" aria-hidden="true">AF / AFTERLIFE</div>}
      </div>
      <div className="campaign-reveal-copy" aria-live="polite">
        {reveal > 0 ? <><p className="play-eyebrow">{card?.color} / {card?.type} / {card?.rarity}</p><h3>{card?.display ?? slug}</h3><p className="campaign-card-facts">Cost {card?.cost ?? '—'} · RAM {card?.ram ?? '—'}{card?.sellable ? ' · Sellable' : ''}</p><p className="campaign-rules"><Rules text={card?.text ?? 'Card details unavailable.'} /></p><p className="campaign-fit">{packCardContext(run, slug)}</p><small>+1 in reserve · {run.inventory[slug]} earned total</small></> : <><p className="play-eyebrow">The next version of your deck</p><h3>A few new possibilities.</h3><p>Every card stays in your campaign reserve. After your pick, compare a swap before changing your deck.</p><span className="campaign-pack-line" aria-hidden="true" /></>}
      </div>
    </div>
    {reveal > 0 && <div className="campaign-pack-fan" aria-label="Cards in this pack">{reward.cards.map((item, index) => <button key={`${index}:${item}`} className="campaign-pack-pocket" data-selected={active === index} data-hidden={index >= reveal} disabled={busy || index > reveal} onClick={() => index < reveal ? setSelected({ index, reveal }) : open(index + 1)} aria-label={index < reveal ? `View ${BY_SLUG.get(item)?.display ?? item}` : index === reveal ? 'Reveal next card' : `Card ${index + 1}, sealed`}>
      {index < reveal ? <CardImg slug={item} alt="" /> : <img src={CARD_BACK} alt="" />}<span>{index < reveal ? BY_SLUG.get(item)?.name : 'Sealed'}</span>
    </button>)}</div>}
    {reveal >= 7 && <div className="campaign-choice" ref={choicePanel} tabIndex={-1}><div className="campaign-section-heading"><div><p className="play-eyebrow">One final decision</p><h3>Make the eighth count.</h3></div><span>Choose 1 of 3</span></div><p>Pick one for your reserve. Your current deck stays as it is until you edit it.</p><div className="campaign-choice-grid">{reward.offers.map(item => { const offered = BY_SLUG.get(item); return <article key={item}><button className="campaign-choice-art" onClick={() => inspect(item)} aria-label={`Inspect ${offered?.display}`}><CardImg slug={item} alt="" /></button><div><p className="play-eyebrow">{offered?.color} / {offered?.type}</p><h4>{offered?.display}</h4><p className="campaign-card-facts">{offered?.type === 'Legend' ? `Crew · RAM ${offered.ram}` : `Cost ${offered?.cost ?? '—'} · RAM ${offered?.ram ?? '—'}${offered?.sellable ? ' · Sellable' : ''}`}</p><p className="campaign-choice-rules"><Rules text={offered?.text ?? ''} /></p><p className="campaign-fit">{packCardContext(run, item)}</p><button className="btn quiet" onClick={() => inspect(item)}>Full card details</button><button className="btn" disabled={busy} onClick={() => choose(item)}>Keep this card</button></div></article>; })}</div></div>}
  </section>;
}

export function CampaignArrival({ run, busy, continueToDeck }: { run: CampaignRun; busy: boolean; continueToDeck: () => void }) {
  const index = run.encounter === 3 ? 1 : 2;
  const act = CAMPAIGN_ACTS[index];
  return <section className="campaign-arrival" style={roomStyle(act.room)} aria-labelledby="act-title"><div className="campaign-arrival-content"><p className="play-eyebrow">{act.kicker}</p><h2 id="act-title">{act.title}</h2><p>{campaignActStory[index]}</p><div className="campaign-arrival-stats"><span><strong>{run.encounter}</strong> contracts cleared</span><span><strong>{campaignRecap(run).earnedCopies}</strong> cards earned</span><span><strong>{9 - run.encounter}</strong> tables to go</span></div><button className="btn" disabled={busy} onClick={continueToDeck}>Review my new cards</button><p className="campaign-arrival-next">Next contract / {ENCOUNTERS[run.encounter].title}</p><small>Room artwork preview. Your permanent room unlocks after the final table.</small></div><span className="campaign-act-number" aria-hidden="true">{String(Math.floor(run.encounter / 3) + 1).padStart(2, '0')}</span></section>;
}

export function CampaignRecap({ run, inspect }: { run: CampaignRun; inspect: (slug: string) => void }) {
  const recap = campaignRecap(run);
  return <section className="campaign-victory" style={roomStyle('arasaka')} aria-labelledby="campaign-victory-title"><div className="campaign-victory-copy"><p className="play-eyebrow">Afterlife / Nine tables cleared</p><h2 id="campaign-victory-title">You earned<br />your seat.</h2><p>{recap.changedCopies || recap.recruits.length ? <>Started with {STARTERS.find(item => item.key === run.starter)?.name}. Finished with a deck of your own.</> : <>Took {STARTERS.find(item => item.key === run.starter)?.name} all the way. Nine contracts. One finished campaign.</>}</p><dl className="campaign-victory-stats"><div><dt>Contracts won</dt><dd>{recap.clears}<small>/ 9</small></dd></div><div><dt>Cards earned</dt><dd>{recap.earnedCopies}<small>in {recap.packs} packs</small></dd></div><div><dt>Added to main</dt><dd>{recap.changedCopies}<small>copies beyond starter</small></dd></div></dl></div><div className="campaign-victory-crew"><span className="play-eyebrow">The crew that made it</span><div>{run.deck.legends.map(slug => <button key={slug} onClick={() => inspect(slug)} aria-label={`Inspect ${BY_SLUG.get(slug)?.display}`}><CardImg slug={slug} alt="" priority /><span>{BY_SLUG.get(slug)?.name}</span>{recap.recruits.includes(slug) && <small>Recruited</small>}</button>)}</div></div>
    <CampaignEpilogue />
    {!!recap.additions.length && <details className="campaign-deck-story"><summary>How your deck changed · {recap.additions.length} card identities</summary><p>Extra copies in your final main deck compared with the official starter.</p><div>{recap.additions.map(item => <button className="btn quiet" key={item.slug} onClick={() => inspect(item.slug)}>+{item.count} {BY_SLUG.get(item.slug)?.display}</button>)}</div></details>}
  </section>;
}

export function CampaignRooms({ rooms, selected, busy, onSelect, action, allOwned = false }: { rooms: readonly Environment[]; selected?: Environment; busy: boolean; onSelect: (room: Environment) => void; action: 'claim' | 'equip'; allOwned?: boolean }) {
  const [preview, setPreview] = useState<Environment>();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Environment>(selected ?? rooms[0] ?? 'booth');
  const current = rooms.includes(choice) ? choice : rooms[0];
  const item = ENVIRONMENTS.find(room => room.id === current)!;
  useEffect(() => { if (preview && !dialog.current?.open) dialog.current?.showModal(); if (!preview) dialog.current?.close(); }, [preview]);
  return <section className="campaign-room-gallery panel"><div className="campaign-section-heading"><div><p className="play-eyebrow">{action === 'claim' ? 'Champion’s cache / Permanent unlock' : 'Your room keys'}</p><h2>{action === 'claim' ? 'Where will you play next?' : 'A room of your own.'}</h2></div><span>{action === 'claim' ? allOwned ? 'All rooms already unlocked' : 'Choose one to keep' : 'Campaign + Free Play'}</span></div>
    <div className="campaign-room-options" role="group" aria-label="Room previews">{rooms.map(id => <button key={id} style={roomStyle(id)} data-environment={id} aria-pressed={current === id} onClick={() => setChoice(id)}><strong>{ENVIRONMENTS.find(room => room.id === id)?.name}</strong><span>{selected === id ? 'Equipped' : 'Preview room'}</span></button>)}</div>
    <div className="campaign-room-hero" style={roomStyle(current)} data-environment={current}><div><p className="play-eyebrow">{action === 'claim' ? 'Your next home table' : selected === current ? 'Currently equipped' : 'Ready to equip'}</p><h3>{item.name}</h3><p>{ROOM_MOOD[current]}</p><div className="campaign-pack-actions"><button className="btn" disabled={busy || (action === 'equip' && selected === current)} onClick={() => onSelect(current)}>{action === 'claim' ? allOwned ? 'Finish in this room' : 'Claim this room' : selected === current ? 'Room equipped' : 'Equip this room'}</button><button className="btn quiet" onClick={() => setPreview(current)}>View room artwork</button></div></div></div>
    {action === 'claim' && <p className="campaign-room-note">{allOwned ? 'Your full set of room keys stays yours. Choose a room to finish this run.' : 'Yours across future runs and Free Play. Win another campaign to unlock another room.'}</p>}
    <dialog ref={dialog} className="campaign-room-preview" aria-label="Room artwork preview" onClose={() => setPreview(undefined)}><button className="btn" onClick={() => setPreview(undefined)}>Close preview</button>{preview && <><img src={ROOM_ART[preview]} alt={`${ENVIRONMENTS.find(room => room.id === preview)?.name}. ${ROOM_MOOD[preview]}`} /><p>{ENVIRONMENTS.find(room => room.id === preview)?.name}</p></>}</dialog>
  </section>;
}
