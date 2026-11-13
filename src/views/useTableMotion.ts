import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { CARD_BACK } from '../components/bits';
import legendBack from '../assets/play/legend-back.webp';
import { planMotion, tableAccents } from '../lib/play/matchMotion';
import type { MatchBeat, PlayerView } from '../lib/play/protocol';
import type { TableCue } from '../lib/play/tableSound';

/** Position of a table piece, relative to the table. */
interface Spot { x: number; y: number; w: number; h: number }
interface Piece { el: HTMLElement; spot: Spot; zone: string }

const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const tracked = '[data-card-id]';

function clone(el: HTMLElement, spot: Spot) {
  const node = el.cloneNode(true) as HTMLElement;
  for (const name of ['data-card-id', 'data-board-card', 'data-drop-zone', 'data-in-flight', 'data-striking', 'aria-label', 'title']) node.removeAttribute(name);
  node.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; img.decoding = 'sync'; });
  node.querySelectorAll('.play-float').forEach((float) => float.remove());
  node.style.cssText = `position:absolute;inset:0;width:${spot.w}px;height:${spot.h}px;margin:0;translate:none;rotate:none;scale:none;`;
  return node;
}

/**
 * Moves cards, dice and Eddies between the places React renders them. React
 * owns the resting layout; this hook only plays the journey between two of
 * them, on a layer above the table, and always ends on what React rendered.
 */
export function useTableMotion(root: RefObject<HTMLElement | null>, cue: {
  key: string; view: PlayerView; beat?: MatchBeat; reducedBeats?: MatchBeat[]; hasRolls?: boolean; enabled: boolean; pace: number; openingHand: boolean;
  sound?: (cue: TableCue, delayMs?: number, pan?: number) => (() => void) | undefined;
}) {
  const sounds = useRef<(() => void)[]>([]);
  const pieces = useRef<Map<string, Piece> | undefined>(undefined);
  const lastView = useRef<PlayerView | undefined>(undefined);
  const running = useRef<Set<() => void>>(new Set());
  const live = useRef(cue);
  const played = useRef<string | undefined>(undefined);
  useLayoutEffect(() => { live.current = cue; });

  // Presentation can be interrupted at any point without leaving a hidden card or a late flourish.
  useLayoutEffect(() => {
    if (cue.enabled) return;
    for (const finish of [...running.current]) finish();
    for (const stop of sounds.current.splice(0)) stop();
  }, [cue.enabled]);

  useEffect(() => {
    const settle = () => {
      for (const finish of [...running.current]) finish();
      for (const stop of sounds.current.splice(0)) stop();
      if (root.current) pieces.current = measure(root.current);
    };
    document.addEventListener('visibilitychange', settle);
    window.addEventListener('resize', settle);
    return () => { document.removeEventListener('visibilitychange', settle); window.removeEventListener('resize', settle); };
  }, [root]);

  // Resting positions change with the window. Re-measure quietly so the next move starts from the truth.
  useEffect(() => {
    const table = root.current;
    if (!table) return;
    const remeasure = () => { if (!running.current.size) pieces.current = measure(table); };
    const observer = new ResizeObserver(remeasure);
    observer.observe(table);
    table.addEventListener('scroll', remeasure, true);
    return () => {
      observer.disconnect();
      table.removeEventListener('scroll', remeasure, true);
    };
  }, [root]);

  useEffect(() => () => {
    for (const finish of [...running.current]) finish();
    // Leave nothing behind, so a remount (or development's repeated mount) starts from a fresh table.
    for (const stop of sounds.current.splice(0)) stop();
    played.current = undefined; pieces.current = undefined; lastView.current = undefined;
  }, []);

  useLayoutEffect(() => {
    const table = root.current;
    // A repeated effect for the same frame (development double-invocation) must not cancel its own motion.
    if (!table || !live.current.key || played.current === live.current.key) return;
    played.current = live.current.key;
    for (const finish of [...running.current]) finish();
    // Sounds queued for motion that was just cut short would arrive late and out of place.
    for (const stop of sounds.current.splice(0)) stop();
    const { view, beat, reducedBeats, hasRolls, enabled, pace, openingHand, sound } = live.current;
    const before = pieces.current, previousView = lastView.current;
    const next = measure(table);
    pieces.current = next;
    lastView.current = view;
    if (document.hidden) return;
    if (!enabled) {
      // Reduced motion changes the presentation, not the player's independent sound preference.
      if (previousView) {
        const accents = tableAccents(previousView, view);
        const plan = planMotion(previousView, view, beat);
        const cues = new Set<TableCue>();
        const combatBeats = reducedBeats?.filter(beat => beat.combatKillIds?.length) ?? [];
        const combatKills = new Set(combatBeats.flatMap(beat => beat.combatKillIds ?? []));
        const playedCard = reducedBeats?.some((beat) => beat.playedCardIds?.length);
        if (hasRolls) cues.add('dice-roll');
        combatBeats.forEach((_, index) => { const stop = sound?.('unit-kill', index * 180); if (stop) sounds.current.push(stop); });
        if (playedCard) cues.add('card-play');
        for (const accent of accents) {
          if (accent.kind === 'land' && !playedCard) cues.add('play');
        }
        if (plan.strike && !combatKills.size) cues.add('hit');
        if (plan.defeated.some((id) => !combatKills.has(id))) cues.add('defeat');
        for (const cue of [...cues].slice(0, 3)) { const stop = sound?.(cue); if (stop) sounds.current.push(stop); }
      }
      return;
    }
    const layer = flightLayer(table);
    const anchor = (key?: string) => {
      const el = key ? table.querySelector<HTMLElement>(`[data-anchor="${key}"]`) : null;
      if (!el) return;
      const offset = spotOf(el, table);
      if (offset) return offset;
      const rect = el.getBoundingClientRect(), bounds = table.getBoundingClientRect();
      if (rect.width && rect.height) return {
        x: rect.left - bounds.left - table.clientLeft + rect.width / 2,
        y: rect.top - bounds.top - table.clientTop + rect.height / 2,
        w: rect.width, h: rect.height,
      };
    };
    const track = (animations: Animation[], cleanup: () => void) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        running.current.delete(finish);
        for (const animation of animations) animation.cancel();
        cleanup();
      };
      running.current.add(finish);
      void Promise.all(animations.map((animation) => animation.finished)).then(finish, () => undefined);
    };
    const time = (ms: number) => Math.round(ms * pace);
    const heard = new Map<TableCue, number>();
    // A sound marks a moment on the table. Repeats of one cue in a frame are capped so a full deal doesn't clatter.
    const say = (cue: TableCue, delay: number, pan = 0) => {
      const count = heard.get(cue) ?? 0;
      if (count >= 2) return;
      heard.set(cue, count + 1);
      const stop = sound?.(cue, delay, pan);
      if (stop) sounds.current.push(stop);
    };

    const arrivals = new Map<string, number>();
    function fly(piece: Piece, from: Spot, options: { delay?: number; back?: string; showcase?: boolean; duration?: number; cue?: TableCue } = {}) {
      if (piece.el.dataset.cardId) arrivals.set(piece.el.dataset.cardId, (options.delay ?? 0) + time(options.showcase ? 1080 : options.duration ?? 420));
      if (options.cue) say(options.cue, (options.delay ?? 0) + time(options.showcase ? 1080 : (options.duration ?? 420) * .8), piece.zone.endsWith('rival') ? .24 : -.24);
      const to = piece.spot;
      const wrap = document.createElement('div');
      wrap.className = 'play-flight';
      wrap.style.cssText = `left:${to.x - to.w / 2}px;top:${to.y - to.h / 2}px;width:${to.w}px;height:${to.h}px;--w:${to.w}px;`;
      const flip = document.createElement('div');
      flip.className = 'play-flight-flip';
      flip.append(clone(piece.el, to));
      if (options.back) {
        const back = document.createElement('div');
        back.className = 'play-flight-back';
        back.style.backgroundImage = `url(${options.back})`;
        flip.append(back);
      }
      wrap.append(flip);
      layer.append(wrap);
      piece.el.dataset.inFlight = '';
      const start = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w})`;
      const end = restingTransform(piece.el.parentElement);
      const delay = options.delay ?? 0;
      const animations: Animation[] = [];
      if (options.showcase) {
        const scale = Math.min(2.1, 250 / to.w);
        const stage = `translate(${table!.offsetWidth / 2 - to.x}px, ${table!.offsetHeight * 0.4 - to.y}px) scale(${scale})`;
        animations.push(wrap.animate([
          { transform: start, easing: EASE }, { transform: stage, offset: 0.3 },
          { transform: stage, offset: 0.7, easing: 'cubic-bezier(.5, 0, .3, 1)' }, { transform: end },
        ], { duration: time(1150), delay, fill: 'backwards' }));
        if (options.back) animations.push(flip.animate([{ transform: 'rotateY(180deg)' }, { transform: 'none', offset: 0.26 }, { transform: 'none' }],
          { duration: time(1150), delay, fill: 'backwards', easing: 'ease-out' }));
      } else {
        const duration = time(options.duration ?? 420);
        animations.push(wrap.animate([{ transform: start }, { transform: end }], { duration, delay, fill: 'backwards', easing: EASE }));
        if (options.back) animations.push(flip.animate([{ transform: 'rotateY(180deg)' }, { transform: 'none' }],
          { duration, delay, fill: 'backwards', easing: 'ease-out' }));
      }
      track(animations, () => { wrap.remove(); delete piece.el.dataset.inFlight; });
    }

    function leave(piece: Piece, to: Spot | undefined, options: { defeated: boolean; delay: number; combatKill: boolean }) {
      if (options.defeated && !options.combatKill) say('defeat', options.delay + time(140));
      const from = piece.spot;
      const wrap = document.createElement('div');
      wrap.className = 'play-flight';
      if (options.defeated) wrap.dataset.kind = 'defeat';
      wrap.style.cssText = `left:${from.x - from.w / 2}px;top:${from.y - from.h / 2}px;width:${from.w}px;height:${from.h}px;--w:${from.w}px;--delay:${options.delay}ms;--duration:${time(900)}ms;`;
      wrap.append(clone(piece.el, from));
      layer.append(wrap);
      const away = to ? `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${Math.max(0.25, Math.min(1, to.w / from.w))})` : 'translateY(-26px) scale(.9)';
      const frames: Keyframe[] = options.defeated ? [
        { transform: 'none', filter: 'none', opacity: 1 },
        { transform: 'translate(-7px, 2px) rotate(-3deg)', filter: 'brightness(2.3) saturate(1.4)', offset: 0.1 },
        { transform: 'translate(7px, -2px) rotate(3deg)', filter: 'brightness(1.5)', offset: 0.2 },
        { transform: 'translate(-3px, 1px) rotate(-1deg)', filter: 'grayscale(.9) brightness(.65)', offset: 0.32 },
        { transform: 'rotate(-5deg) translateY(5px)', filter: 'grayscale(1) brightness(.5)', opacity: 1, offset: 0.55, easing: 'ease-in' },
        { transform: `${away} rotate(-16deg)`, filter: 'grayscale(1) brightness(.4)', opacity: 0 },
      ] : [{ transform: 'none', opacity: 1 }, { transform: away, opacity: to ? 0.35 : 0 }];
      const animation = wrap.animate(frames, { duration: time(options.defeated ? 900 : 440), delay: options.delay,
        fill: 'forwards', easing: options.defeated ? 'linear' : 'cubic-bezier(.5, 0, .8, .4)' });
      track([animation], () => wrap.remove());
      return wrap;
    }

    if (!before || !previousView) {
      if (openingHand) {
        const deck = anchor('deck:player');
        let dealt = 0;
        for (const piece of next.values()) if (deck && piece.zone === 'hand:player') {
          fly(piece, deck, { delay: 90 * dealt++, back: CARD_BACK, duration: 460 });
        }
      }
      return;
    }

    // Setup reshuffles hidden cards behind the scenes. Only the hand visibly changes there.
    const settingUp = previousView.gamePhase === 'setup' || view.gamePhase === 'setup';
    const moves = (zone: string) => !settingUp || zone === 'hand:player';
    const plan = planMotion(previousView, view, beat);
    const accents = tableAccents(previousView, view);
    const publicCards = Object.values(view.players).flatMap((seat) => Object.values(seat.zones).flatMap((zone) => Array.isArray(zone) ? zone : []));
    const playedCards = new Set(beat?.playedCardIds);
    const arrivalCue = (id: string): TableCue => {
      if (playedCards.delete(id)) return 'card-play';
      const card = publicCards.find((card) => card.instanceId === id);
      return card?.attachedToId ? 'equip' : card?.type === 'program' ? 'program' : 'play';
    };
    if (!previousView.attackState && view.attackState) say('attack', 0);
    if (previousView.turnNumber === view.turnNumber && publicCards.some((card) => !card.spent && Object.values(previousView.players).some((seat) => Object.values(seat.zones).some((zone) => Array.isArray(zone) && zone.some((old) => old.instanceId === card.instanceId && old.spent))))) say('ready', 0);

    // A Gig die being rolled has its own journey across the table.
    const rolled = new Set(beat?.gigRolls.map((roll) => roll.dieId));
    const strike = plan.strike;
    const striker = strike && (next.get(strike.attackerId) ?? before.get(strike.attackerId));
    const struck = strike && (strike.targetId ? next.get(strike.targetId)?.spot ?? before.get(strike.targetId)?.spot
      : spotOf(table.querySelector<HTMLElement>(`[data-zone="${strike.targetZone}"]`), table));
    // Give a freshly declared attack a beat on the table before it connects.
    const windup = striker && struck ? (previousView.attackState ? 60 : 320) : 0;
    const impact = windup + time(200);

    let entered = 0;
    for (const [id, piece] of next) {
      if (!moves(piece.zone) || rolled.has(id)) continue;
      const earlier = before.get(id);
      if (earlier) {
        if (accents.some((accent) => accent.kind === 'legend' && accent.cardId === id)) {
          fly(piece, piece.spot, { back: legendBack, duration: 400 });
          continue;
        }
        const moved = Math.hypot(earlier.spot.x - piece.spot.x, earlier.spot.y - piece.spot.y);
        if (earlier.zone !== piece.zone || earlier.el !== piece.el) {
          const arriving = piece.zone.split(':')[0];
          if (moved > 3) fly(piece, earlier.spot, { delay: id === strike?.attackerId ? impact : 0,
            cue: !['eddies', 'gigs'].includes(arriving) && earlier.zone === 'hand:player' ? arrivalCue(id) : undefined });
        } else if (moved > 3 && id !== strike?.attackerId) {
          const animation = piece.el.animate([{ transform: `translate(${earlier.spot.x - piece.spot.x}px, ${earlier.spot.y - piece.spot.y}px)` }, { transform: 'none' }],
            { duration: time(280), easing: EASE });
          track([animation], () => undefined);
        }
        continue;
      }
      if (id.startsWith('pool:')) continue;
      const [kind, seat] = piece.zone.split(':');
      const from = kind === 'hand' ? anchor('deck:player') : seat === 'rival' && ['field', 'resolving', 'eddies'].includes(kind) ? anchor('hand:rival') : undefined;
      if (from) fly(piece, from, { delay: 70 * entered++, back: kind !== 'eddies' ? CARD_BACK : undefined, showcase: plan.showcase.includes(id),
        cue: kind === 'hand' || kind === 'eddies' ? undefined : arrivalCue(id) });
      else track([piece.el.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: time(260), easing: EASE })], () => undefined);
    }

    // An instant Program may go straight to trash without a landing animation.
    if (playedCards.size) say('card-play', time(80), beat?.seat === 'rival' ? .24 : -.24);

    // Short, local finishes ride alongside the existing journey. They never extend a beat or own input.
    for (const accent of accents) {
      const piece = next.get(accent.cardId);
      if (!piece) continue;
      const cash = accent.kind === 'cash';
      const target = cash ? table.querySelector<HTMLElement>(`[data-zone="eddies:${accent.seat}"] .play-eddies-total`) : piece.el;
      const spot = cash ? spotOf(target, table) : piece.spot;
      if (!spot) continue;
      const delay = arrivals.get(accent.cardId) ?? time(120);
      const finish = document.createElement('div');
      finish.className = 'play-accent';
      finish.dataset.kind = accent.kind;
      finish.dataset.seat = accent.seat;
      finish.style.cssText = `left:${spot.x - spot.w / 2}px;top:${spot.y - spot.h / 2}px;width:${spot.w}px;height:${spot.h}px;`;
      if (cash) {
        const stamp = document.createElement('span');
        stamp.className = 'play-cash-stamp';
        stamp.textContent = '€$';
        finish.append(stamp);
      } else {
        const foil = document.createElement('span');
        foil.className = 'play-foil';
        const window = document.createElement('span');
        window.className = 'play-foil-window';
        window.append(foil);
        finish.append(window);
        for (let i = 0; i < 4; i++) {
          const corner = document.createElement('i');
          finish.append(corner);
        }
      }
      layer.append(finish);
      const duration = time(accent.kind === 'legend' ? 650 : 480);
      const animations = [finish.animate([
        { opacity: 0, transform: 'scale(.94)' },
        { opacity: 1, transform: 'scale(1.025)', offset: .18 },
        { opacity: .75, transform: 'scale(1)', offset: .55 },
        { opacity: 0, transform: cash ? 'translateY(-9px) scale(1)' : 'scale(1.04)' },
      ], { duration, delay, fill: 'both', easing: EASE })];
      const foil = finish.querySelector('.play-foil');
      if (foil) animations.push(foil.animate([
        { transform: 'translateX(-110%) skewX(-18deg)' }, { transform: 'translateX(110%) skewX(-18deg)' },
      ], { duration, delay, fill: 'both', easing: 'cubic-bezier(.3, 0, .25, 1)' }));
      if (target) animations.push(target.animate([
        { scale: '1' }, { scale: cash ? '1.14' : '1.045', offset: .2 }, { scale: '1' },
      ], { duration: time(240), delay, easing: EASE }));
      track(animations, () => finish.remove());
    }

    const combatKills = new Set(beat?.combatKillIds);
    const ghosts = new Map<string, HTMLElement>();
    for (const [id, piece] of before) {
      if (next.has(id) || id.startsWith('pool:') || !moves(piece.zone)) continue;
      const defeated = plan.defeated.includes(id);
      ghosts.set(id, leave(piece, anchor(plan.destinations[id]), { defeated, combatKill: combatKills.has(id), delay: striker && (defeated || id === strike?.attackerId) ? impact + time(id === strike?.attackerId ? 260 : 0) : 0 }));
    }

    if (combatKills.size) say('unit-kill', striker && struck ? impact : time(140));
    if (strike && striker && struck) {
      const dx = struck.x - striker.spot.x, dy = struck.y - striker.spot.y;
      const reach = Math.min(0.62, 230 / Math.max(1, Math.hypot(dx, dy)));
      const body = next.has(strike.attackerId) ? striker.el : ghosts.get(strike.attackerId);
      if (body) {
        if (body === striker.el) body.dataset.striking = '';
        const lunge = body.animate([
          { transform: 'none' }, { transform: `translate(${-dx * 0.06}px, ${-dy * 0.06}px) scale(1.04)`, offset: 0.22, easing: 'cubic-bezier(.6, 0, .9, .3)' },
          { transform: `translate(${dx * reach}px, ${dy * reach}px) scale(1.1)`, offset: 0.5, easing: EASE }, { transform: 'none' },
        ], { duration: time(400), delay: windup });
        track([lunge], () => { delete body.dataset.striking; });
      }
      const burst = document.createElement('div');
      if (!combatKills.size) say('hit', impact);
      burst.className = 'play-impact';
      burst.style.cssText = `left:${struck.x}px;top:${struck.y}px;animation-delay:${impact}ms;animation-duration:${time(520)}ms;`;
      layer.append(burst);
      const shake = table.animate([
        { transform: 'none' }, { transform: 'translate(5px, -3px)' }, { transform: 'translate(-4px, 3px)' },
        { transform: 'translate(3px, 1px)' }, { transform: 'translate(-1px, -1px)' }, { transform: 'none' },
      ], { duration: time(300), delay: impact });
      const target = strike.targetId ? next.get(strike.targetId)?.el : table.querySelector<HTMLElement>(`[data-zone="${strike.targetZone}"]`);
      const flash = target?.animate([{ filter: 'brightness(2.4)' }, { filter: 'none' }], { duration: time(320), delay: impact, easing: 'ease-out' });
      track(flash ? [shake, flash] : [shake], () => undefined);
      const timer = window.setTimeout(() => burst.remove(), impact + time(560));
      running.current.add(function finish() { running.current.delete(finish); clearTimeout(timer); burst.remove(); });
    }
  }, [cue.key, root]);
}

/** Layout position inside the table. Offsets ignore hover lifts, fan angles and running animations. */
function spotOf(el: HTMLElement | null, table: HTMLElement): Spot | undefined {
  if (!el || !el.offsetWidth || !el.offsetHeight) return;
  let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
  for (let node: HTMLElement | null = el; node && node !== table;) {
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent || !table.contains(parent)) return;
    x += node.offsetLeft + (parent === table ? 0 : parent.clientLeft - parent.scrollLeft);
    y += node.offsetTop + (parent === table ? 0 : parent.clientTop - parent.scrollTop);
    node = parent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** The fan angle and offset a card settles into, so a flight lands exactly on it. */
function restingTransform(shell: HTMLElement | null) {
  if (!shell) return 'none';
  const { translate, rotate } = getComputedStyle(shell);
  const parts = [translate && translate !== 'none' && `translate(${translate.split(' ').join(', ')})`, rotate && rotate !== 'none' && `rotate(${rotate})`].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}

function measure(table: HTMLElement) {
  const found = new Map<string, Piece>();
  for (const el of table.querySelectorAll<HTMLElement>(tracked)) {
    if (el.closest('dialog, .play-flight-layer')) continue;
    const spot = spotOf(el, table);
    const zone = el.closest<HTMLElement>('[data-zone]')?.dataset.zone;
    if (spot && zone && el.dataset.cardId) found.set(el.dataset.cardId, { el, spot, zone });
  }
  return found;
}

function flightLayer(table: HTMLElement) {
  let layer = table.querySelector<HTMLElement>(':scope > .play-flight-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'play-flight-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    table.append(layer);
  }
  return layer;
}
