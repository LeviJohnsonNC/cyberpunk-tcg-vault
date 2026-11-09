// In-app feedback: a native <dialog> form that writes to the Supabase `feedback` table
// (insert-only for everyone; read it in the Supabase Table Editor). Falls back to GitHub Issues.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const KINDS = [
  { id: 'idea', label: 'Idea' },
  { id: 'bug', label: 'Bug' },
  { id: 'cards', label: 'Card or price data' },
  { id: 'other', label: 'Other' },
] as const;
type Kind = (typeof KINDS)[number]['id'];
export const ISSUES_URL = 'https://github.com/LeviJohnsonNC/cyberpunk-tcg-vault/issues/new';

export function FeedbackDialog({ open, onClose, page }: { open: boolean; onClose: () => void; page: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [kind, setKind] = useState<Kind>('idea');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [trap, setTrap] = useState(''); // honeypot: real people never see or fill this
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setState('idle');
      d.showModal();
      textRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trap) return setState('sent');
    if (message.trim().length < 3 || !supabase) return;
    setState('sending');
    const { error: err } = await supabase.from('feedback').insert({
      kind,
      message: message.trim().slice(0, 2000),
      contact: contact.trim().slice(0, 200) || null,
      page: page.slice(0, 100),
    });
    if (err) {
      setError(err.message);
      setState('error');
      return;
    }
    setMessage('');
    setContact('');
    setState('sent');
  };

  return (
    <dialog
      ref={ref}
      className="al-dialog tone-accent feedback-dialog"
      aria-labelledby="feedback-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="al-dialog-body">
        <h2 id="feedback-title">Send feedback</h2>
        {state === 'sent' ? (
          <div className="al-dialog-content">
            <p>Thanks, got it. Every note gets read.</p>
            <div className="al-dialog-actions">
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : !supabase ? (
          <div className="al-dialog-content">
            <p>Feedback goes through GitHub on this copy of the app.</p>
            <div className="al-dialog-actions">
              <button className="btn ghost" onClick={onClose}>Close</button>
              <a className="btn" href={ISSUES_URL} target="_blank" rel="noreferrer">Open an issue</a>
            </div>
          </div>
        ) : (
          <form className="al-dialog-content feedback-form" onSubmit={submit}>
            <p>Ideas, bugs, wrong prices, missing cards: all of it helps.</p>
            <div className="chips" role="group" aria-label="Feedback type">
              {KINDS.map((k) => (
                <button type="button" key={k.id} className="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <label className="field">
              <span className="label">Message</span>
              <textarea
                ref={textRef}
                className="input"
                rows={5}
                maxLength={2000}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What would make this more useful?"
              />
            </label>
            <label className="field">
              <span className="label">Reddit username or email (optional)</span>
              <input className="input" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Only if you'd like a reply" />
            </label>
            <label className="sr-only" aria-hidden="true">
              Leave this empty
              <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
            </label>
            {state === 'error' && <p className="weak tiny" role="alert">Couldn&apos;t send: {error}. You can also <a href={ISSUES_URL} target="_blank" rel="noreferrer">open a GitHub issue</a>.</p>}
            <div className="al-dialog-actions">
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn" disabled={state === 'sending' || message.trim().length < 3}>
                {state === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
