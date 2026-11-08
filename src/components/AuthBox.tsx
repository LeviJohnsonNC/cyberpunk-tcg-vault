import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export function AuthBox() {
  const { session, signOut, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (session) {
    return (
      <span className="row" style={{ gap: 8 }}>
        <span className="hide-sm">{session.user.email}</span>
        <button className="btn ghost sm" onClick={signOut}>Sign out</button>
      </span>
    );
  }

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

  return (
    <span style={{ position: 'relative' }}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)}>Sign in</button>
      {open && (
        <div className="panel hot" style={{ position: 'absolute', right: 0, top: 40, width: 320, zIndex: 60 }}>
          <div className="panel-title">Jack in</div>
          {sent ? (
            <p style={{ margin: 0 }}>Check <b>{email}</b> for a sign-in link. You can close this.</p>
          ) : (
            <>
              <p className="muted tiny" style={{ marginTop: 0 }}>
                Sign in with a one-time email link to sync your collection and decks across devices. No password needed.
              </p>
              <div className="row">
                <input
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
        </div>
      )}
    </span>
  );
}
