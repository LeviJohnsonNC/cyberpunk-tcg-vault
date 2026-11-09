import { useEffect, useRef, useState, type RefObject } from 'react';
import { enabledProviders, supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export function AuthBox({ inline = false, triggerRef }: { inline?: boolean; triggerRef?: RefObject<HTMLButtonElement | null> }) {
  const { session, signOut, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const ownTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? ownTrigger;
  useEffect(() => {
    enabledProviders().then((p) => setGoogle(!!p.google));
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !account.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open, trigger]);

  if (session) {
    if (inline) return <div className="vault-menu-account">
      <p>{session.user.email}</p>
      <button type="button" className="btn ghost" onClick={() => void signOut()}>Sign out</button>
    </div>;
    return (
      <div className="vault-account" ref={account}>
        <button type="button" className="btn quiet account-button" aria-label="Account" aria-expanded={open} aria-controls="vault-account-panel"
          ref={trigger} onClick={() => setOpen((shown) => !shown)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" /><path d="M4.5 21v-2.5a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5V21z" />
          </svg>
          <span>Account</span>
        </button>
        {open && <div className="popover account-panel" id="vault-account-panel" role="group" aria-label="Your account">
          <h3>Your account</h3>
          <p>{session.user.email}</p>
          <button type="button" className="btn ghost sm" onClick={() => { setOpen(false); void signOut(); }}>Sign out</button>
        </div>}
      </div>
    );
  }

  const signInGoogle = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      setBusy(false);
      toast(error.message, 'err');
    }
  };

  const send = async () => {
    if (!supabase || !email.includes('@')) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) toast(error.message, 'err');
    else setSent(true);
  };

  const signInForm = (
    <>
    {sent ? (
      <p style={{ margin: 0 }}>Check <b>{email}</b> for a sign-in link. You can close this.</p>
    ) : (
      <>
        {google && (
          <>
            <button className="btn google" disabled={busy} onClick={signInGoogle}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <div className="or-line"><span>or email link</span></div>
          </>
        )}
        <p className="muted tiny" style={{ marginTop: 0 }}>
          Sign in to sync your collection and decks across devices. No password needed.
        </p>
        <div className="row">
          <input
            aria-label="Email address"
            className="input"
            style={{ flex: 1 }}
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn" disabled={busy} onClick={send}>Send link</button>
        </div>
      </>
    )}
    </>
  );

  if (inline) return <div className="vault-menu-account">{signInForm}</div>;
  return (
    <div className="vault-account" ref={account}>
      <button type="button" className="btn signin" ref={trigger} aria-expanded={open} aria-controls="vault-signin-panel" onClick={() => setOpen((o) => !o)}>Sign in</button>
      {open && (
        <div className="popover" id="vault-signin-panel" role="group" aria-label="Sign in">
          <h3>Jack in</h3>
          {signInForm}
        </div>
      )}
    </div>
  );
}
