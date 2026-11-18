import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../../api';
import { useAuth } from '../../state';
import { downloadCertificatePdf } from '../../utils/downloadCertificate';

type PersonSnap = { firstName: string; middleName?: string; lastName: string; email?: string };
type CourseProgress = { percentage: number; course: { title: string; category: string } };
type CertRecord = { type: string; certificateNumber: string };
type Baptism = { baptizedAt: string };
type RequestPerson = PersonSnap & { courseProgress: CourseProgress[]; certificates: CertRecord[]; baptisms: Baptism[]; member?: { membershipNumber: string } | null };
type CertRequest = {
  id: string; type: string; status: string; details?: string;
  requestedDate?: string; scheduledDate?: string; managerNotes?: string;
  createdAt: string;
  person: RequestPerson;
  reviewer?: { username: string; person?: PersonSnap | null } | null;
  certificate?: { certificateNumber: string; verificationCode: string; qrCodeDataUrl?: string; issuedAt: string } | null;
};

type IssuedCert = {
  id: string; type: string; certificateNumber: string; verificationCode: string;
  issuedAt: string; courseTitleSnapshot?: string; issuerNameSnapshot: string; signatureSnapshot?: string; qrCodeDataUrl?: string;
  person: PersonSnap;
  issuer: { username: string; person?: PersonSnap | null };
};

function fullName(p?: Pick<PersonSnap, 'firstName' | 'middleName' | 'lastName'> | null) {
  if (!p) return '—';
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}

const STATUS_COLOR: Record<string, string> = { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red', COMPLETED: 'blue' };

export function ManagerCertificatesPage({ issued = false }: { issued?: boolean }) {
  const { user } = useAuth();
  const canReview = user?.role === 'ADMINISTRATOR';
  const [requests,  setRequests]  = useState<CertRequest[]>([]);
  const [certs,     setCerts]     = useState<IssuedCert[]>([]);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [selected,  setSelected]  = useState<CertRequest | null>(null);
  const [preview,   setPreview]   = useState<IssuedCert | null>(null);
  const [tab,       setTab]       = useState<'pending' | 'approved' | 'rejected'>('pending');

  const load = async () => {
    try {
      if (!issued) {
        const { data } = await api.get('/manager/requests');
        setRequests((data.requests ?? []).filter((r: CertRequest) => r.type === 'COURSE_CERTIFICATE'));
      } else {
        const { data } = await api.get('/manager/certificates');
        setCerts(data.certificates ?? []);
      }
    } catch (e) { setError(messageFromError(e)); }
  };

  useEffect(() => { void load(); }, [issued]);

  const review = async (id: string, decision: 'approve' | 'reject') => {
    const notes = decision === 'reject' ? window.prompt('Add a reason so the applicant knows what to do next:') : '';
    if (decision === 'reject' && !notes) return;
    try {
      setError(''); setSuccess('');
      await api.post(`/manager/requests/${id}/review`, { decision, notes });
      setSuccess(decision === 'approve' ? 'Certificate approved and issued.' : 'Feedback sent to applicant.');
      setSelected(null);
      await load();
    } catch (e) { setError(messageFromError(e)); }
  };

  // For certificate requests page
  if (!issued) {
    const byTab = requests.filter(r =>
      tab === 'pending'  ? r.status === 'PENDING' :
      tab === 'approved' ? ['APPROVED', 'COMPLETED'].includes(r.status) :
      r.status === 'REJECTED',
    );

    return (
      <div className="mgr-page">
        <div className="mgr-page-header">
          <div><h1>{translateText("Certificate Requests")}</h1><p className="mgr-muted">{translateText("View course certificate requests from worshipers.")}</p></div>
        </div>

        {error   && <div className="mgr-error">{error}</div>}
        {success && <div className="mgr-success">{success}</div>}

        <div className="mgr-filter-bar">
          {(['pending', 'approved', 'rejected'] as const).map(t => (
            <button key={t} className={`mgr-filter-chip${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)} <span>{requests.filter(r => t === 'pending' ? r.status === 'PENDING' : t === 'approved' ? ['APPROVED', 'COMPLETED'].includes(r.status) : r.status === 'REJECTED').length}</span>
            </button>
          ))}
        </div>

        <div className="mgr-table-wrap">
          <table className="mgr-table">
            <thead><tr><th>{translateText("#")}</th><th>{translateText("Worshiper")}</th><th>{translateText("Type")}</th><th>{translateText("Completion %")}</th><th>{translateText("Request Date")}</th><th>{translateText("Status")}</th><th>{translateText("Action")}</th></tr></thead>
            <tbody>
              {byTab.map((r, i) => {
                const pct = Math.max(0, ...(r.person.courseProgress ?? []).map(cp => cp.percentage));
                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td><div className="mgr-table-person"><div className="mgr-avatar-sm">{(r.person.firstName ?? '?').slice(0, 1)}</div><span>{fullName(r.person)}</span></div></td>
                    <td>{r.type.replace(/_/g, ' ')}</td>
                    <td><div className="mgr-progress-mini"><div style={{ width: `${pct}%` }} /><span>{pct}{translateText("%")}</span></div></td>
                    <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : translateText("—")}</td>
                    <td><span className={`mgr-badge ${STATUS_COLOR[r.status] ?? 'grey'}`}>{r.status}</span></td>
                    <td>
                      <div className="mgr-action-row">
                        <button className="mgr-btn-sm" onClick={() => setSelected(r)}>{translateText("View")}</button>
                        {canReview && r.status === 'PENDING' && (
                          <>
                            <button className="mgr-btn-sm green" onClick={() => review(r.id, 'approve')}>{translateText("Approve")}</button>
                            <button className="mgr-btn-sm red" onClick={() => review(r.id, 'reject')}>{translateText("Reject")}</button>
                          </>
                        )}
                        {r.certificate && (
                          <button className="mgr-btn-sm" onClick={() => setPreview(r.certificate as unknown as IssuedCert)}>{translateText("Preview")}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {byTab.length === 0 && <div className="mgr-empty">{translateText("No ")}{tab} {translateText("certificate requests.")}</div>}
        </div>

        {/* Request detail */}
        {selected && (
          <div className="mgr-modal-backdrop" onClick={() => setSelected(null)}>
            <div className="mgr-modal" onClick={e => e.stopPropagation()}>
              <button className="mgr-modal-close" onClick={() => setSelected(null)}>{translateText("×")}</button>
              <p className="mgr-eyebrow">{translateText("CERTIFICATE REQUEST")}</p>
              <h2>{fullName(selected.person)}</h2>
              <p className="mgr-muted">{selected.person.email}</p>

              <div className="mgr-detail-grid">
                {[
                  ['Request Type', selected.type.replace(/_/g, ' ')],
                  ['Status', selected.status],
                  ['Submitted', new Date(selected.createdAt).toLocaleDateString()],
                ].map(([k, v]) => <div key={k} className="mgr-detail-kv"><small>{k}</small><strong>{v}</strong></div>)}
              </div>

              <div className="mgr-detail-section">
                <h4>{translateText("Course Progress")}</h4>
                {(selected.person.courseProgress ?? []).map((cp, i) => (
                  <div key={i} className="mgr-detail-row">
                    <span>{cp.course.title} <em>{translateText("(")}{cp.course.category.replace(/_/g, ' ')}{translateText(")")}</em></span>
                    <div className="mgr-progress-mini wide"><div style={{ width: `${cp.percentage}%` }} /><span>{cp.percentage}{translateText("%")}</span></div>
                  </div>
                ))}
              </div>

              {selected.details && <p className="mgr-feedback-note">{translateText("Note: ")}{selected.details}</p>}
              {selected.managerNotes && <p className="mgr-feedback-note">{translateText("Manager note: ")}{selected.managerNotes}</p>}

              {canReview && selected.status === 'PENDING' && (
                <div className="mgr-action-row" style={{ marginTop: 16 }}>
                  <button className="mgr-btn-primary" onClick={() => review(selected.id, 'approve')}>{translateText("✓ Approve & Issue Certificate")}</button>
                  <button className="mgr-btn-danger" onClick={() => review(selected.id, 'reject')}>{translateText("✗ Reject")}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Certificate preview */}
        {preview && <CertificatePreview cert={preview as IssuedCert} onClose={() => setPreview(null)} />}
      </div>
    );
  }

  // Issued certificates page
  return (
    <div className="mgr-page">
      <div className="mgr-page-header">
        <div><h1>{translateText("Certificates")}</h1><p className="mgr-muted">{translateText("All issued church certificates with manager signature and QR verification.")}</p></div>
      </div>
      {error && <div className="mgr-error">{error}</div>}

      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead><tr><th>{translateText("#")}</th><th>{translateText("Recipient")}</th><th>{translateText("Type")}</th><th>{translateText("Certificate #")}</th><th>{translateText("Issued By")}</th><th>{translateText("Issue Date")}</th><th>{translateText("Action")}</th></tr></thead>
          <tbody>
            {certs.map((c, i) => (
              <tr key={c.id}>
                <td>{i + 1}</td>
                <td><div className="mgr-table-person"><div className="mgr-avatar-sm">{(c.person.firstName ?? '?').slice(0, 1)}</div><span>{fullName(c.person)}</span></div></td>
                <td><span className="mgr-cat-chip">{c.courseTitleSnapshot ?? c.type}</span></td>
                <td><code className="mgr-code">{c.certificateNumber}</code></td>
                <td>{c.issuer.person ? fullName(c.issuer.person) : c.issuer.username}</td>
                <td>{new Date(c.issuedAt).toLocaleDateString()}</td>
                <td>
                  <div className="mgr-action-row">
                    <button className="mgr-btn-sm" onClick={() => setPreview(c)}>{translateText("Preview")}</button>
                    <Link to={`/verify/${c.verificationCode}`} className="mgr-btn-sm">{translateText("Verify")}</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {certs.length === 0 && <div className="mgr-empty">{translateText("No certificates issued yet.")}</div>}
      </div>

      {preview && <CertificatePreview cert={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ── Certificate preview with auto-signature ─────────────────────────────── */
function CertificatePreview({ cert, onClose }: { cert: IssuedCert; onClose: () => void }) {
  return (
    <div className="mgr-modal-backdrop" onClick={onClose}>
      <div className="mgr-cert-preview" onClick={e => e.stopPropagation()}>
        <button className="mgr-modal-close" onClick={onClose}>{translateText("×")}</button>

        <div className="mgr-cert-body">
          <div className="mgr-cert-emblem">{translateText("✝")}</div>
          <p className="mgr-cert-church">{translateText("GRACE EVANGELICAL CHURCH")}</p>
          <p className="mgr-cert-subtitle">{translateText("Worship · Grow · Serve")}</p>
          <h2 className="mgr-cert-title">
            {translateText("CERTIFICATE OF ")}{cert.courseTitleSnapshot ?? cert.type.replace(/_/g, ' ')} {translateText("COMPLETION\n          ")}</h2>
          <p className="mgr-cert-text">{translateText("This certifies that")}</p>
          <h1 className="mgr-cert-name">{fullName(cert.person)}</h1>
          <p className="mgr-cert-text">
            {cert.courseTitleSnapshot ? translateText("has successfully completed the course named above and is awarded this certificate.") : translateText("has successfully completed the required church process and is hereby awarded this certificate of recognition.")}
          </p>

          <div className="mgr-cert-meta">
            <span>{translateText("Certificate No. ")}<strong>{cert.certificateNumber}</strong></span>
            <span>{translateText("Issued ")}<strong>{new Date(cert.issuedAt).toLocaleDateString()}</strong></span>
          </div>

          <div className="mgr-cert-footer">
            <div className="mgr-cert-sig-block">
              {cert.signatureSnapshot?.startsWith('data:image/')
                ? <img src={cert.signatureSnapshot} alt={translateText("Church Manager signature")} className="mgr-cert-sig-img" />
                : <div className="mgr-cert-sig-text">{cert.signatureSnapshot || cert.issuerNameSnapshot}</div>}
              <div className="mgr-cert-sig-line" />
              <strong>{cert.issuerNameSnapshot}</strong>
              <small>{translateText("Church Manager")}</small>
            </div>
            {cert.qrCodeDataUrl && (
              <div className="mgr-cert-qr-block">
                <img src={cert.qrCodeDataUrl} alt={translateText("QR verification code")} />
                <small>{translateText("Scan to verify")}</small>
              </div>
            )}
          </div>
        </div>

        <div className="mgr-cert-actions">
          <button className="mgr-btn-outline" onClick={event => downloadCertificatePdf(event.currentTarget.closest('.mgr-cert-preview') as HTMLElement | null)}>{translateText("⬇ Download PDF")}</button>
          <button className="mgr-btn-primary" onClick={() => window.print()}>{translateText("🖨️ Print Certificate")}</button>
          <Link to={`/verify/${cert.verificationCode}`} className="mgr-btn-outline">{translateText("🔍 Verify")}</Link>
        </div>
      </div>
    </div>
  );
}
