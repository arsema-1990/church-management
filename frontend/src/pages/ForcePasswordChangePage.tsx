import { translateText } from '../i18n/context';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current temporary password'),
    newPassword: z
      .string()
      .min(10, 'New password must be at least 10 characters')
      .max(100, 'Password must be 100 characters or fewer')
      .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include an uppercase letter, a lowercase letter, and a number'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine(d => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(d => d.newPassword !== d.currentPassword, {
    message: 'New password must be different from the temporary password',
    path: ['newPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ForcePasswordChangePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
  });

  const submit = form.handleSubmit(async values => {
    try {
      setError('');
      await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setSuccess(true);
      // Brief success pause then redirect to dashboard
      setTimeout(() => navigate('/dashboard', { replace: true }), 1800);
    } catch (e) {
      setError(messageFromError(e));
    }
  });

  const displayName = user?.person
    ? `${user.person.firstName} ${user.person.lastName}`
    : user?.username ?? 'Staff';

  return (
    <div className="fpc-screen">
      <div className="fpc-card">
        {/* Header */}
        <div className="fpc-header">
          <div className="fpc-cross">{translateText("✝")}</div>
          <p className="fpc-eyebrow">{translateText("GRACE EVANGELICAL CHURCH")}</p>
          <h1>{translateText("Password Change Required")}</h1>
          <p className="fpc-sub">
            {translateText("Welcome, ")}<strong>{displayName}</strong>{translateText(". For your security, you must set a\n            new permanent password before continuing.\n          ")}</p>
        </div>

        {/* Alert banner */}
        <div className="fpc-alert">
          <span>{translateText("🔐")}</span>
          <div>
            <strong>{translateText("Temporary password detected")}</strong>
            <p>
              {translateText("Your account was created by an Administrator with a temporary password.\n              Please choose a strong personal password now.\n            ")}</p>
          </div>
        </div>

        {error && <div className="fpc-error">{error}</div>}

        {success ? (
          <div className="fpc-success-box">
            <div className="fpc-success-icon">{translateText("✓")}</div>
            <h2>{translateText("Password Changed Successfully")}</h2>
            <p>{translateText("Redirecting you to your dashboard…")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="fpc-form">
            <label className="fpc-field">
              <span>{translateText("Current temporary password")}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                {...form.register('currentPassword')}
                aria-invalid={Boolean(form.formState.errors.currentPassword)}
              />
              {form.formState.errors.currentPassword && (
                <small>{form.formState.errors.currentPassword.message}</small>
              )}
            </label>

            <label className="fpc-field">
              <span>{translateText("New password ")}<em>{translateText("(min 10 characters)")}</em></span>
              <input
                type="password"
                autoComplete="new-password"
                maxLength={100}
                required
                {...form.register('newPassword')}
                aria-invalid={Boolean(form.formState.errors.newPassword)}
              />
              {form.formState.errors.newPassword && (
                <small>{form.formState.errors.newPassword.message}</small>
              )}
            </label>

            <label className="fpc-field">
              <span>{translateText("Confirm new password")}</span>
              <input
                type="password"
                autoComplete="new-password"
                maxLength={100}
                required
                {...form.register('confirmPassword')}
                aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              />
              {form.formState.errors.confirmPassword && (
                <small>{form.formState.errors.confirmPassword.message}</small>
              )}
            </label>

            {/* Password strength hints */}
            <ul className="fpc-hints">
              <li>{translateText("At least 10 characters")}</li>
              <li>{translateText("Mix of letters, numbers, and symbols")}</li>
              <li>{translateText("Different from your temporary password")}</li>
              <li>{translateText("Do not share your password with anyone")}</li>
            </ul>

            <button
              type="submit"
              className="fpc-btn"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? translateText("Saving…") : translateText("✓ Set New Password & Continue")}
            </button>
          </form>
        )}

        {/* Sign out option */}
        {!success && (
          <button
            className="fpc-signout"
            onClick={() => { logout(); navigate('/login'); }}
          >
            {translateText("Sign out and return to login\n          ")}</button>
        )}
      </div>
    </div>
  );
}
