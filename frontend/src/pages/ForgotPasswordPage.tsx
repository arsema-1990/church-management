import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../i18n/context';
import { api, messageFromError } from '../api';
import { BackButton } from '../components/BackButton';

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { t, language, setLanguage } = useLanguage();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'request' | 'verify' | 'complete'>('request');

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timeout = window.setTimeout(() => setResendCountdown(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCountdown]);

  async function resendCode() {
    setError('');
    setMessage('');
    setResending(true);
    try {
      const res = await api.post('/auth/password-reset/request', { email });
      setOtp('');
      setMessage(res.data?.message || t('A verification code has been sent to your email.'));
      setResendCountdown(60);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setResending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (token) {
      if (password !== confirmPassword) {
        setError(t('Passwords do not match'));
        return;
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        setError(t('Include an uppercase letter, a lowercase letter, and a number'));
        return;
      }
    }

    setLoading(true);
    try {
      if (token) {
        await api.post('/auth/password-reset/complete', { email, otp, password });
        setMessage(t('Your password has been reset. You can now sign in.'));
        setSuccess(true);
        setPassword('');
        setConfirmPassword('');
        setOtp('');
      } else if (step === 'request') {
        const res = await api.post('/auth/password-reset/request', { email });
        setMessage(res.data?.message || t('A verification code has been sent to your email.'));
        setStep('verify');
        setResendCountdown(60);
      } else if (step === 'verify') {
        const res = await api.post('/auth/password-reset/verify', { email, otp });
        setMessage(res.data?.message || t('Your identity has been verified. Choose a new password.'));
        setStep('complete');
      } else {
        if (password !== confirmPassword) {
          setError(t('Passwords do not match'));
          return;
        }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
          setError(t('Include an uppercase letter, a lowercase letter, and a number'));
          return;
        }
        await api.post('/auth/password-reset/complete', { email, otp, password });
        setSuccess(true);
        setMessage(t('Your password has been reset successfully. You can now sign in.'));
        setPassword('');
        setConfirmPassword('');
        setOtp('');
      }
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-banner">
        <div className="auth-banner-content">
          <div className="auth-church-mark">{translateText("✝")}</div>
          <p className="auth-church-name">{translateText("Grace Evangelical Church")}</p>
          <h1>{translateText("Grow in Faith.")}<br /><em>{translateText("Find Your Community.")}</em></h1>
          <p className="auth-tagline">{translateText("Worship · Grow · Serve")}</p>
        </div>
      </section>
      <section className="auth-panel">
        <BackButton fallback="/login" className="auth-back-button" />
        <div className="auth-card">
          <div className="lang-toggle-auth">
            <button className={`lang-btn${language === 'en' ? ' active' : ''}`} onClick={() => setLanguage('en')}>{translateText("English")}</button>
            <button className={`lang-btn${language === 'am' ? ' active' : ''}`} onClick={() => setLanguage('am')}>{translateText("አማርኛ")}</button>
          </div>
          <div className="auth-card-header">
            <div className="auth-card-logo"><span>{translateText("✝")}</span>{translateText("Grace Evangelical Church")}</div>
            <h2>{token ? t('Choose a new password') : success ? t('Password reset complete') : step === 'verify' ? t('Verify your identity') : step === 'complete' ? t('Set a new password') : t('Forgot your password?')}</h2>
            <p className="auth-card-sub">
              {token
                ? t('Choose a strong password for your worshiper account.')
                : success
                  ? t('Your password has been updated. You may now sign in.')
                  : step === 'verify'
                    ? t('Enter the 6-digit code sent to your email.')
                    : step === 'complete'
                      ? t('Your email has been verified. Choose a new password below.')
                      : t('Enter your account email. We will send a 6-digit code to verify your identity before you reset your password.')}
            </p>
          </div>

          {error && <div className="alert error" role="alert"><span className="alert-icon">{translateText("⚠")}</span><span>{error}</span></div>}
          {message && !success && <div className="alert success" role="status"><span className="alert-icon">{translateText("✓")}</span><span>{message}</span></div>}

          {!success && (
            <form onSubmit={submit} className="auth-form">
              {step === 'request' && (
                <label className="field">
                  <span>{t('Email')}</span>
                  <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder={translateText("your@email.com")} />
                </label>
              )}

              {step === 'verify' && (
                <>
                  <label className="field">
                    <span>{t('Verification code')}</span>
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={translateText("123456")} />
                  </label>
                  <div className="auth-resend-row">
                    <button type="button" className="auth-resend-button" onClick={resendCode} disabled={resending || resendCountdown > 0}>
                      {resending ? t('Sending…') : t('Resend code')}
                    </button>
                    <span aria-live="polite">
                      {resendCountdown > 0
                        ? `${t('Resend available in')} ${String(Math.floor(resendCountdown / 60)).padStart(2, '0')}:${String(resendCountdown % 60).padStart(2, '0')}`
                        : t('You can resend now')}
                    </span>
                  </div>
                </>
              )}

              {(step === 'complete' || token) && (
                <>
                  <label className="field">
                    <span>{t('New password')}</span>
                    <input type="password" autoComplete="new-password" minLength={10} maxLength={100} required value={password} onChange={event => setPassword(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>{t('Confirm new password')}</span>
                    <input type="password" autoComplete="new-password" minLength={10} maxLength={100} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
                  </label>
                  <small>{t('Use at least 10 characters, including uppercase, lowercase, and a number.')}</small>
                </>
              )}

              <button type="submit" className="auth-submit" disabled={loading || resending}>
                {loading
                  ? t('Please wait…')
                  : token
                    ? t('Reset password')
                    : step === 'request'
                      ? t('Send verification code')
                      : step === 'verify'
                        ? t('Verify code')
                        : t('Set new password')}
              </button>
            </form>
          )}

          {!success && !token && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setMessage('');
                setStep('request');
                setResendCountdown(0);
                setOtp('');
                setPassword('');
                setConfirmPassword('');
              }}
              style={{ width: '100%', padding: '8px', background: 'transparent', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
            >
              {t('Start over')}
            </button>
          )}

          <p className="auth-switch" style={{ marginTop: '1rem' }}>
            <Link to="/login">{t('Back to sign in')}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
