import { useState, type FormEvent } from 'react';
import { api, messageFromError } from '../api';
import { translateText, useLanguage } from '../i18n/context';

export function PublicContactForm() {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const fullMessage = subject ? `Subject: ${subject}\n\n${message.trim()}` : message.trim();
      const { data } = await api.post('/contact', { fullName: fullName.trim(), email: email.trim(), message: fullMessage });
      setSuccess(data.message ?? translateText('Your message has been sent to the church administrator.'));
      setFullName(''); setEmail(''); setSubject(''); setMessage('');
    } catch (err) {
      setError(messageFromError(err));
    } finally { setBusy(false); }
  };

  return <div className="public-contact-form-card">
    <p className="public-contact-eyebrow">{translateText('SEND A MESSAGE')}</p>
    <h2>{translateText('Contact Form')}</h2>
    <form className="public-contact-form" onSubmit={sendMessage}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {success && <div className="success-banner" role="status">{success}</div>}
      <div className="public-contact-fields-row">
        <label className="field"><span>{translateText('Full Name')} *</span><input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" maxLength={80} placeholder={translateText('Enter your full name')} required /></label>
        <label className="field"><span>{translateText('Email Address')} *</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} placeholder={translateText('Enter your email address')} required /></label>
      </div>
      <label className="field"><span>{translateText('Subject')} *</span>
        <select value={subject} onChange={event => setSubject(event.target.value)} required>
          <option value="">{translateText('Select a subject')}</option>
          <option value="General question">{translateText('General question')}</option>
          <option value="Church services">{translateText('Church services')}</option>
          <option value="Prayer request">{translateText('Prayer request')}</option>
          <option value="Support">{translateText('Support')}</option>
          <option value="Other">{translateText('Other')}</option>
        </select>
      </label>
      <label className="field"><span>{translateText('Message')} *</span><textarea rows={5} value={message} onChange={event => setMessage(event.target.value)} maxLength={4900} placeholder={translateText('Type your message here...')} required /></label>
      <button className="public-contact-submit" type="submit" disabled={busy}>{busy ? translateText('Sending…') : <><span aria-hidden="true">➤</span> {translateText('Send Message')}</>}</button>
      <p className="public-contact-form-note">{t('Already part of the church?')} <a href="/login">{translateText('Sign in')}</a></p>
    </form>
  </div>;
}
