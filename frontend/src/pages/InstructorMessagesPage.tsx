import { translateText } from '../i18n/context';
import { useEffect, useState, type FormEvent } from 'react';
import { api, messageFromError } from '../api';

type Recipient = { id: string; username: string; email: string; role: string; person?: { firstName: string; lastName: string } | null };
type Message = { id: string; title: string; message: string; createdAt: string; readAt?: string; direction: 'received' | 'sent'; senderId?: string; senderName: string; recipientName?: string };

export function InstructorMessagesPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [people, inbox] = await Promise.all([api.get('/instructor/messages/recipients'), api.get('/instructor/messages')]);
      setRecipients(people.data.users ?? []);
      setMessages(inbox.data.messages ?? []);
    } catch (e) { setError(messageFromError(e)); }
  };
  useEffect(() => { void load(); }, []);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const cleanSubject = subject.trim(); const cleanBody = body.trim();
    if (!recipientId || cleanSubject.length < 2 || cleanSubject.length > 160 || !cleanBody || cleanBody.length > 5000) { setError('Choose a recipient, enter a subject of 2–160 characters, and a message of 1–5,000 characters.'); return; }
    try {
      setBusy(true); setError(''); setNotice('');
      await api.post('/instructor/messages', { recipientId, subject: cleanSubject, message: cleanBody });
      setSubject(''); setBody(''); setNotice('Message sent to the Church Manager.');
      await load();
    } catch (e) { setError(messageFromError(e)); }
    finally { setBusy(false); }
  };

  const reply = (message: Message) => {
    if (!message.senderId) return;
    setRecipientId(message.senderId);
    setSubject(`Re: ${message.title.replace(/^Re:\s*/i, '')}`);
    document.getElementById('instructor-message-compose')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return <div className="content-wrap">
    <div className="page-title"><p className="eyebrow">{translateText("CLASS & COURSE INSTRUCTOR")}</p><h1>{translateText("Messages")}</h1><p>{translateText("Send messages to Church Managers and receive their replies here.")}</p></div>
    {error && <div className="error-banner">{error}</div>}{notice && <div className="success-banner">{notice}</div>}
    <div className="record-grid">
      <section className="panel" id="instructor-message-compose">
        <h2>{translateText("Send a message")}</h2>
        <form className="form-grid" onSubmit={send}>
          <label className="field wide"><span>{translateText("Recipient")}</span><select required value={recipientId} onChange={e => setRecipientId(e.target.value)}><option value="">{translateText("Select a Church Manager or Admin")}</option>{recipients.map(user => <option key={user.id} value={user.id}>{user.person ? `${user.person.firstName} ${user.person.lastName}` : user.username} {translateText("· ")}{user.role === 'ADMINISTRATOR' ? translateText("Admin") : translateText("Church Manager")}</option>)}</select></label>
          <label className="field wide"><span>{translateText("Subject")}</span><input required minLength={2} maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} /></label>
          <label className="field wide"><span>{translateText("Message")}</span><textarea required rows={5} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} /></label>
          <button className="btn-primary" disabled={busy}>{busy ? translateText("Sending…") : translateText("Send message")}</button>
        </form>
      </section>
      <section className="panel"><h2>{translateText("Inbox ")}<span className="mgr-count">{messages.length}</span></h2>
        {messages.length ? <div className="record-list">{messages.map(message => <article className="record-list-row" key={message.id}><strong>{message.title}</strong><small>{message.direction === 'received' ? `From ${message.senderName}` : `To ${message.recipientName ?? 'recipient'}`} {translateText("· ")}{new Date(message.createdAt).toLocaleString()}</small><p>{message.message}</p>{message.direction === 'received' && <button className="btn-secondary" type="button" onClick={() => reply(message)}>{translateText("Reply")}</button>}</article>)}</div> : <div className="empty-card"><strong>{translateText("No messages yet")}</strong><p>{translateText("Messages from the Church Manager will appear here.")}</p></div>}
      </section>
    </div>
  </div>;
}
