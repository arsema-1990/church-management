import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, messageFromError } from '../api';

type CertData = {
  recipient: string; type: string;
  courseTitleSnapshot?: string | null;
  certificateNumber: string; issuer: string; issuedAt: string;
};

export function VerifyPage() {
  const { code } = useParams();
  const [data,    setData]    = useState<CertData | null>(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/portal/verify/${code}`)
      .then(r => setData(r.data.certificate))
      .catch(e => setError(messageFromError(e)))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <main className="verify-screen">
      <section className="certificate-card">
        <div className="certificate-emblem">{translateText("✝")}</div>
        <p style={{ fontSize:10,fontWeight:800,letterSpacing:'.16em',textTransform:'uppercase',color:'var(--navy-400)',marginBottom:14 }}>
          {translateText("GRACE EVANGELICAL CHURCH · CERTIFICATE VERIFICATION\n        ")}</p>

        {loading && (
          <div style={{ display:'grid', gap:10, margin:'20px 0' }}>
            <div className="skeleton skeleton-title" style={{ margin:'0 auto', width:'50%' }} />
            <div className="skeleton skeleton-text" style={{ margin:'0 auto', width:'70%' }} />
          </div>
        )}

        {!loading && data && (
          <>
            <div className="verified-mark">{translateText("✓")}</div>
            <h1 style={{ color:'var(--navy-900)', marginBottom:6 }}>{translateText("Certificate Verified")}</h1>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>
              {translateText("This certificate is valid in the church records.\n            ")}</p>
            <dl className="certificate-dl">
              {[
                ['Recipient',         data.recipient],
                ['Certificate Type',  data.type.replace(/_/g,' ')],
                ...(data.courseTitleSnapshot ? [['Course', data.courseTitleSnapshot]] : []),
                ['Certificate No.',   data.certificateNumber],
                ['Issued By',         data.issuer],
                ['Issue Date',        new Date(data.issuedAt).toLocaleDateString('en-GB',{ day:'numeric',month:'long',year:'numeric' })],
              ].map(([label, value]) => (
                <>
                  <dt key={`${label}-dt`}>{label}</dt>
                  <dd key={`${label}-dd`}>{value}</dd>
                </>
              ))}
            </dl>
          </>
        )}

        {!loading && error && (
          <>
            <div style={{ width:62,height:62,borderRadius:'50%',background:'var(--red-bg)',color:'var(--red-text)',fontSize:28,display:'grid',placeItems:'center',margin:'20px auto',border:'3px solid var(--red-border)' }}>{translateText("✗")}</div>
            <h1 style={{ color:'var(--red-text)' }}>{translateText("Verification Failed")}</h1>
            <p style={{ fontSize:13, color:'var(--text-muted)', margin:'8px 0 20px' }}>{error}</p>
          </>
        )}

        <Link to="/" style={{ display:'inline-flex',alignItems:'center',gap:6,marginTop:20,fontSize:12,color:'var(--navy-600)',fontWeight:600 }}>
          {translateText("← Return to church portal\n        ")}</Link>
      </section>
    </main>
  );
}
