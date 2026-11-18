import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, messageFromError } from '../../api';

type Recipient = { id: string; username: string; email: string; role: string; person?: { firstName: string; lastName: string } | null };
type InboxMessage = { id: string; title: string; message: string; createdAt: string; readAt?: string; direction: 'received' | 'sent'; senderId?: string; senderName: string; recipientName?: string; senderRole?: string };

export function ManagerMessagesPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [recipientId, setRecipientId] = useState(params.get('senderId') ?? '');
  const [recipientRole, setRecipientRole] = useState(params.get('recipientRole') ?? '');
  const [selectedRecipientName, setSelectedRecipientName] = useState(params.get('recipientName') ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [users, inbox] = await Promise.all([api.get('/manager/messages/recipients'), api.get('/manager/messages')]);
      setRecipients(users.data.users ?? []);
      setMessages(inbox.data.messages ?? []);
      const preselected = (users.data.users ?? []).find((user: Recipient) => user.id === params.get('senderId'));
      if (preselected) {
        setRecipientRole(preselected.role);
        setSelectedRecipientName(preselected.person ? `${preselected.person.firstName} ${preselected.person.lastName}` : preselected.username);
      }
    } catch (e) { setError(messageFromError(e)); }
  };
  useEffect(() => { void load(); }, []);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!recipientId) { setError('Choose a class instructor, member, worshiper, or administrator.'); return; }
    const cleanSubject = subject.trim(); const cleanBody = body.trim();
    if (cleanSubject.length < 2 || cleanSubject.length > 160 || !cleanBody || cleanBody.length > 5000) { setError('Enter a subject of 2–160 characters and a message of 1–5,000 characters.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await api.post('/manager/messages', { recipientId, subject: cleanSubject, message: cleanBody });
      setSuccess('Message sent. The recipient will see it in their portal notifications.');
      setSubject(''); setBody('');
      await load();
    } catch (e) { setError(messageFromError(e)); }
    finally { setBusy(false); }
  };

  const reply = (message: InboxMessage) => {
    if (message.direction !== 'received' || !message.senderId) { setError('You can reply to received messages.'); return; }
    const userId = message.senderId;
    setRecipientId(userId);
    const recipient = recipients.find(user => user.id === userId);
    if (recipient) setRecipientRole(recipient.role);
    setSubject(`Re: ${message.title.split(' — ')[0]}`);
    document.getElementById('manager-message-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return <div className="mgr-page">
    <div className="mgr-page-header"><div><h1>{translateText("Messages")}</h1><p className="mgr-muted">{translateText("Communicate with class instructors, members, worshipers, and church managers.")}</p></div></div>
    {error && <div className="mgr-error">{error}</div>}{success && <div className="mgr-success">{success}</div>}
    <div className="mgr-message-layout">
      <section className="mgr-panel" id="manager-message-form">
        <h3>{translateText("Start a message")}</h3>
        <form className="mgr-form-grid" onSubmit={send}>
          <div className="mgr-field wide"><span>{translateText("Recipient — send to one person")}</span>
            <div className="mgr-action-row" role="group" aria-label={translateText("Recipient type")}>
              {[['CLASS_INSTRUCTOR', 'Class Instructor'], ['MEMBER', 'Member'], ['WORSHIPER', 'Worshiper'], ['CHURCH_MANAGER', 'Church Manager']].map(([role, label]) => <button key={role} type="button" className={`mgr-filter-chip${recipientRole === role ? ' active' : ''}`} onClick={() => {
                if (role === 'WORSHIPER') { navigate('/manager/worshipers?selectForMessage=1'); return; }
                setRecipientRole(role); setRecipientId('');
              }}>{label}</button>)}
            </div>
            {recipientRole && <select value={recipientId} onChange={e => setRecipientId(e.target.value)} required>
              <option value="">{translateText("Choose ")}{recipientRole === 'CLASS_INSTRUCTOR' ? translateText("class instructor") : recipientRole === 'CHURCH_MANAGER' ? translateText("church manager") : recipientRole === 'MEMBER' ? translateText("member") : translateText("worshiper")}</option>
              {recipientId && !recipients.some(user => user.id === recipientId) && <option value={recipientId}>{selectedRecipientName || 'Selected recipient'}</option>}
              {recipients.filter(user => user.role === recipientRole).map(user => <option key={user.id} value={user.id}>{user.person ? `${user.person.firstName} ${user.person.lastName}` : user.username}</option>)}
            </select>}
          </div>
          <label className="mgr-field wide"><span>{translateText("Subject")}</span><input value={subject} onChange={e => setSubject(e.target.value)} minLength={2} maxLength={160} required /></label>
          <label className="mgr-field wide"><span>{translateText("Message")}</span><textarea rows={5} value={body} onChange={e => setBody(e.target.value)} maxLength={5000} required /></label>
          <button className="mgr-btn-primary" type="submit" disabled={busy}>{busy ? translateText("Sending…") : translateText("Send message")}</button>
        </form>
      </section>
      <section className="mgr-panel">
        <h3>{translateText("Inbox ")}<span className="mgr-count">{messages.length}</span></h3>
        {messages.length ? <div className="mgr-message-inbox">{messages.map(message => <article className="mgr-inbox-message" key={message.id}>
          <div><strong>{message.title}</strong><small>{message.direction === 'received' ? `From ${message.senderName}` : `To ${message.recipientName ?? 'recipient'}`} {translateText("· ")}{new Date(message.createdAt).toLocaleString()}</small></div>
          <p>{message.message}</p>
          {message.direction === 'received' && <button className="mgr-btn-sm" onClick={() => reply(message)}>{translateText("Reply")}</button>}
        </article>)}</div> : <p className="mgr-muted">{translateText("Messages from portal users will appear here.")}</p>}
      </section>
    </div>
  </div>;
}
