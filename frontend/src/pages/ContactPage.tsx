import { translateText } from '../i18n/context';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';

type InboxMessage = {
  id: string; title: string; message: string; createdAt: string;
  readAt?: string; direction: 'received' | 'sent';
  senderName: string; recipientName?: string; senderRole?: string;
};

const CATEGORY_OPTIONS = [
  { value: 'Question', label: '❓ Question' },
  { value: 'Feedback', label: '💬 Feedback' },
  { value: 'Prayer Request', label: '🙏 Prayer Request' },
  { value: 'Course Issue', label: '📖 Course Issue' },
  { value: 'Certificate Issue', label: '📜 Certificate Issue' },
  { value: 'Home Cell', label: '⌂ Home Cell' },
  { value: 'Suggestion', label: '✦ Suggestion' },
  { value: 'Other', label: '• Other' },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function ContactPage() {
  const { user }  = useAuth();
  const formRef   = useRef<HTMLFormElement>(null);

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [category, setCategory] = useState('Question');
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [tab,      setTab]      = useState<'send' | 'inbox'>('send');

  const load = async () => {
    try {
      const { data } = await api.get('/portal/messages');
      setMessages(data.messages ?? []);
    } catch { /* silently ignore */ }
  };

  useEffect(() => { void load(); }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const fullSubject = `[${category}] ${subject.trim()}`;
    if (!subject.trim()) { setError('Please enter a subject.'); return; }
    if (!body.trim())    { setError('Please enter your message.'); return; }

    setBusy(true); setError(''); setSuccess('');
    try {
      // Send to all church managers
      const { data: recipData } = await api.get('/portal/messages/recipients');
      const managers: { id: string }[] = (recipData.users ?? []).filter(
        (u: { role: string }) => u.role === 'CHURCH_MANAGER' || u.role === 'ADMINISTRATOR',
      );
      if (!managers.length) {
        setError('No church manager is available right now. Please try again later.');
        return;
      }
      // Send to the first available manager (or all)
      await api.post('/portal/messages', {
        recipientId: managers[0].id,
        subject: fullSubject,
        message: body.trim(),
      });
      setSuccess('Your message has been sent to the Church Manager. They will respond soon.');
      setSubject(''); setBody(''); setCategory('Question');
      formRef.current?.reset();
      await load();
      setTab('inbox');
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (msg: InboxMessage) => {
    if (msg.readAt || msg.direction !== 'received') return;
    try { await api.patch(`/portal/messages/${msg.id}/read`); }
    catch { /* ignore */ }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, readAt: new Date().toISOString() } : m));
  };

  const displayName = user?.person
    ? `${user.person.firstName} ${user.person.lastName}`
    : user?.username ?? '';

  const unread = messages.filter(m => !m.readAt && m.direction === 'received').length;

  return (
    <div className="content-wrap">
      {/* Page header */}
      <div className="page-title">
        <p className="eyebrow">{translateText("CHURCH MANAGEMENT SYSTEM")}</p>
        <h1>{translateText("Contact & Feedback")}</h1>
        <p>{translateText("Send a question, feedback, prayer request, or suggestion to the Church Manager.")}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'send',  label: '✉ Send Message' },
          { key: 'inbox', label: `📬 My Messages${unread > 0 ? ` (${unread})` : ''}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'send' | 'inbox')}
            style={{
              background: 'none', border: 'none', padding: '10px 18px 12px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', color: tab === t.key ? 'var(--navy-700)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === t.key ? 'var(--navy-700)' : 'transparent'}`,
              marginBottom: -2, transition: 'color .15s, border-color .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {/* ── Send tab ── */}
      {tab === 'send' && (
        <div style={{ maxWidth: 640 }}>
          {/* Info card */}
          <div style={{ background: 'linear-gradient(135deg,var(--navy-800),var(--navy-700))', borderRadius: 'var(--r-xl)', padding: '22px 28px', marginBottom: 24, color: '#fff' }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>{translateText("✝")}</div>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{translateText("Hello, ")}{displayName}{translateText("!")}</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', margin: 0, lineHeight: 1.6 }}>
              {translateText("Your message will be sent directly to the Church Manager. You can ask questions, send feedback,\n              request prayer, or report any issues with courses, certificates, or church services.\n            ")}</p>
          </div>

          <div className="panel">
            <h2 style={{ marginBottom: 20 }}>{translateText("New Message")}</h2>
            <form ref={formRef} className="form-stack" onSubmit={send}>
              {/* Category */}
              <label className="field">
                <span>{translateText("Category")}</span>
                <select value={category} onChange={e => setCategory(e.target.value)} required>
                  {CATEGORY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              {/* Subject */}
              <label className="field">
                <span>{translateText("Subject")}</span>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={translateText("Briefly describe your question or feedback…")}
                  maxLength={120}
                  required
                />
              </label>

              {/* Message */}
              <label className="field">
                <span>{translateText("Your message")}</span>
                <textarea
                  rows={6}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={translateText("Write your full message here. Be as detailed as you need to be.")}
                  maxLength={5000}
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'right' }}>
                  {body.length} {translateText("/ 5000\n                ")}</small>
              </label>

              <button type="submit" className="btn-primary" disabled={busy} style={{ justifySelf: 'start' }}>
                {busy ? translateText("Sending…") : translateText("✉ Send to Church Manager")}
              </button>
            </form>
          </div>

          {/* What to expect */}
          <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 20px', marginTop: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-700)', marginBottom: 8 }}>{translateText("ℹ What happens next?")}</p>
            <ul style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 2, margin: 0 }}>
              <li>{translateText("Your message is sent directly to the Church Manager")}</li>
              <li>{translateText("The Church Manager will review and respond")}</li>
              <li>{translateText("You will receive a reply in your inbox on this page")}</li>
              <li>{translateText("You will also see a notification when a reply arrives")}</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Inbox tab ── */}
      {tab === 'inbox' && (
        <div>
          {messages.length === 0 ? (
            <div className="empty-card">
              <span>{translateText("📬")}</span>
              <strong>{translateText("No messages yet")}</strong>
              <p>{translateText("Send a question or feedback to the Church Manager using the \"Send Message\" tab. Their replies will appear here.")}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className="record-card"
                  style={{
                    cursor: 'pointer',
                    borderLeft: `4px solid ${msg.direction === 'received' && !msg.readAt ? 'var(--navy-600)' : 'var(--border)'}`,
                    background: msg.direction === 'received' && !msg.readAt ? 'var(--navy-50)' : 'var(--surface)',
                  }}
                  onClick={() => { setSelected(msg); markRead(msg); }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        {msg.direction === 'received' && !msg.readAt && (
                          <span style={{ background: 'var(--navy-700)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>{translateText("NEW")}</span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {msg.direction === 'received' ? `📥 From: ${msg.senderName}` : `📤 Sent to: ${msg.recipientName ?? 'Church Manager'}`}
                        </span>
                      </div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy-800)', margin: '0 0 5px' }}>{msg.title}</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                        {msg.message}
                      </p>
                    </div>
                    <small style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(msg.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message detail modal */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="study-modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>{translateText("×")}</button>
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--navy-400)', margin: '0 0 8px' }}>
                {selected.direction === 'received' ? translateText("REPLY FROM CHURCH MANAGER") : translateText("YOUR SENT MESSAGE")}
              </p>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy-900)', marginBottom: 5 }}>{selected.title}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                {selected.direction === 'received'
                  ? `From: ${selected.senderName}`
                  : `To: ${selected.recipientName ?? 'Church Manager'}`}
                {translateText(" · ")}{fmtDate(selected.createdAt)}
              </p>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px', fontSize: 14, color: 'var(--navy-700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {selected.message}
            </div>
            {selected.direction === 'received' && (
              <button
                className="btn-primary"
                style={{ marginTop: 18 }}
                onClick={() => { setSelected(null); setTab('send'); setSubject(`Re: ${selected.title.replace(/^\[.*?\]\s*/,'')}`); setCategory('Question'); setTimeout(() => formRef.current?.querySelector('textarea')?.focus(), 100); }}
              >
                {translateText("↩ Reply\n              ")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
