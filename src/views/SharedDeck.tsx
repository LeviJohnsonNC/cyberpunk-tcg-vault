// Read-only view of a shared deck link (#/shared?deck=<token>). Works signed out. The comparison
// runs locally against the visitor's own collection; nothing about the visitor is sent anywhere.
import { useEffect, useMemo, useState } from 'react';
import { BY_SLUG, TYPES, printingLabel, type Card } from '../lib/data';
import { estimateText, money } from '../lib/currency';
import { newId, useStore } from '../lib/store';
import { openInBuilder } from '../lib/handoff';
import { compareDeck, copyForBuilder, loadShared, shareStatus, type LoadResult } from '../lib/share';
import { CardImg } from '../components/bits';
import { Masthead, MetricStrip } from '../components/ui';

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function SharedDeck({ token, onOpen, goAdd }: { token?: string; onOpen: (slug: string) => void; goAdd: () => void }) {
  const { owned, collectionReady, demo, mode, toast } = useStore();
  const [loaded, setLoaded] = useState<{ token?: string; res: LoadResult } | null>(null);
  const res = loaded && loaded.token === token ? loaded.res : null; // a new token shows loading

  useEffect(() => {
    let cancelled = false;
    loadShared(token ?? '').then((r) => !cancelled && setLoaded({ token, res: r }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const deck = res && 'deck' in res ? res.deck : null;
  const cmp = useMemo(() => (deck ? compareDeck(deck, owned) : null), [deck, owned]);

  if (!res) {
    return (
      <section aria-busy="true">
        <Masthead eyebrow="The Afterlife / Shared deck" title="Loading deck" />
        <p className="muted">Fetching the list…</p>
      </section>
    );
  }
  if (!deck) {
    return (
      <section>
        <Masthead eyebrow="The Afterlife / Shared deck" title="Link not found" />
        <div className="panel">
          <p style={{ marginTop: 0 }}>
            {'error' in res ? `Couldn't load this deck: ${res.error}` : "This link doesn't work. The owner may have replaced or revoked it, or it was copied incompletely."}
          </p>
          <a className="btn" href="#/builder">Open the Deck Builder</a>
        </div>
      </section>
    );
  }

  const status = shareStatus(deck);
  const mainN = sum(deck.cards);
  const sideN = sum(deck.sideboard);
  const ownedTotal = [...owned.values()].reduce((a, b) => a + b, 0);
  const shared = deck.createdAt ? new Date(deck.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

  const copy = () => {
    openInBuilder(copyForBuilder(deck, newId()));
  };
  const shoppingText = () =>
    cmp!.full.lines.map((l) => {
      const c = BY_SLUG.get(l.slug)!;
      return `${l.buy} ${c.name}${c.sub ? ` - ${c.sub}` : ''}`;
    }).join('\n');
  const copyShopping = async () => {
    try {
      await navigator.clipboard.writeText(shoppingText());
      toast('Shopping list copied');
    } catch {
      toast('Clipboard blocked by browser', 'err');
    }
  };

  const tiles = (zone: Record<string, number>) =>
    TYPES.filter((t) => t !== 'Legend').map((t) => ({
      t,
      items: Object.entries(zone)
        .map(([s, n]) => ({ c: BY_SLUG.get(s)!, n }))
        .filter((x) => x.c.type === t)
        .sort((a, b) => (a.c.cost ?? 0) - (b.c.cost ?? 0) || a.c.display.localeCompare(b.c.display)),
    })).filter((g) => g.items.length);

  const tile = (c: Card, n: number) => {
    const have = owned.get(c.slug) ?? 0;
    return (
      <button key={c.slug} className="pcard sd-tile" onClick={() => onOpen(c.slug)} aria-label={`${n} × ${c.display}. You own ${have}. Open details.`}>
        <CardImg slug={c.slug} alt={c.display} />
        <span className="tag inDeck">{n}×</span>
        {collectionReady && <span className="tag">own {have}</span>}
        <span className="name">{c.name}{c.sub ? <span className="csub"> · {c.sub}</span> : null}</span>
      </button>
    );
  };

  const sectionTag = (slug: string) => {
    const r = cmp!.rows.find((x) => x.slug === slug)!;
    return r.main && r.side ? 'Main + side' : r.side ? 'Sideboard' : BY_SLUG.get(slug)?.type === 'Legend' ? 'Legend' : 'Main';
  };

  return (
    <section className="shared-deck">
      <Masthead
        eyebrow="The Afterlife / Shared deck"
        title={deck.name}
        sub={
          <>
            <span className={`status-tag ${status.legal ? 'legal' : 'draft'}`}>{status.label}</span>
            <span className="sep" aria-hidden="true">◆</span> {plural(deck.legends.length, 'Legend')}
            <span className="sep" aria-hidden="true">◆</span> {mainN} main
            {sideN > 0 && <><span className="sep" aria-hidden="true">◆</span> {sideN} sideboard</>}
            {shared && <><span className="sep" aria-hidden="true">◆</span> shared {shared}</>}
          </>
        }
      >
        <button className="btn" onClick={copy}>Open a copy in Deck Builder</button>
      </Masthead>

      {deck.dropped.length > 0 && (
        <p className="share-note" role="note">
          {plural(deck.dropped.length, 'card')} in this link {deck.dropped.length === 1 ? "isn't" : "aren't"} in Fixer's card list yet, so {deck.dropped.length === 1 ? "it's" : "they're"} not shown or priced.
        </p>
      )}

      {/* Comparison: the page's main job */}
      <div className="panel hot section-gap" aria-busy={!collectionReady}>
        <div className="panel-title">
          Against your Vault
          <span className="aside">{demo ? 'Sample collection (demo mode)' : mode === 'cloud' ? 'Your account' : 'This browser'}</span>
        </div>
        {!collectionReady || !cmp ? (
          <p className="muted" style={{ margin: 0 }}>Loading your collection…</p>
        ) : (
          <>
            {demo && <p className="share-note">Demo mode is on, so this compares the deck with sample cards, not yours.</p>}
            {ownedTotal === 0 && !demo && (
              <p className="share-note">
                Your Vault is empty, so everything below counts as missing.{' '}
                <button className="linklike" onClick={goAdd}>Add your cards</button> to see what you'd actually need.
              </p>
            )}
            <p className={`sd-verdict ${cmp.canBuild ? 'ok' : ''}`}>
              {cmp.canBuild
                ? cmp.side.copies
                  ? `You can build this deck. The sideboard needs ${plural(cmp.side.copies, 'more card')}.`
                  : 'You can build this deck, sideboard included.'
                : `You're missing ${plural(cmp.play.copies, 'card')} to play this deck.`}
            </p>
            <MetricStrip
              items={[
                { label: 'Owned', context: 'Copies across the whole list', value: `${cmp.have}/${cmp.total}` },
                { label: 'To play it', context: 'Legends + main deck', value: estimateText(cmp.play) },
                ...(sideN > 0 ? [{ label: 'Plus sideboard', context: 'Copies beyond the main deck', value: estimateText(cmp.side) }] : []),
              ]}
            />
            {!status.legal && (
              <p className="tiny muted">Ownership and legality are separate: this is a Draft, so it may not be playable as listed even once you own it.</p>
            )}

            {cmp.full.lines.length > 0 && (
              <>
                <div className="group-h">Shopping list · {plural(cmp.full.copies, 'card')}</div>
                <div className="decklist sd-shop">
                  {cmp.full.lines.map((l) => {
                    const c = BY_SLUG.get(l.slug)!;
                    return (
                      <div key={l.slug} className={`dl-row ${c.color}`} title={l.quote ? `Quoted on ${printingLabel(l.quote.printingId, false)} (${l.quote.basis})` : 'No printing has a quote yet'}>
                        <span className="cost">{l.buy}×</span>
                        <span className="sd-shop-name">
                          <button className="link" onClick={() => onOpen(l.slug)}>{c.display}</button>
                          <span className="mono tiny muted"> {sectionTag(l.slug)}</span>
                        </span>
                        <span className="mono tiny hide-sm">{l.quote ? `${money(l.quote.cad)} ea` : ''}</span>
                        <span className={`mono tiny ${l.quote ? 'accent' : 'muted'}`}>{l.quote ? money(l.quote.cad * l.buy) : 'Unpriced'}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="tiny muted">Card prices before tax and shipping. Your owned copies are counted once, even when a card is in both the main deck and the sideboard.</p>
                <div className="row">
                  <button className="btn sm" onClick={copyShopping}>Copy shopping list</button>
                  <a className="btn sm quiet" href="https://www.tcgplayer.com/massentry?productline=Cyberpunk%20TCG" target="_blank" rel="noreferrer">TCGplayer mass entry ↗</a>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="panel section-gap">
        <div className="panel-title">Legends <span className="aside">{deck.legends.length}/3</span></div>
        {deck.legends.length ? (
          <div className="pool sd-legends">{deck.legends.map((s) => tile(BY_SLUG.get(s)!, 1))}</div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No Legends picked yet.</p>
        )}
      </div>

      <div className="panel section-gap">
        <div className="panel-title">Main deck <span className="aside">{mainN} cards</span></div>
        {mainN === 0 && <p className="muted" style={{ margin: 0 }}>No main deck cards yet.</p>}
        {tiles(deck.cards).map((g) => (
          <div key={g.t}>
            <div className="group-h">{g.t}s · {g.items.reduce((a, x) => a + x.n, 0)}</div>
            <div className="pool">{g.items.map((x) => tile(x.c, x.n))}</div>
          </div>
        ))}
      </div>

      {sideN > 0 && (
        <div className="panel section-gap">
          <div className="panel-title">Sideboard <span className="aside">{sideN} cards</span></div>
          <div className="pool">
            {Object.entries(deck.sideboard).map(([s, n]) => tile(BY_SLUG.get(s)!, n))}
          </div>
        </div>
      )}

      {status.issues.length > 0 && (
        <details className="panel section-gap">
          <summary className="panel-title">Why it's a Draft</summary>
          <ul className="checks">{status.issues.map((i) => <li key={i} className="bad">{i}</li>)}</ul>
        </details>
      )}

      <div className="row section-gap">
        <button className="btn ghost" onClick={copy}>Open a copy in Deck Builder</button>
        <span className="tiny muted">The copy is yours and private. Nothing is saved until you choose to.</span>
      </div>
    </section>
  );
}
