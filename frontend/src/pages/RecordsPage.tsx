import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, messageFromError } from '../api';
import { useLanguage } from '../i18n/context';

type RecordValue = Record<string, unknown>;

const SKIP_KEYS = new Set(['id','personId','userId','status','type','createdAt','updatedAt','person','member','members','materials','progress','enrollments','requests','certificates','baptisms','children','homeCells','cellMemberships','addresses','attendance','activities','assignedClasses','__typename']);

function displayName(value: RecordValue): string {
  return (
    [value.firstName, value.middleName, value.lastName].filter(Boolean).map(String).join(' ') ||
    String(value.name ?? value.title ?? value.certificateNumber ?? 'Church record')
  );
}

export function PageTitle({ title, description }: { title: string; description?: string }): ReactNode {
  const { t } = useLanguage();
  return (
    <div className="page-title">
      <p className="eyebrow">{t('Church Management System')}</p>
      <h1>{t(title)}</h1>
      {description && <p>{t(description)}</p>}
    </div>
  );
}

export function RecordsPage({ title, endpoint, collection }: { title: string; endpoint: string; collection: string }) {
  const [items, setItems]   = useState<RecordValue[]>([]);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(endpoint)
      .then(({ data }) => {
        const list = data[collection] ?? data.homeCells ?? [];
        setItems(Array.isArray(list) ? list : []);
      })
      .catch(e => setError(messageFromError(e)))
      .finally(() => setLoading(false));
  }, [endpoint, collection]);

  return (
    <div className="content-wrap">
      <PageTitle title={title} description="Church records linked to your account and assigned role." />
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <div className="loading-card">{translateText("Loading records…")}</div>
      ) : !items.length ? (
        <div className="empty-card">
          <span>{translateText("✧")}</span>
          <strong>{translateText("No records found")}</strong>
          <p>{translateText("Records will appear here when available for your account.")}</p>
        </div>
      ) : (
        <div className="record-grid">
          {items.map((item, i) => (
            <article className="record-card" key={String(item.id ?? item.personId ?? i)}>
              <div className="record-top">
                <span className="record-avatar">
                  {String(item.firstName ?? item.name ?? item.title ?? title).slice(0, 1).toUpperCase()}
                </span>
                <span className="status-tag">{String(item.status ?? item.type ?? item.role ?? 'Active')}</span>
              </div>
              <h2>{displayName(item)}</h2>
              <div className="record-details">
                {Object.entries(item)
                  .filter(([key, value]) => !SKIP_KEYS.has(key) && value !== null && typeof value !== 'object')
                  .slice(0, 5)
                  .map(([key, value]): ReactNode => (
                    <p key={key}>
                      <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                      <strong>{String(value ?? '')}</strong>
                    </p>
                  ))}
              </div>
              {Boolean(item.person) && (
                <div className="sub-record">
                  {displayName(item.person as RecordValue)}
                  {(item.person as RecordValue).email ? ` · ${String((item.person as RecordValue).email)}` : translateText("")}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
