import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CardImg } from '../components/bits';
import { BY_SLUG } from '../lib/data';
import { STARTERS } from '../lib/starters';
import { CAMPAIGN_ACTS, campaignRecap } from '../lib/play/campaignPresentation';
import { campaignActStory } from '../lib/play/campaignStory';
import { CampaignEpilogue } from './CampaignStory';
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
