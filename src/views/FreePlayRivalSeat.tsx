import { useId, useRef } from 'react';
import type { freePlayRivalProfile } from '../lib/play/freePlayDialogue';
import type { RivalDialogueState } from '../lib/play/rivalDialogue';
import { FreePlayRivalPortrait } from './FreePlayRivalPortrait';
import { RivalSeat } from './RivalSeat';

export function FreePlayRivalSeat({ profile, deckName, quote, enabled, toggle }: {
  profile: ReturnType<typeof freePlayRivalProfile>; deckName: string; quote?: RivalDialogueState['line'];
  enabled: boolean; toggle: () => void;
}) {
  const { name, role, summary, portrait } = profile;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const title = useId();
  return <RivalSeat name={name} role={role} quote={enabled ? quote : undefined}>
    <button ref={trigger} type="button" className="play-rival-trigger" aria-label={`View ${name}’s profile`} aria-haspopup="dialog"
      onClick={() => { dialog.current?.showModal(); heading.current?.focus({ preventScroll: true }); }}>
      <span className="play-rival-seat-portrait" aria-hidden="true">
        <span className="free-play-rival-mark">◆</span>
        {portrait && <FreePlayRivalPortrait portrait={portrait} priority />}
      </span>
    </button>
    <dialog ref={dialog} className="al-dialog free-play-rival-profile" aria-labelledby={title}
      onClose={() => trigger.current?.focus({ preventScroll: true })}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="al-dialog-body">
        <header>
          <p className="play-eyebrow">{role}</p>
          <h2 ref={heading} id={title} tabIndex={-1}>{name}</h2>
          {name !== deckName && <p>{deckName}</p>}
        </header>
        {summary && <p>{summary}</p>}
        {enabled && quote && <blockquote>“{quote.text}”</blockquote>}
        <div className="play-actions">
          <button type="button" className="btn quiet" aria-pressed={enabled} onClick={toggle}>Rival dialogue <span>{enabled ? 'On' : 'Off'}</span></button>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>Return to match</button>
        </div>
      </div>
    </dialog>
  </RivalSeat>;
}
