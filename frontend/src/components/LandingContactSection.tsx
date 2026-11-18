import { useEffect, useState } from 'react';
import { api } from '../api';
import { translateText } from '../i18n/context';
import { PublicContactForm } from './PublicContactForm';

type ContactDetails = { phone?: string | null; email?: string | null };
type Props = { formOpen: boolean; onOpenForm: () => void; onCloseForm: () => void };

const location = 'Gotera, Addis Ababa, Ethiopia';
const mapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(location)}&output=embed`;
const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

export function LandingContactSection({ formOpen, onOpenForm, onCloseForm }: Props) {
  const [details, setDetails] = useState<ContactDetails | null>(null);

  useEffect(() => {
    api.get('/organization/contact')
      .then(({ data }) => setDetails(data.church ?? null))
      .catch(() => setDetails(null));
  }, []);

  return <section id="contact" className="landing-contact-section">
    <div className="landing-contact-heading">
      <div className="landing-contact-cross-rule"><span aria-hidden="true">✝</span></div>
      <h2>{translateText('Contact')} <span>{translateText('Us')}</span></h2>
      <div>{translateText('We would love to hear from you. Whether you have a question, need support, or want to learn more about our church, feel free to reach out.')}</div>
    </div>
    <div className="landing-contact-grid">
      <aside className="landing-contact-info">
        <p className="landing-contact-eyebrow">{translateText('GET IN TOUCH')}</p>
        <h3>{translateText('Contact Information')}</h3>
        <a className="landing-contact-detail" href={details?.phone ? `tel:${details.phone}` : '#contact'} onClick={event => { if (!details?.phone) { event.preventDefault(); onOpenForm(); } }}>
          <span className="landing-contact-icon" aria-hidden="true">☎</span>
          <span><strong>{translateText('Phone')}</strong><span>{details?.phone || translateText('Contact us using the message form')}</span></span>
        </a>
        <a className="landing-contact-detail" href={details?.email ? `mailto:${details.email}` : '#contact'} onClick={event => { if (!details?.email) { event.preventDefault(); onOpenForm(); } }}>
          <span className="landing-contact-icon" aria-hidden="true">✉</span>
          <span><strong>{translateText('Email')}</strong><span>{details?.email || translateText('Send us a message')}</span></span>
        </a>
        <div className="landing-contact-detail">
          <span className="landing-contact-icon" aria-hidden="true">⌖</span>
          <span><strong>{translateText('Location')}</strong><span>{location}</span></span>
        </div>
        <div className="landing-contact-hours">
          <span className="landing-contact-icon" aria-hidden="true">◷</span>
          <span><strong>{translateText('Office Hours')}</strong><span>{translateText('Mon – Fri: 8:00 AM – 5:00 PM')}</span></span>
        </div>
        <div className="landing-contact-welcome"><span />{translateText('All are welcome')}<span /></div>
      </aside>

      <div className="landing-contact-map-card">
        <iframe title={translateText('Map showing Gotera, Addis Ababa')} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <a className="landing-contact-directions" href={directionsUrl} target="_blank" rel="noreferrer">
          <span className="landing-contact-map-icon" aria-hidden="true">⌖</span>
          <span><strong>{translateText('Get Directions')} <span aria-hidden="true">→</span></strong><small>{translateText('Open in Google Maps')}</small></span>
        </a>
      </div>

      <div className="landing-contact-form-slot" id="contact-form">
        {formOpen ? <div className="landing-contact-form-wrap">
          <button className="landing-contact-close" type="button" onClick={onCloseForm}>{translateText('Close')} <span aria-hidden="true">×</span></button>
          <PublicContactForm />
        </div> : <div className="landing-contact-open-card">
          <p className="landing-contact-eyebrow">{translateText('SEND A MESSAGE')}</p>
          <h3>{translateText('Contact Form')}</h3>
          <p>{translateText('Have a question or feedback? Send a message to the church administrator.')}</p>
          <button type="button" onClick={onOpenForm}><span aria-hidden="true">➤</span>{translateText('Contact Us')}</button>
        </div>}
      </div>
    </div>
  </section>;
}
