import type { ReactNode } from 'react';
import type { RivalDialogueState } from '../lib/play/rivalDialogue';
import './rival-seat.css';

export function RivalSeat({ name, role, quote, children }: {
  name: string; role: string; quote?: RivalDialogueState['line']; children: ReactNode;
}) {
  return <div className="play-rival-seat">
    {children}
    <div className="play-rival-caption">
      <p className="play-eyebrow">{role}</p>
      <strong title={name}>{name}<span aria-hidden="true">.</span></strong>
      <div aria-live="polite">{quote && <p key={quote.sequence}>“{quote.text}”</p>}</div>
    </div>
  </div>;
}
