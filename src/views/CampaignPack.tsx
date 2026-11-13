import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { CardImg, CARD_BACK, Rules } from '../components/bits';
import { BY_SLUG, imageUrl } from '../lib/data';
import { ENCOUNTERS, type CampaignRun, type CampaignReward } from '../lib/play/campaign';
import { campaignPulls, packRarityLabel } from '../lib/play/campaignPack';
import { packCardContext } from '../lib/play/campaignPresentation';
import { getPrintingArt } from '../lib/printingArt';
import wrapperArt from '../assets/play/campaign-booster-foil.webp';
import { CampaignTimeline, type CampaignInspect } from './CampaignHub';
import { CampaignRewardArt } from './CampaignRewardArt';
import { CampaignDispatch } from './CampaignStory';
import './campaign-pack-scene.css';

type PackProps = {
  run: CampaignRun;
  reward: CampaignReward;
  busy: boolean;
  titleRef: Ref<HTMLHeadingElement>;
  tools: ReactNode;
  revealTo: (count: number) => Promise<boolean>;
  choose: (slug: string) => void;
  finish: () => void;
  inspect: CampaignInspect;
  back: () => void;
};

export function CampaignPack({ run, reward, busy, titleRef, tools, revealTo, choose, finish, inspect, back }: PackProps) {
  const retry = run.phase === 'retryReward';
  const hasChoice = reward.offers.length > 0;
  const result = retry ? run.aftermath?.outcome === 'draw' ? 'Match drawn' : 'Contract lost' : 'Contract won';
  const finishLabel = retry ? 'Review my new cards' : 'Open Champion’s Cache';
  const reveal = run.revealed ?? 0;
  const pulls = campaignPulls(reward);
  const count = pulls.length;
  const encounter = ENCOUNTERS[run.encounter];
  const [selected, setSelected] = useState<{ index: number; reveal: number }>();
  const [opening, setOpening] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const choicePanel = useRef<HTMLDivElement>(null);
  const revealControl = useRef<HTMLButtonElement>(null);
  const openingRequest = useRef(false);
  const transferFocus = useRef(false);
  const sealed = reveal === 0 || opening;
  const peeling = opening && reveal > 0;
  const disabled = busy || requestPending || peeling;

  useEffect(() => {
    // Warm the saved printing art without making opening depend on its network request.
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
    for (const slug of reward.offers) {
      const image = new Image();
      image.decoding = 'async';
      image.src = imageUrl(slug);
    }
  }, [reward]);

  useEffect(() => {
    if (!peeling) return;
    const timer = setTimeout(() => setOpening(false), 340);
    return () => clearTimeout(timer);
  }, [peeling]);

  useEffect(() => {
    if (!sealed && !busy && transferFocus.current) {
      transferFocus.current = false;
      revealControl.current?.focus();
    }
  }, [sealed, busy, reveal]);

  async function open(to: number) {
    if (disabled || openingRequest.current) return;
    if (reveal) {
      if (to === count) transferFocus.current = true;
      if (!await revealTo(to)) transferFocus.current = false;
      return;
    }
    openingRequest.current = true;
    setRequestPending(true);
    transferFocus.current = true;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setOpening(true);
    try {
      if (!await revealTo(to)) {
        setOpening(false);
        transferFocus.current = false;
        requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
      }
    } finally {
      openingRequest.current = false;
      setRequestPending(false);
    }
  }

  const head = <header className="campaign-board-header">
    <div>
      <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> Campaign</p>
      <h1 id="campaign-moment-title" tabIndex={-1} ref={titleRef}>{result}<span aria-hidden="true">.</span></h1>
    </div>
    {!sealed && tools}
  </header>;

  if (sealed) return <section className="campaign-seal-scene" data-act={Math.floor(run.encounter / 3) + 1} data-encounter={encounter.id}
    aria-labelledby="campaign-moment-title">
    <div className="campaign-seal-layout">
      {head}
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
              <button ref={opener} type="button" className="campaign-seal-strip" disabled={disabled} onClick={() => void open(1)}
                aria-label="Tear the seal and reveal the first card" aria-busy={requestPending || undefined}>
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

  const active = selected?.reveal === reveal ? selected.index : Math.min(reveal, count) - 1;
  const pull = pulls[active];
  const { slug, printing } = pull;
  const card = BY_SLUG.get(slug);
  const rarity = printing?.rarity;
  const alternateArt = rarity?.startsWith('Iconic ');
  const allRevealed = reveal >= count;

  return <section className="campaign-board-moment" aria-labelledby="campaign-moment-title">
    {head}
    <CampaignTimeline run={run} />
    <button type="button" className="btn quiet campaign-back-from-pack" disabled={busy} onClick={back}>← Back to contract</button>
    <section className="campaign-reward campaign-pack panel hot" aria-label="Earned pack">
      <div className="campaign-section-heading"><div><p className="play-eyebrow">{encounter.title} / {retry ? 'House pack' : 'Contract cleared'}</p><h2>Your take.</h2></div></div>
      <div className="campaign-pack-stage">
        <aside className="campaign-pack-receipt">
          <span className="campaign-reveal-count" role="status">{reveal} / {count} revealed</span>
          <div className="campaign-pack-actions">
            <button ref={revealControl} className="btn" disabled={busy} onClick={() => {
              if (!allRevealed) void open(reveal + 1);
              else if (!hasChoice) finish();
              else { choicePanel.current?.scrollIntoView({ block: 'start' }); choicePanel.current?.focus({ preventScroll: true }); }
            }}>{allRevealed ? hasChoice ? 'Choose your bonus card ↓' : finishLabel : 'Reveal next card'}</button>
            {!allRevealed && <button className="btn quiet" disabled={busy} onClick={() => void open(count)}>Reveal all</button>}
          </div>
          <small>Your pack is saved. You can leave and come back.</small>
        </aside>
        <div className="campaign-reveal-spotlight" data-rarity={rarity}>
          <button className="campaign-reveal-art" key={`${active}:${slug}`} onClick={() => inspect(slug, printing?.id)}
            aria-label={`Inspect ${card?.display ?? slug}`}>
            <CampaignRewardArt pull={pull} alt={card?.display ?? slug} /><span className="campaign-inspect-caption">Inspect card ↗</span>
          </button>
        </div>
        <div className="campaign-reveal-copy" aria-live="polite">
          <p className="play-eyebrow">{card?.color} / {card?.type}</p>
          <p className="campaign-reveal-rarity" data-rarity={rarity}><b>{packRarityLabel(rarity)}</b>
            {alternateArt && <span>Alternate art · No. {printing?.num}</span>}</p>
          <h3>{card?.display ?? slug}</h3>
          <p className="campaign-card-facts">Cost {card?.cost ?? '—'} · RAM {card?.ram ?? '—'}{card?.sellable ? ' · Sellable' : ''}</p>
          <p className="campaign-rules"><Rules text={card?.text ?? 'Card details unavailable.'} /></p>
          <p className="campaign-fit">{packCardContext(run, slug)}</p>
          <small>+1 in reserve · {run.inventory[slug]} earned total</small>
        </div>
      </div>
      <div className="campaign-pack-fan" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} aria-label="Cards in this pack">
        {pulls.map((item, index) => <button key={`${index}:${item.slug}`} className="campaign-pack-pocket" data-selected={active === index}
          data-hidden={index >= reveal} disabled={busy || index > reveal}
          onClick={() => index < reveal ? setSelected({ index, reveal }) : void open(index + 1)}
          aria-label={index < reveal ? `View ${BY_SLUG.get(item.slug)?.display ?? item.slug}` : index === reveal ? `Reveal card ${index + 1}` : `Card ${index + 1}, sealed`}>
          {index < reveal ? <CampaignRewardArt pull={item} alt="" /> : <img src={CARD_BACK} alt="" />}
          <span>{index < reveal ? BY_SLUG.get(item.slug)?.name : 'Sealed'}</span>
        </button>)}
      </div>
      {allRevealed && hasChoice && <div className="campaign-choice" ref={choicePanel} tabIndex={-1}>
        <div className="campaign-section-heading"><div><p className="play-eyebrow">One final decision</p><h3>Make the bonus count.</h3></div>
          <span>Choose 1 of {reward.offers.length}</span></div>
        <p>Pick one for your reserve. Your current deck stays as it is until you edit it.</p>
        <div className="campaign-choice-grid">{reward.offers.map(item => {
          const offered = BY_SLUG.get(item);
          return <article key={item}>
            <button className="campaign-choice-art" onClick={() => inspect(item)} aria-label={`Inspect ${offered?.display}`}><CardImg slug={item} alt="" /></button>
            <div>
              <p className="play-eyebrow">{offered?.color} / {offered?.type}</p><h4>{offered?.display}</h4>
              <p className="campaign-card-facts">{offered?.type === 'Legend' ? `Crew · RAM ${offered.ram}` : `Cost ${offered?.cost ?? '—'} · RAM ${offered?.ram ?? '—'}${offered?.sellable ? ' · Sellable' : ''}`}</p>
              <p className="campaign-choice-rules"><Rules text={offered?.text ?? ''} /></p>
              <p className="campaign-fit">{packCardContext(run, item)}</p>
              <button className="btn quiet" onClick={() => inspect(item)}>Full card details</button>
              <button className="btn" disabled={busy} onClick={() => choose(item)}>Keep this card</button>
            </div>
          </article>;
        })}</div>
      </div>}
    </section>
  </section>;
}
