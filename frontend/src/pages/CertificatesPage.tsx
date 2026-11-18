import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';
import { PageTitle } from './RecordsPage';
import { downloadCertificatePdf } from '../utils/downloadCertificate';
import './CertificatesPage.css';

type Certificate = {
  id: string; type: string; certificateNumber: string;
  verificationCode: string; issuedAt: string;
  courseTitleSnapshot?: string;
  issuerNameSnapshot: string; signatureSnapshot?: string;
  qrCodeDataUrl?: string;
  person?: { firstName: string; middleName?: string; lastName: string };
};

export function CertificatesPage() {
  const { user }  = useAuth();
  const [items,  setItems]  = useState<Certificate[]>([]);
  const [error,  setError]  = useState('');
  const [loading,setLoading]= useState(true);

  const isManager = user?.role === 'ADMINISTRATOR' || user?.role === 'CHURCH_MANAGER';

  useEffect(() => {
    api.get(isManager ? '/manager/certificates' : '/portal/certificates')
      .then(({ data }) => setItems(data.certificates ?? []))
      .catch(e => setError(messageFromError(e)))
      .finally(() => setLoading(false));
  }, [isManager]);

  if (loading) return (
    <div className="content-wrap">
      <PageTitle title={translateText("Certificate Center")} />
      <div style={{ display:'grid', gap:24 }}>
        {[...Array(2)].map((_,i) => <div key={i} className="skeleton" style={{ height:320, borderRadius:'var(--r-xl)' }} />)}
      </div>
    </div>
  );

  return (
    <div className="content-wrap">
      <PageTitle
        title={isManager ? 'Certificates' : 'Certificate Center'}
        description="Issued course and baptism certificates with QR verification."
      />
      {error && <div className="error-banner">{error}</div>}

      {!items.length ? (
        <div className="empty-card">
          <span>{translateText("🏅")}</span>
          <strong>{translateText("No certificates issued yet")}</strong>
          <p>{translateText("Course certificates are issued automatically when you complete a course. Other certificates are issued after their required church process.")}</p>
        </div>
      ) : (
        <div className="certificate-list">
          {items.map(cert => (
            <article className="issued-certificate" key={cert.id}>
              <div className="certificate-border">
                {/* Header */}
                <div className="certificate-emblem">{translateText("✝")}</div>
                <p style={{ fontSize:10,fontWeight:800,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--navy-500)',margin:'0 0 4px' }}>
                  {translateText("GRACE EVANGELICAL CHURCH · WORSHIP · GROW · SERVE\n                ")}</p>

                <h2>{translateText("CERTIFICATE OF ")}{cert.courseTitleSnapshot ?? cert.type.replace(/_/g,' ')} {translateText("COMPLETION")}</h2>
                <p>{translateText("This certifies that")}</p>

                <h3>
                  {cert.person
                    ? [cert.person.firstName, cert.person.middleName, cert.person.lastName].filter(Boolean).join(' ')
                    : translateText("Church Member")}
                </h3>

                <p>{cert.courseTitleSnapshot ? translateText("has successfully completed the course named above and is awarded this certificate.") : translateText("has completed the required church process and is hereby awarded this certificate of recognition.")}</p>

                <div className="certificate-meta">
                  <span>{translateText("Certificate No. ")}<strong>{cert.certificateNumber}</strong></span>
                  <span>{translateText("Issued ")}<strong>{new Date(cert.issuedAt).toLocaleDateString('en-GB',{ day:'numeric',month:'long',year:'numeric' })}</strong></span>
                </div>

                {/* Footer: signature + QR */}
                <div className="certificate-footer">
                  <div className="signature-line">
                    {cert.signatureSnapshot?.startsWith('data:image/')
                      ? <img src={cert.signatureSnapshot} alt={translateText("Manager signature")} />
                      : cert.signatureSnapshot
                        ? <div className="sig-text">{cert.signatureSnapshot}</div>
                        : <div className="sig-text">{cert.issuerNameSnapshot}</div>}
                    <div className="sig-rule" />
                    <strong>{cert.issuerNameSnapshot}</strong>
                    <small>{translateText("Church Manager")}</small>
                  </div>

                  {cert.qrCodeDataUrl && (
                    <div style={{ textAlign:'center' }}>
                      <img className="certificate-qr" src={cert.qrCodeDataUrl} alt={translateText("QR verification code")} />
                      <div style={{ fontSize:9,color:'var(--text-muted)',marginTop:5 }}>{translateText("Scan to verify")}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="certificate-actions">
                <Link to={`/verify/${cert.verificationCode}`} className="btn-outline btn-sm">
                  {translateText("🔍 Verify\n                ")}</Link>
                <button className="btn-outline btn-sm" onClick={event => downloadCertificatePdf(event.currentTarget.closest('.issued-certificate') as HTMLElement | null)}>
                  {translateText("⬇ Download PDF")}
                </button>
                <button className="btn-primary btn-sm" onClick={() => window.print()}>
                  {translateText("🖨️ Print\n                ")}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
