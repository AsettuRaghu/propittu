import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/** Phone number, then the one-time code — the same login as the app. */
export function Login() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const full = '+91' + phone.replace(/\D/g, '').slice(-10);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!/^\+91[6-9]\d{9}$/.test(full)) return setProblem('Enter a 10-digit Indian mobile number.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: full });
    setBusy(false);
    if (error) return setProblem(error.message);
    setSent(true);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: full,
      token: code.trim(),
      type: 'sms',
    });
    setBusy(false);
    if (error) setProblem('That code didn’t work. Check it and try again.');
  };

  return (
    <div className="center">
      <form className="card" onSubmit={sent ? verify : send}>
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <b>Propittu Backoffice</b>
            <span>For the Propittu team</span>
          </div>
        </div>
        {!sent ? (
          <>
            <h1>Sign in</h1>
            <p>Use your admin mobile number. We’ll send a one-time code.</p>
            <label className="field">
              Mobile number
              <input
                id="phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        ) : (
          <>
            <h1>Enter the code</h1>
            <p>Sent to {full.replace('+91', '+91 ')}.</p>
            <label className="field">
              One-time code
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </label>
            <button className="btn primary" disabled={busy || code.trim().length < 4}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="link" onClick={() => setSent(false)}>
              Use a different number
            </button>
          </>
        )}
        {problem ? <div className="error">{problem}</div> : null}
      </form>
    </div>
  );
}
