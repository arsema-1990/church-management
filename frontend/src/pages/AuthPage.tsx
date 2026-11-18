import { translateText } from '../i18n/context';
import { useState } from 'react';
import axios from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Resolver } from 'react-hook-form';
import { messageFromError } from '../api';
import { useAuth } from '../state';
import { useLanguage } from '../i18n/context';
import { BackButton } from '../components/BackButton';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Invalid email address').max(254, 'Email address is too long'),
  password: z.string().min(1, 'Enter your password'),
});
type AuthValues = z.infer<typeof schema>;

export function AuthPage() {
  const auth     = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const form = useForm<AuthValues>({
    resolver: zodResolver(schema) as Resolver<AuthValues>,
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const submit = form.handleSubmit(async values => {
    try {
      setError('');
      setLoading(true);
      const user = await auth.login(values.email, values.password);
      const home = user.role === 'ADMINISTRATOR' || user.role === 'CHURCH_MANAGER' ? '/manager/dashboard'
        : user.role === 'CLASS_INSTRUCTOR' ? '/instructor/dashboard' : '/dashboard';
      navigate(home, { replace: true });
    } catch (e) {
      setError(messageFromError(e));
      setUnverifiedEmail(
        axios.isAxiosError<{ code?: string }>(e) && e.response?.data.code === 'EMAIL_NOT_VERIFIED'
          ? values.email
          : '',
      );
    } finally {
      setLoading(false);
    }
  });

  return (
    <main className="auth-screen">
      {/* ── Left banner ── */}
      <section className="auth-banner">
        <div className="auth-banner-content">
          <div className="auth-church-mark">{translateText("✝")}</div>
          <p className="auth-church-name">{translateText("Grace Evangelical Church")}</p>
          <h1>
            {translateText("Grow in Faith.")}<br />
            <em>{translateText("Find Your Community.")}</em>
          </h1>
          <p className="auth-tagline">{translateText("Worship · Grow · Serve")}</p>
          <blockquote className="auth-verse">
            {translateText("\"For where two or three gather in my name, there am I with them.\"\n            ")}<cite>{translateText("Matthew 18:20")}</cite>
          </blockquote>
        </div>
      </section>

      {/* ── Right panel ── */}
      <section className="auth-panel">
        <BackButton fallback="/" className="auth-back-button" />
          <div className="auth-card">
          {/* Language toggle */}
          <div className="lang-toggle-auth">
            <button
              className={`lang-btn${language === 'en' ? ' active' : ''}`}
              onClick={() => setLanguage('en')}
            >
              {translateText("English\n            ")}</button>
            <button
              className={`lang-btn${language === 'am' ? ' active' : ''}`}
              onClick={() => setLanguage('am')}
            >
              {translateText("አማርኛ\n            ")}</button>
          </div>

          <div className="auth-card-header">
            <div className="auth-card-logo">
              <span>{translateText("✝")}</span>
              {translateText("Grace Evangelical Church\n            ")}</div>
            <h2>{t('Welcome back')}</h2>
            <p className="auth-card-sub">{t('Sign in to continue to your church workspace.')}</p>
          </div>

          {typeof (location.state as { notice?: unknown } | null)?.notice === 'string' && (
            <div className="alert success" role="status">{(location.state as { notice: string }).notice}</div>
          )}

          {error && (
            <div className="alert error" role="alert">
              <span className="alert-icon">{translateText("⚠")}</span>
              <span>{error}</span>
              {unverifiedEmail && (
                <Link to={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}>{t('Verify your email address')}</Link>
              )}
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            <label className="field">
              <span>{t('Email')}</span>
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder={translateText("your@email.com")}
                {...form.register('email')}
                aria-invalid={Boolean(form.formState.errors.email)}
              />
              {form.formState.errors.email && (
                <small className="field-error">{form.formState.errors.email.message}</small>
              )}
              <small style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)' }}>{translateText("Worshiper and member accounts use Gmail. Admin and staff use their assigned account email.")}</small>
            </label>

            <label className="field">
              <span>{t('Password')}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                placeholder={translateText("••••••••••")}
                {...form.register('password')}
                aria-invalid={Boolean(form.formState.errors.password)}
              />
              {form.formState.errors.password && (
                <small className="field-error">{form.formState.errors.password.message}</small>
              )}
            </label>

            <div className="auth-links">
              <Link to="/forgot-password">{t('Forgot password?')}</Link>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? translateText("Signing in…") : t('Sign in')}
            </button>
          </form>

          <p className="auth-switch">
            {t('New to the church?')}{translateText(" ")}
            <Link to="/register">{t('Register as a worshiper')}</Link>
          </p>
          <small className="staff-note">
            {t('Staff and manager accounts are created by an Administrator.')}
          </small>
        </div>
      </section>
    </main>
  );
}
