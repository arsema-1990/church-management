import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { api, messageFromError } from '../../api';

type Notification = { id: string; title: string; message: string; category: string; targetUrl?: string; readAt?: string; createdAt: string };

const CAT_ICON: Record<string, string> = { course: '📖', request: '📜', baptism: '💧', system: '⚙', default: '🔔' };

export function ManagerNotificationsPage() {
  const [items, setItems]     = useState<Notification[]>([]);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const load = () =>
    api.get('/manager/notifications')
      .then(({ data }) => setItems(data.notifications ?? []))
      .catch(e => setError(messageFromError(e)));

  useEffect(() => { void load(); }, []);

  const markRead = async (id: string) => {
    await api.patch(`/manager/notifications/${id}/read`).catch(() => null);
    setItems(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  };

  const markAll = async () => {
    await api.post('/manager/notifications/read-all').catch(() => null);
    setItems(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setSuccess('All notifications marked as read.');
  };

  const unread = items.filter(n => !n.readAt).length;

  return (
    <div className="mgr-page">
      <div className="mgr-page-header">
        <div><h1>{translateText("🔔 Notifications")}</h1><p className="mgr-muted">{translateText("Church activity alerts and approvals requiring your attention.")}</p></div>
        {unread > 0 && (
          <button className="mgr-btn-outline" onClick={markAll}>{translateText("✓ Mark all as read (")}{unread}{translateText(")")}</button>
        )}
      </div>

      {error   && <div className="mgr-error">{error}</div>}
      {success && <div className="mgr-success">{success}</div>}

      {items.length === 0
        ? <div className="mgr-empty">{translateText("No notifications yet.")}</div>
        : (
          <div className="mgr-notif-list">
            {items.map(n => (
              <div key={n.id} className={`mgr-notif-item${!n.readAt ? ' unread' : ''}`}
                onClick={() => !n.readAt && markRead(n.id)}>
                <div className="mgr-notif-icon">{CAT_ICON[n.category] ?? CAT_ICON.default}</div>
                <div className="mgr-notif-body">
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                </div>
                {!n.readAt && <span className="mgr-notif-dot-badge" />}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
