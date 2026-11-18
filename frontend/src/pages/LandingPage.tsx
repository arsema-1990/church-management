import { translateText } from '../i18n/context';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/context';
import { LandingContactSection } from '../components/LandingContactSection';

export function LandingPage() {
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const [contactFormOpen, setContactFormOpen] = useState(() => Boolean((location.state as { openContactForm?: boolean } | null)?.openContactForm));
  useEffect(() => {
    if (contactFormOpen) window.setTimeout(() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, [contactFormOpen]);
  const openContactForm = () => {
    setContactFormOpen(true);
    window.setTimeout(() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  return (
    <main className="landing-root" style={{ minHeight: '100vh', background: '#0a1628', color: '#fff' }}>
      {/* Nav */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(20px,6vw,80px)', height: 70, borderBottom: '1px solid rgba(255,255,255,.07)', position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,22,40,.95)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, fontSize: 15 }}>
          <span style={{ width: 38, height: 38, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 20, color: 'var(--gold-400)' }}>{translateText("✝")}</span>
          <span>{translateText("Grace Evangelical Church")}</span>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setLanguage(language === 'en' ? 'am' : 'en')}
            style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {language === 'en' ? translateText("አማ") : translateText("EN")}
          </button>
          <Link to="/login" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>
            {t('Sign in')}
          </Link>
          <Link to="/register" style={{ background: 'var(--gold-400)', color: '#0a1628', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700 }}>
            {t('register')}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="church-landing-hero" style={{ minHeight: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'clamp(40px,8vw,100px) clamp(20px,6vw,80px)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,72,128,.45), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680 }}>
          <div style={{ fontSize: 64, color: 'var(--gold-400)', marginBottom: 20 }}>{translateText("✝")}</div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--gold-300)', marginBottom: 16 }}>
            {translateText("GRACE EVANGELICAL CHURCH\n          ")}</p>
          <h1 style={{ fontSize: 'clamp(42px,7vw,82px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-.04em', marginBottom: 20 }}>
            {translateText("Grow in Faith.")}<br />
            <span style={{ color: 'var(--gold-400)' }}>{translateText("Find Your Community.")}</span>
          </h1>
          <p style={{ fontSize: 'clamp(15px,2vw,19px)', color: 'rgba(255,255,255,.55)', marginBottom: 40, lineHeight: 1.6 }}>
            {translateText("A modern church management platform for worship, growth, and community.\n          ")}</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" className="landing-btn-primary">
              {translateText("Register as Worshiper\n            ")}</Link>
            <Link to="/login" className="landing-btn-outline">
              {translateText("Sign In\n            ")}</Link>
          </div>
          <blockquote style={{ marginTop: 64, fontStyle: 'italic', color: 'rgba(255,255,255,.4)', fontSize: 14 }}>
            {translateText("\"For where two or three gather in my name, there am I with them.\"\n            ")}<cite style={{ display: 'block', marginTop: 8, fontStyle: 'normal', fontSize: 11, color: 'var(--gold-300)' }}>{translateText("Matthew 18:20")}</cite>
          </blockquote>
        </div>
      </section>

      {/* Feature grid */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 2, borderTop: '1px solid rgba(255,255,255,.06)' }}>
        {[
          ['✦', 'Grow in Faith', 'Access approved courses, books, Bible study, and learning materials.'],
          ['⌂', 'Find Community', 'Join a Home Cell after membership and build lasting relationships.'],
          ['◇', 'Celebrate Milestones', 'Request and verify church certificates through your personal account.'],
          ['✝', 'Church Management', 'Administrators and managers oversee every aspect of church life.'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ padding: 'clamp(28px,4vw,48px)', borderRight: '1px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)' }}>
            <div style={{ fontSize: 28, color: 'var(--gold-400)', marginBottom: 14 }}>{icon}</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{title}</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </section>

      <LandingContactSection formOpen={contactFormOpen} onOpenForm={openContactForm} onCloseForm={() => setContactFormOpen(false)} />

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '28px 20px', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: 12, color: 'rgba(255,255,255,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
          <a href="#contact" onClick={openContactForm} style={{ color: 'rgba(255,255,255,.75)', fontWeight: 600, textDecoration: 'none' }}>{translateText('Contact')}</a>
          <span>{translateText('Location')}: {translateText('Gotera')}</span>
        </div>
        {translateText("Grace Evangelical Church · Church Management System · Together in Faith · Photo by ")}<a href="https://unsplash.com/photos/historic-church-building-on-a-hill-at-sunset-T_I-omzZpPs" target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,.45)' }}>{translateText("Claiton Conto / Unsplash")}</a>
      </footer>
    </main>
  );
}
