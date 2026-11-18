import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../../api';

type Person = { firstName: string; lastName: string; email?: string; phone?: string; user?: { id: string } | null; certificates?: { type: string }[]; baptisms?: { baptizedAt: string }[] };
type BaptismRequest = { id: string; status: string; details?: string; scheduledDate?: string; scheduledAddress?: string; managerNotes?: string; createdAt: string; person: Person };
type Tab = 'pending' | 'approved' | 'completed';
const COLORS: Record<string, string> = { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red', COMPLETED: 'blue' };

export function ManagerRequestsPage() {
  const [requests, setRequests] = useState<BaptismRequest[]>([]);
  const [selected, setSelected] = useState<BaptismRequest | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/manager/requests');
      setRequests((data.requests ?? []).filter((request: BaptismRequest & { type: string }) => request.type === 'BAPTISM'));
    } catch (e) { setError(messageFromError(e)); }
  };
  useEffect(() => { void load(); }, []);

  const review = async (request: BaptismRequest, decision: 'approve' | 'reject') => {
    const notes = decision === 'reject' ? window.prompt('Add a reason for the worshiper:') ?? '' : window.prompt('Manager notes (optional):') ?? '';
    if (decision === 'reject' && !notes.trim()) return;
    const scheduledDate = decision === 'approve' ? window.prompt('Scheduled baptism date (YYYY-MM-DD):') ?? '' : undefined;
    if (decision === 'approve' && !scheduledDate) return;
    const scheduledAddress = decision === 'approve' ? window.prompt('Baptism address:')?.trim() ?? '' : undefined;
    if (decision === 'approve' && !scheduledAddress) return;
    try {
      setError(''); setSuccess('');
      await api.post(`/manager/requests/${request.id}/review`, { decision, notes, scheduledDate, scheduledAddress });
      setSuccess(decision === 'approve' ? 'Baptism date scheduled and sent to the worshiper.' : 'Baptism request declined with a reason.');
      setSelected(null); await load();
    } catch (e) { setError(messageFromError(e)); }
  };

  const recordBaptism = async (request: BaptismRequest) => {
    const baptizedAt = window.prompt('Date the baptism took place (YYYY-MM-DD):');
    if (!baptizedAt) return;
    const location = window.prompt('Location (optional):') ?? '';
    try {
      setError(''); setSuccess('');
      await api.post('/manager/baptisms/record', { requestId: request.id, baptizedAt, location });
      setSuccess('Actual baptism recorded. Membership and certificate were created.');
      setSelected(null); await load();
    } catch (e) { setError(messageFromError(e)); }
  };

  const visible = requests.filter(request => tab === 'pending' ? request.status === 'PENDING' : tab === 'approved' ? request.status === 'APPROVED' : request.status === 'COMPLETED');

  return <div className="mgr-page">
    <div className="mgr-page-header"><div><h1>{translateText("Baptism Requests")}</h1><p className="mgr-muted">{translateText("Review eligible requests, schedule baptism, and record the actual baptism when it takes place.")}</p></div></div>
    {error && <div className="mgr-error">{error}</div>}{success && <div className="mgr-success">{success}</div>}
    <div className="mgr-filter-bar">{(['pending', 'approved', 'completed'] as Tab[]).map(key => <button key={key} className={`mgr-filter-chip${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{key[0].toUpperCase() + key.slice(1)}<span>{requests.filter(r => key === 'pending' ? r.status === 'PENDING' : key === 'approved' ? r.status === 'APPROVED' : r.status === 'COMPLETED').length}</span></button>)}</div>
    <div className="mgr-table-wrap"><table className="mgr-table">
      <thead><tr><th>{translateText("#")}</th><th>{translateText("Worshiper")}</th><th>{translateText("Email")}</th><th>{translateText("Course Certificate")}</th><th>{translateText("Scheduled Date")}</th><th>{translateText("Status")}</th><th>{translateText("Action")}</th></tr></thead>
      <tbody>{visible.map((request, index) => <tr key={request.id}>
        <td>{index + 1}</td>
        <td><div className="mgr-table-person"><div className="mgr-avatar-sm">{request.person.firstName.slice(0, 1)}</div><span>{request.person.firstName} {request.person.lastName}</span></div></td>
        <td>{request.person.email ?? '—'}</td>
        <td>{request.person.certificates?.some(c => c.type === 'COURSE') ? <span className="mgr-badge green">{translateText("Approved")}</span> : <span className="mgr-badge red">{translateText("Missing")}</span>}</td>
        <td>{request.scheduledDate ? <>{new Date(request.scheduledDate).toLocaleDateString()}<br/><small>{request.scheduledAddress}</small></> : translateText("—")}</td>
        <td><span className={`mgr-badge ${COLORS[request.status] ?? 'grey'}`}>{request.status}</span></td>
        <td><div className="mgr-action-row"><button className="mgr-btn-sm" onClick={() => setSelected(request)}>{translateText("View")}</button>{request.status === 'PENDING' && <><button className="mgr-btn-sm green" onClick={() => void review(request, 'approve')}>{translateText("Schedule")}</button><button className="mgr-btn-sm red" onClick={() => void review(request, 'reject')}>{translateText("Decline")}</button></>}{request.status === 'APPROVED' && <button className="mgr-btn-sm green" onClick={() => void recordBaptism(request)}>{translateText("Record baptism")}</button>}</div></td>
      </tr>)}</tbody>
    </table>{visible.length === 0 && <div className="mgr-empty">{translateText("No ")}{tab} {translateText("baptism requests.")}</div>}</div>
    {selected && <div className="mgr-modal-backdrop" onClick={() => setSelected(null)}><div className="mgr-modal" onClick={e => e.stopPropagation()}>
      <button className="mgr-modal-close" onClick={() => setSelected(null)}>{translateText("×")}</button><p className="mgr-eyebrow">{translateText("BAPTISM REQUEST")}</p><h2>{selected.person.firstName} {selected.person.lastName}</h2><p className="mgr-muted">{selected.person.email} {translateText("· ")}{selected.person.phone ?? ''}</p>
      <div className="mgr-detail-grid">{[['Status', selected.status], ['Submitted', new Date(selected.createdAt).toLocaleDateString()], ['Scheduled date', selected.scheduledDate ? new Date(selected.scheduledDate).toLocaleDateString() : 'Not scheduled'], ['Baptism address', selected.scheduledAddress || 'Not scheduled']].map(([label, value]) => <div className="mgr-detail-kv" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <div className="mgr-detail-section"><h4>{translateText("Eligibility")}</h4><div className="mgr-detail-row"><span>{translateText("Course certificate")}</span>{selected.person.certificates?.some(c => c.type === 'COURSE') ? <span className="mgr-badge green">{translateText("Present")}</span> : <span className="mgr-badge red">{translateText("Missing")}</span>}</div><div className="mgr-detail-row"><span>{translateText("Actual baptism record")}</span>{selected.person.baptisms?.length ? <span className="mgr-badge green">{translateText("Recorded")}</span> : <span className="mgr-badge grey">{translateText("Not recorded")}</span>}</div></div>
      {selected.details && <p className="mgr-feedback-note">{translateText("Worshiper note: ")}{selected.details}</p>}{selected.managerNotes && <p className="mgr-feedback-note">{translateText("Manager notes: ")}{selected.managerNotes}</p>}
      {selected.person.user?.id && <div className="mgr-action-row"><Link className="mgr-btn-outline" to={`/manager/messages?senderId=${encodeURIComponent(selected.person.user.id)}`}>{translateText("✉ Message Worshiper")}</Link></div>}
      {selected.status === 'PENDING' && <div className="mgr-action-row" style={{ marginTop: 16 }}><button className="mgr-btn-primary" onClick={() => void review(selected, 'approve')}>{translateText("Schedule baptism")}</button><button className="mgr-btn-danger" onClick={() => void review(selected, 'reject')}>{translateText("Decline")}</button></div>}
      {selected.status === 'APPROVED' && <div className="mgr-action-row" style={{ marginTop: 16 }}><button className="mgr-btn-primary" onClick={() => void recordBaptism(selected)}>{translateText("Record actual baptism")}</button></div>}
    </div></div>}
  </div>;
}
