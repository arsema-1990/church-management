import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, messageFromError } from '../api';
import { BackButton } from '../components/BackButton';
import { translateText } from '../i18n/context';
import { useLanguage } from '../i18n/context';

type VerificationPageState = { notice?: string; error?: string };

export function EmailVerificationPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const state = location.state as VerificationPageState | null;
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState(state?.notice ?? '');
  const [error, setError] = useState(state?.error ?? '');

  useEffect(() => {
    if (countdown <= 0) return;
    const timeout = window.setTimeout(() => setCountdown(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [countdown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post('/auth/email-verification/verify', { email, otp });
      setVerified(true);
      setOtp('');
      setMessage(response.data.message ?? t('Your email address has been verified. You can now sign in.'));
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setResending(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post('/auth/email-verification/resend', { email });
      setOtp('');
      setMessage(response.data.message ?? t('A new verification code has been sent to your email.'));
      setCountdown(60);
    } catch (requestError) {
      const retryAfterSeconds = axios.isAxiosError<{ retryAfterSeconds?: number }>(requestError)
        ? requestError.response?.data.retryAfterSeconds
        : undefined;
      if (retryAfterSeconds) setCountdown(retryAfterSeconds);
      setError(messageFromError(requestError));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-banner">
        <div className="auth-banner-content">
          <div className="auth-church-mark">{translateText('✝')}</div>
          <p className="auth-church-name">{translateText('Grace Evangelical Church')}</p>
          <h1>{translateText('Grow in Faith.')}<br /><em>{translateText('Find Your Community.')}</em></h1>
          <p className="auth-tagline">{translateText('Worship · Grow · Serve')}</p>
        </div>
      </section>
      <section className="auth-panel">
        <BackButton fallback="/register" className="auth-back-button" />
        <div className="auth-card">
          <div className="lang-toggle-auth">
            <button className={`lang-btn${language === 'en' ? ' active' : ''}`} onClick={() => setLanguage('en')}>{translateText('English')}</button>
            <button className={`lang-btn${language === 'am' ? ' active' : ''}`} onClick={() => setLanguage('am')}>{translateText('አማርኛ')}</button>
          </div>
          <div className="auth-card-header">
            <div className="auth-card-logo"><span>{translateText('✝')}</span>{translateText('Grace Evangelical Church')}</div>
            <h2>{verified ? t('Email verified') : t('Verify your email')}</h2>
            <p className="auth-card-sub">
              {verified
                ? t('Your email address is verified. You can now sign in.')
                : t('Enter the six-digit code sent to your email address. The code expires in five minutes.')}
            </p>
          </div>

          {error && <div className="alert error" role="alert"><span className="alert-icon">{translateText('⚠')}</span><span>{error}</span></div>}
          {message && <div className="alert success" role="status"><span className="alert-icon">{translateText('✓')}</span><span>{message}</span></div>}

          {!verified && (
            <form onSubmit={submit} className="auth-form">
              <label className="field">
                <span>{t('Email')}</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder={translateText('your@email.com')}
                />
              </label>
              <label className="field">
                <span>{t('Verification code')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  value={otp}
                  onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={translateText('123456')}
                />
              </label>
              <button type="submit" className="auth-submit" disabled={loading || resending}>
                {loading ? t('Please wait…') : t('Verify email')}
              </button>
              <div className="auth-resend-row">
                <button type="button" className="auth-resend-button" onClick={resendCode} disabled={resending || loading || countdown > 0}>
                  {resending ? t('Sending…') : t('Resend code')}
                </button>
                <span aria-live="polite">
                  {countdown > 0 ? `${t('Resend available in')} 00:${String(countdown).padStart(2, '0')}` : t('You can resend now')}
                </span>
              </div>
            </form>
          )}

          <p className="auth-switch" style={{ marginTop: '1rem' }}>
            <Link to="/login">{t('Back to sign in')}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
