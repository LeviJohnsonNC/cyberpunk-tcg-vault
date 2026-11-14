import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CARD_BACK } from '../components/bits';
import { BY_SLUG, defaultPrinting } from '../lib/data';
import { ENCOUNTERS, campaignPackLayout, type CampaignRun, type CampaignReward } from '../lib/play/campaign';
import { campaignPulls, packRarityLabel } from '../lib/play/campaignPack';
import { packCardContext } from '../lib/play/campaignPresentation';
import { packMaterial, packMaterialStyle } from '../lib/play/packMaterial';
import { getPrintingArt } from '../lib/printingArt';
import wrapperArt from '../assets/play/campaign-booster-foil.webp';
import { CampaignTimeline, type CampaignInspect } from './CampaignHub';
import { CampaignFeaturedCard } from './CampaignFeaturedCard';
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
  revealSound: (tier: RevealTier) => void;
  choose: (slug: string) => void;
  finish: () => void;
  inspect: CampaignInspect;
  back: () => void;
};

type RevealTier = 'standard' | 'rare' | 'foil';
function revealTier(rarity?: string): RevealTier {
  if (!rarity || rarity === 'Common' || rarity === 'Uncommon') return 'standard';
  return rarity === 'Rare' ? 'rare' : 'foil';
}

const flipDuration = 505;
const faceTime = 266;
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
  const [discovery, setDiscovery] = useState<number>();
  const [choice, setChoice] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [flip, setFlip] = useState<{ slot: number; phase: 'saving' | 'turning' | 'front' }>();
  const opener = useRef<HTMLButtonElement>(null);
  const stageTitle = useRef<HTMLHeadingElement>(null);
  const featured = useRef<HTMLButtonElement>(null);
  const firstSlot = useRef<HTMLButtonElement>(null);
  const lineup = useRef<HTMLDivElement>(null);
  const moveFrom = useRef<{ card: DOMRect; lineup: DOMRect }>(undefined);
  const openingRequest = useRef(false);
  const focusStage = useRef<'heading' | 'first-card'>(undefined);
  const flipLock = useRef(false);
  const sealed = !layout || opening;
  const peeling = opening && !!layout;
  const disabled = busy || requestPending || peeling;
  const visible = revealed.filter(slot => flip?.slot !== slot || flip.phase === 'front');
  const active = selected !== undefined && visible.includes(selected) ? selected
    : visible.findLast(slot => slot !== flip?.slot);
  const pull = layout && active !== undefined ? pulls[layout.order[active]] : undefined;
  const openingSpread = !pull && !bonus;
  const turningSlot = flip && flip.phase !== 'saving' ? flip.slot : undefined;

  useEffect(() => {
    // Warm exact printing art without making a save depend on the artwork host.
    for (const { slug, printing } of campaignPulls(reward)) {
      if (printing) void getPrintingArt(slug, printing.id).then(src => {
        if (src) {
          const image = new Image();
          image.decoding = 'async';
          image.referrerPolicy = 'no-referrer';
          image.src = src;
          void image.decode().catch(() => {});
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
    const target = focusStage.current === 'first-card' ? firstSlot.current : stageTitle.current;
    focusStage.current = undefined;
    target?.focus({ preventScroll: true });
  }, [sealed, busy, bonus, revealed.length]);

  useLayoutEffect(() => {
    const from = moveFrom.current;
    moveFrom.current = undefined;
    const card = featured.current;
    if (!from || !card || reducedMotion() || !card.animate) return;
    const to = card.getBoundingClientRect();
    const pose = card.querySelector<HTMLElement>('.campaign-tabletop-pose');
    const scale = from.card.width / to.width;
    const x = from.card.left + from.card.width / 2 - to.left - to.width / 2;
    const y = from.card.top + from.card.height / 2 - to.top - to.height / 2;
    const duration = 330;
    const easing = 'cubic-bezier(.22,.74,.25,1)';
    const flight = card.animate([
      { transform: `translate(${x}px, ${y}px) scale(${scale})` },
      { transform: 'none' },
    ], { duration, easing });
    const settlePose = pose?.animate([
      { transform: 'perspective(1050px) rotateX(12deg)' },
      { transform: getComputedStyle(pose).transform },
    ], { duration, easing });
    const row = lineup.current;
    const rowTo = row?.getBoundingClientRect();
    const slide = row && rowTo && row.animate([
      { transform: `translateY(${from.lineup.top - rowTo.top}px) scale(${from.lineup.width / rowTo.width})`, transformOrigin: 'top center' },
      { transform: 'none', transformOrigin: 'top center' },
    ], { duration: 285, easing: 'cubic-bezier(.2,.75,.22,1)' });
    const spotlight = card.parentElement;
    // The halo travels with the card; its shadow and light pool remain projected onto the table.
    const lightMotion = [...(spotlight?.querySelectorAll<HTMLElement>('.campaign-material-halo, .campaign-material-shadow, .campaign-material-spill, .campaign-material-reflection') ?? [])].map(layer => {
      const rest = getComputedStyle(layer).transform;
      return layer.animate([
        { transform: `translate(${x}px, ${y}px) scale(${scale}) ${rest === 'none' ? '' : rest}` },
        { transform: rest },
      ], { duration, easing });
    });
    spotlight?.setAttribute('data-in-flight', '');
    const lower = () => spotlight?.removeAttribute('data-in-flight');
    void flight.finished.then(lower, lower);
    const stop = () => { flight.cancel(); settlePose?.cancel(); slide?.cancel(); lightMotion.forEach(animation => animation.cancel()); lower(); };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange', stop);
    motion.addEventListener('change', stop);
    return () => {
      document.removeEventListener('visibilitychange', stop);
      motion.removeEventListener('change', stop);
      stop();
    };
  }, [active]);

  const showSlotFace = useEffectEvent((slot: number) => {
    if (!layout) return;
    revealSound(revealTier(pulls[layout.order[slot]].printing?.rarity));
    setFlip({ slot, phase: 'front' });
  });

  useLayoutEffect(() => {
    if (turningSlot === undefined) return;
    const row = lineup.current;
    const slot = row?.querySelector<HTMLButtonElement>('[data-flipping]');
    const card = slot?.querySelector<HTMLElement>('.campaign-tabletop-card');
    const front = slot?.querySelector<HTMLElement>('.campaign-tabletop-front');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let settled = false;
    function settle(animate = false) {
      if (settled) return;
      settled = true;
      if (animate && slot && row) {
        const face = front?.getBoundingClientRect() ?? slot.getBoundingClientRect();
        moveFrom.current = { card: face, lineup: row.getBoundingClientRect() };
      }
      setDiscovery(animate ? turningSlot : undefined);
      setSelected(turningSlot);
      setFlip(undefined);
      flipLock.current = false;
    }

    if (!card?.animate || motion.matches || document.hidden) {
      const frame = requestAnimationFrame(() => {
        if (!document.hidden) showSlotFace(turningSlot);
        settle();
      });
      return () => cancelAnimationFrame(frame);
    }

    const turn = card.animate([
      { transform: 'none', offset: 0 },
      { transform: 'translateY(-12px) scale(1.045)', offset: .20, easing: 'cubic-bezier(.34,0,.48,1)' },
      { transform: 'translateY(-18px) rotateY(90deg) scale(1.055)', offset: .48 },
      { transform: 'translateY(-10px) rotateY(180deg) scale(1.03)', offset: .77, easing: 'ease-out' },
      { transform: 'rotateY(180deg)', offset: 1 },
    ], { duration: flipDuration, fill: 'forwards' });

    // The back has passed edge-on before the rarity cue or surface highlight is shown.
    const faceTimer = setTimeout(() => { if (!settled && !document.hidden) showSlotFace(turningSlot); }, faceTime);
    const complete = () => {
      clearTimeout(faceTimer);
      settle();
    };
    motion.addEventListener('change', complete);
    document.addEventListener('visibilitychange', complete);
    void turn.finished.then(() => settle(true), complete);
    return () => {
      settled = true;
      clearTimeout(faceTimer);
      motion.removeEventListener('change', complete);
      document.removeEventListener('visibilitychange', complete);
      turn.cancel();
    };
  }, [turningSlot]);

  async function openSeal(keyboard: boolean) {
    if (disabled || openingRequest.current) return;
    openingRequest.current = true;
    setRequestPending(true);
    focusStage.current = keyboard ? 'first-card' : 'heading';
    if (!reducedMotion()) setOpening(true);
    try {
      if (!await tearSeal()) {
        setOpening(false);
        focusStage.current = undefined;
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
      setDiscovery(undefined);
      setSelected(slot);
      return;
    }
    flipLock.current = true;
    setFlip({ slot, phase: 'saving' });
    try {
      if (!await flipSlot(slot)) {
        setFlip(undefined);
        flipLock.current = false;
        return;
      }
    } catch {
      // A save failure must never leave the visual input lock engaged.
      setFlip(undefined);
      flipLock.current = false;
      return;
    }
    const tier = revealTier(pulls[layout.order[slot]].printing?.rarity);
    if (reducedMotion()) {
      revealSound(tier);
      setSelected(slot);
      setFlip(undefined);
      flipLock.current = false;
      return;
    }
    setFlip({ slot, phase: 'turning' });
  }

  async function switchBonus(show: boolean) {
    focusStage.current = 'heading';
    if (!await showBonus(show)) focusStage.current = undefined;
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
              <button ref={opener} type="button" className="campaign-seal-strip" disabled={disabled} onClick={event => void openSeal(event.detail === 0)}
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

  return <section className="campaign-tabletop" data-act={act} data-bonus={bonus || undefined} data-opening-spread={openingSpread || undefined} aria-labelledby="campaign-moment-title">
    <div className="campaign-tabletop-inner">
      {bonus ? <>
        <header className="campaign-bonus-head">
          <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> {retry ? 'House pack' : 'Final choice'}</p>
          <h1 id="campaign-moment-title" tabIndex={-1} ref={attachTitle}>{retry ? 'Pick an upgrade for the rematch' : 'One more for the crew'}<span aria-hidden="true">.</span></h1>
          <p>{retry ? 'Choose a card that fits your crew. You can swap it in before the rematch.' : `${count} cards secured. Choose one bonus card for your reserve.`}</p>
        </header>
        <div className="campaign-bonus-cards" style={{ '--offer-count': reward.offers.length } as CSSProperties} role="group" aria-label="Bonus cards">
          {reward.offers.map(slug => {
            const card = BY_SLUG.get(slug);
            const printing = card && defaultPrinting(card);
            const name = displayName(slug);
            const newToReserve = !retry && (run.inventory[slug] ?? 0) === 0 && card?.type !== 'Legend';
            const context = newToReserve ? 'New to your reserve' : packCardContext(run, slug);
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
          </header>
          {pull ? <CampaignFeaturedCard key={active} pull={pull} buttonRef={featured} discovery={discovery === active}
            inspect={() => inspect(pull.slug, pull.printing?.id)} /> : <div className="campaign-tabletop-spotlight" />}
          {pull && <div className="campaign-tabletop-copy" aria-live="polite">
            <p className="play-eyebrow" data-rarity={pull.printing?.rarity}>{[packRarityLabel(pull.printing?.rarity), BY_SLUG.get(pull.slug)?.color, BY_SLUG.get(pull.slug)?.type].filter(Boolean).join(' / ')}</p>
            <h2>{displayName(pull.slug)}</h2>
            {pull.printing?.rarity.startsWith('Iconic ') && <p className="campaign-tabletop-variant">Alternate art · No. {pull.printing.num}</p>}
            <p>{packCardContext(run, pull.slug)}</p>
          </div>}
        </div>
        <div ref={lineup} className="campaign-tabletop-lineup" style={{ '--pack-count': count } as CSSProperties} role="group" aria-label="Cards in this pack">
          {layout?.order.map((pullIndex, slot) => {
            const item = pulls[pullIndex];
            const face = visible.includes(slot);
            const turning = flip?.slot === slot && flip.phase !== 'saving';
            const name = displayName(item.slug);
            return <button key={slot} ref={slot === 0 ? firstSlot : undefined} type="button" className="campaign-tabletop-slot"
              style={face ? packMaterialStyle(item.printing?.rarity) : undefined}
              data-material={face ? packMaterial(item.printing?.rarity).name : undefined}
              data-face={face || undefined} data-rarity={face ? item.printing?.rarity : undefined} data-flipping={turning || undefined} data-selected={active === slot || undefined}
              aria-pressed={face ? active === slot : undefined} aria-disabled={busy || !!flip || undefined}
              aria-label={face ? `Feature ${name}, card ${slot + 1}` : `Reveal card ${slot + 1}`}
              onClick={() => void selectSlot(slot)}>
              <span className="campaign-tabletop-rest" aria-hidden="true">
                <span className="campaign-tabletop-card">
                  {(!face || turning) && <img className="campaign-tabletop-back" src={CARD_BACK} alt="" />}
                  {(face || turning) && <span className="campaign-tabletop-front"><CampaignRewardArt pull={item} alt="" exact showNameWhileLoading /></span>}
                </span>
              </span>
            </button>;
          })}
        </div>
        {openingSpread && <p className="campaign-tabletop-hint">Choose any card to turn it over.</p>}
        <footer className="campaign-tabletop-actions">
          <button type="button" className="campaign-tabletop-link" disabled={busy || !!flip} onClick={back}>← Back to contract</button>
          {allRevealed && !flip && <button type="button" className="campaign-invitation-cta" disabled={busy}
            onClick={hasChoice ? () => void switchBonus(true) : finish}>{hasChoice ? retry ? 'Choose a rematch upgrade' : 'Choose your bonus card' : finishLabel} <span aria-hidden="true">→</span></button>}
          {tools}
        </footer>
      </>}
    </div>
  </section>;
}
