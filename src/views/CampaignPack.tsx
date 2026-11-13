import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CARD_BACK } from '../components/bits';
import { BY_SLUG, defaultPrinting } from '../lib/data';
import { ENCOUNTERS, campaignPackLayout, type CampaignRun, type CampaignReward } from '../lib/play/campaign';
import { campaignPulls, packRarityLabel } from '../lib/play/campaignPack';
import { packCardContext } from '../lib/play/campaignPresentation';
import { getPrintingArt } from '../lib/printingArt';
import wrapperArt from '../assets/play/campaign-booster-foil.webp';
import { CampaignTimeline, type CampaignInspect } from './CampaignHub';
import { CampaignRewardArt } from './CampaignRewardArt';
import { CampaignDispatch } from './CampaignStory';
import './campaign-pack-scene.css';
import './campaign-tabletop.css';

type PackProps = {
  run: CampaignRun;
  reward: CampaignReward;
  busy: boolean;
  titleRef: (node: HTMLHeadingElement | null) => void;
  tools: ReactNode;
  tearSeal: () => Promise<boolean>;
  flipSlot: (slot: number) => Promise<boolean>;
  showBonus: (show: boolean) => Promise<boolean>;
  revealSound: (rare: boolean) => void;
  choose: (slug: string) => void;
  finish: () => void;
  inspect: CampaignInspect;
  back: () => void;
};

const richRarity = (rarity?: string) => !!rarity && !['Common', 'Uncommon'].includes(rarity);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const displayName = (slug: string) => BY_SLUG.get(slug)?.display ?? slug;

export function CampaignPack({ run, reward, busy, titleRef, tools, tearSeal, flipSlot, showBonus, revealSound, choose, finish, inspect, back }: PackProps) {
  const retry = run.phase === 'retryReward';
  const hasChoice = reward.offers.length > 0;
  const result = retry ? run.aftermath?.outcome === 'draw' ? 'Match drawn' : 'Contract lost' : 'Contract won';
  const finishLabel = retry ? 'Review my new cards' : 'Open Champion’s Cache';
  const pulls = campaignPulls(reward);
  const count = pulls.length;
  const layout = campaignPackLayout(run, reward);
  const revealed = layout?.revealedSlots ?? [];
  const allRevealed = revealed.length === count;
  const bonus = !!layout?.choosingBonus && allRevealed && hasChoice;
  const encounter = ENCOUNTERS[run.encounter];
  const act = Math.floor(run.encounter / 3) + 1;
  const [selected, setSelected] = useState<number>();
  const [choice, setChoice] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [flip, setFlip] = useState<{ slot: number; phase: 'saving' | 'turning' | 'front' }>();
  const opener = useRef<HTMLButtonElement>(null);
  const stageTitle = useRef<HTMLHeadingElement>(null);
  const featured = useRef<HTMLButtonElement>(null);
  const firstSlot = useRef<HTMLButtonElement>(null);
  const moveFrom = useRef<DOMRect>(undefined);
  const openingRequest = useRef(false);
  const focusStage = useRef(false);
  const flipLock = useRef(false);
  const sealed = !layout || opening;
  const peeling = opening && !!layout;
  const disabled = busy || requestPending || peeling;
  const visible = revealed.filter(slot => flip?.slot !== slot || flip.phase === 'front');
  const active = selected !== undefined && visible.includes(selected) ? selected
    : visible.findLast(slot => slot !== flip?.slot);
  const pull = layout && active !== undefined ? pulls[layout.order[active]] : undefined;

  useEffect(() => {
    // Warm exact printing art without making a save depend on the artwork host.
    for (const { slug, printing } of campaignPulls(reward)) {
      if (printing) void getPrintingArt(slug, printing.id).then(src => {
        if (src) {
          const image = new Image();
          image.decoding = 'async';
          image.referrerPolicy = 'no-referrer';
          image.src = src;
        }
      }).catch(() => {});
    }
  }, [reward]);

  useEffect(() => {
    if (!peeling) return;
    const timer = setTimeout(() => setOpening(false), 340);
    return () => clearTimeout(timer);
  }, [peeling]);

  useEffect(() => {
    if (sealed || busy || !focusStage.current) return;
    focusStage.current = false;
    if (!bonus && !revealed.length) firstSlot.current?.focus({ preventScroll: true });
    else stageTitle.current?.focus({ preventScroll: true });
  }, [sealed, busy, bonus, revealed.length]);

  useLayoutEffect(() => {
    const from = moveFrom.current;
    moveFrom.current = undefined;
    const card = featured.current;
    if (!from || !card || reducedMotion() || !card.animate) return;
    const to = card.getBoundingClientRect();
    const flight = card.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, opacity: .78 },
      { transform: 'none', opacity: 1 },
    ], { duration: 270, easing: 'cubic-bezier(.2,.8,.28,1)' });
    return () => flight.cancel();
  }, [active]);

  async function openSeal() {
    if (disabled || openingRequest.current) return;
    openingRequest.current = true;
    setRequestPending(true);
    focusStage.current = true;
    if (!reducedMotion()) setOpening(true);
    try {
      if (!await tearSeal()) {
        setOpening(false);
        focusStage.current = false;
        requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
      }
    } finally {
      openingRequest.current = false;
      setRequestPending(false);
    }
  }

  async function selectSlot(slot: number) {
    if (!layout || busy || flipLock.current) return;
    if (revealed.includes(slot)) {
      setSelected(slot);
      return;
    }
    flipLock.current = true;
    setFlip({ slot, phase: 'saving' });
    if (!await flipSlot(slot)) {
      setFlip(undefined);
      flipLock.current = false;
      return;
    }
    const rare = richRarity(pulls[layout.order[slot]].printing?.rarity);
    if (reducedMotion()) {
      revealSound(rare);
      setSelected(slot);
      setFlip(undefined);
      flipLock.current = false;
      return;
    }
    setFlip({ slot, phase: 'turning' });
  }

  function showSlotFace(slot: number) {
    if (flip?.slot !== slot || flip.phase !== 'turning' || !layout) return;
    revealSound(richRarity(pulls[layout.order[slot]].printing?.rarity));
    setFlip({ slot, phase: 'front' });
  }

  function featureFlippedSlot(slot: number, source: HTMLButtonElement) {
    if (flip?.slot !== slot) return;
    if (flip.phase === 'turning') showSlotFace(slot);
    moveFrom.current = source.getBoundingClientRect();
    setSelected(slot);
    setFlip(undefined);
    flipLock.current = false;
  }

  async function switchBonus(show: boolean) {
    focusStage.current = true;
    if (!await showBonus(show)) focusStage.current = false;
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function attachTitle(node: HTMLHeadingElement | null) {
    stageTitle.current = node;
    titleRef(node);
  }

  const sealHead = <header className="campaign-board-header">
    <div>
      <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> Campaign</p>
      <h1 id="campaign-moment-title" tabIndex={-1} ref={titleRef}>{result}<span aria-hidden="true">.</span></h1>
    </div>
  </header>;

  if (sealed) return <section className="campaign-seal-scene" data-act={Math.floor(run.encounter / 3) + 1} data-encounter={encounter.id}
    aria-labelledby="campaign-moment-title">
    <div className="campaign-seal-layout">
      {sealHead}
      <CampaignTimeline run={run} />
      <div className="campaign-seal-stage">
        <div className="campaign-seal-promise">
          <p className="play-eyebrow">{encounter.title} / {retry ? 'House pack' : 'Contract cleared'}</p>
          <h2>{hasChoice ? <>{count} yours.<br /> 1 your call.</> : retry ? 'Another shot.' : 'The final take.'}</h2>
          <p>{count} cards for your reserve.{hasChoice ? ' Choose one more to shape your next match.' : retry ? ' Open them before you challenge this rival again.' : ' Your room key is waiting in the Champion’s Cache.'}</p>
        </div>
        <div className="campaign-seal-reward">
          <div className="campaign-seal-prop" data-peeling={peeling || undefined}>
            <div className="campaign-seal-wrapper">
              <img src={wrapperArt} alt="" />
              <div className="campaign-seal-brand" aria-hidden="true">
                <span>AF / Supply Drop {String(run.encounter + 1).padStart(2, '0')}</span>
                <strong>Your<br />take.</strong>
                <span>{String(count).padStart(2, '0')} cards{hasChoice ? ' + 01 choice' : ''}</span>
              </div>
              <button ref={opener} type="button" className="campaign-seal-strip" disabled={disabled} onClick={() => void openSeal()}
                aria-label="Tear the seal" aria-busy={requestPending || undefined}>
                <span>{requestPending && !peeling ? 'Opening…' : 'Tear the seal'}</span>
                <span className="campaign-seal-strip-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
        {!run.aftermath && <CampaignDispatch encounter={encounter.id} />}
      </div>
    </div>
  </section>;

  return <section className="campaign-tabletop" data-act={act} data-bonus={bonus || undefined} aria-labelledby="campaign-moment-title">
    <div className="campaign-tabletop-inner">
      {bonus ? <>
        <header className="campaign-bonus-head">
          <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> Final choice</p>
          <h1 id="campaign-moment-title" tabIndex={-1} ref={attachTitle}>One more for the crew<span aria-hidden="true">.</span></h1>
          <p>{count} cards secured. Choose one bonus card for your reserve.</p>
        </header>
        <div className="campaign-bonus-cards" style={{ '--offer-count': reward.offers.length } as CSSProperties} role="group" aria-label="Bonus cards">
          {reward.offers.map(slug => {
            const card = BY_SLUG.get(slug);
            const printing = card && defaultPrinting(card);
            const name = displayName(slug);
            const context = (run.inventory[slug] ?? 0) === 0 && card?.type !== 'Legend' ? 'New to your reserve' : packCardContext(run, slug);
            return <article key={slug}>
              <button type="button" className="campaign-bonus-pick" aria-pressed={choice === slug}
                aria-label={`Select ${name}`} disabled={busy} onClick={() => setChoice(slug)}>
                <CampaignRewardArt pull={{ slug, printing }} alt="" exact />
              </button>
              <div className="campaign-bonus-card-copy">
                <strong>{name}</strong>
                <span>{[card?.color, card?.type].filter(Boolean).join(' / ')}</span>
                <small>{context}</small>
                <button type="button" className="campaign-tabletop-link" aria-label={`Inspect ${name}`}
                  onClick={() => inspect(slug, printing?.id)}>Inspect</button>
              </div>
            </article>;
          })}
        </div>
        <div className="campaign-bonus-actions">
          <button type="button" className="campaign-invitation-cta" disabled={busy || !choice} onClick={() => { if (choice) choose(choice); }}>
            Add selected card to reserve <span aria-hidden="true">→</span>
          </button>
          <small>You can add it to your deck in the Workbench.</small>
          <button type="button" className="campaign-tabletop-link" disabled={busy} onClick={() => void switchBonus(false)}>Review pack</button>
        </div>
      </> : <>
        <div className="campaign-tabletop-stage">
          <header className="campaign-tabletop-heading">
            <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> {retry ? 'House pack' : `Supply drop ${String(run.encounter + 1).padStart(2, '0')}`}</p>
            <h1 id="campaign-moment-title" tabIndex={-1} ref={attachTitle}>Your take<span aria-hidden="true">.</span></h1>
            <p className="campaign-tabletop-count" role="status">{visible.length} / {count} revealed</p>
            <div className="campaign-tabletop-progress" aria-hidden="true">{pulls.map((_, index) => <i key={index} data-filled={index < visible.length} />)}</div>
            {visible.length === 0 && <p className="campaign-tabletop-hint">Select a sealed card to reveal it.</p>}
          </header>
          <div className="campaign-tabletop-spotlight" data-rarity={pull?.printing?.rarity} data-rich={richRarity(pull?.printing?.rarity) || undefined}>
            {pull && <button ref={featured} type="button" className="campaign-tabletop-feature" onClick={() => inspect(pull.slug, pull.printing?.id)}
              aria-label={`Inspect ${displayName(pull.slug)}`} key={active}>
              <CampaignRewardArt pull={pull} alt="" exact />
            </button>}
          </div>
          {pull && <div className="campaign-tabletop-copy" aria-live="polite">
            <p className="play-eyebrow" data-rarity={pull.printing?.rarity}>{[packRarityLabel(pull.printing?.rarity), BY_SLUG.get(pull.slug)?.color, BY_SLUG.get(pull.slug)?.type].filter(Boolean).join(' / ')}</p>
            <h2>{displayName(pull.slug)}</h2>
            {pull.printing?.rarity.startsWith('Iconic ') && <p className="campaign-tabletop-variant">Alternate art · No. {pull.printing.num}</p>}
            <p>{packCardContext(run, pull.slug)}</p>
          </div>}
        </div>
        <div className="campaign-tabletop-lineup" style={{ '--pack-count': count } as CSSProperties} role="group" aria-label="Cards in this pack">
          {layout?.order.map((pullIndex, slot) => {
            const item = pulls[pullIndex];
            const face = visible.includes(slot);
            const turning = flip?.slot === slot && flip.phase !== 'saving';
            const name = displayName(item.slug);
            return <button key={slot} ref={slot === 0 ? firstSlot : undefined} type="button" className="campaign-tabletop-slot"
              data-face={face || undefined} data-flipping={turning || undefined} data-selected={active === slot || undefined}
              aria-pressed={face ? active === slot : undefined} aria-disabled={busy || !!flip || undefined}
              aria-label={face ? `Feature ${name}, card ${slot + 1}` : `Reveal card ${slot + 1}`}
              onClick={() => void selectSlot(slot)}
              onAnimationStart={event => {
                if (event.animationName === 'campaign-card-catch') showSlotFace(slot);
              }}
              onAnimationEnd={event => {
                if (event.animationName === 'campaign-card-flip') featureFlippedSlot(slot, event.currentTarget);
              }}>
              <span className="campaign-tabletop-card" aria-hidden="true">
                {(!face || turning) && <img className="campaign-tabletop-back" src={CARD_BACK} alt="" />}
                {(face || turning) && <span className="campaign-tabletop-front"><CampaignRewardArt pull={item} alt="" exact /></span>}
              </span>
            </button>;
          })}
        </div>
        <footer className="campaign-tabletop-actions">
          <button type="button" className="campaign-tabletop-link" disabled={busy || !!flip} onClick={back}>← Back to contract</button>
          {allRevealed && !flip && <button type="button" className="campaign-invitation-cta" disabled={busy}
            onClick={hasChoice ? () => void switchBonus(true) : finish}>{hasChoice ? 'Choose your bonus card' : finishLabel} <span aria-hidden="true">→</span></button>}
          {tools}
        </footer>
      </>}
    </div>
  </section>;
}
