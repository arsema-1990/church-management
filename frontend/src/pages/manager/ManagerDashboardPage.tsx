import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../../api';
import { useAuth } from '../../state';
import { useLanguage } from '../../i18n/context';

type Stats = {
  worshipers: number; members: number; homeCells: number;
  courses: number; classes: number; certificates: number;
  baptisms: number; classCourseApprovals: number;
};
type Activity = { id: string; type: string; message: string; createdAt: string };

const STAT_CARDS = [
  { key: 'worshipers',           label: 'Total Worshipers',     color: 'blue',   link: '/manager/worshipers' },
  { key: 'members',              label: 'Total Members',        color: 'green',  link: '/manager/members' },
  { key: 'homeCells',            label: 'Home Cells',           color: 'purple', link: '/manager/home-cells' },
  { key: 'courses',              label: 'Total Courses',        color: 'orange', link: '/manager/courses' },
  { key: 'classes',              label: 'Total Classes',        color: 'cyan',   link: '/manager/classes' },
  { key: 'certificates',         label: 'Issued Certificates', color: 'red',    link: '/manager/issued-certs' },
  { key: 'baptisms',             label: 'Pending Baptism',      color: 'blue',   link: '/manager/baptisms' },
  { key: 'classCourseApprovals', label: 'Pending Approvals',    color: 'gold',   link: '/manager/courses' },
] as const;

function fmtTime(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 60000;
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

export function ManagerDashboardPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.get('/manager/dashboard')
      .then(({ data }) => { setStats(data.stats); setActivity(data.recentActivity ?? []); })
      .catch(e => setError(messageFromError(e)))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = user?.role === 'ADMINISTRATOR';
  const displayName = isAdmin ? 'Admin' : user?.person
    ? `${user.person.firstName} ${user.person.lastName}`
    : user?.username ?? 'Manager';

  return (
    <div className="mgr-page">
      {/* Welcome */}
      <div className="mgr-welcome-banner">
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: 'var(--gold-300)', marginBottom: 8, textTransform: 'uppercase' }}>
            {isAdmin ? t('ADMINISTRATOR · SYSTEM MANAGEMENT') : t('CHURCH MANAGER')}
          </p>
          <h1>{t('Welcome back')}{translateText(", ")}{displayName}{translateText("!")}</h1>
          <p className="mgr-welcome-sub">{isAdmin ? t('Administration overview, account access, and church operations.') : t('May God give you wisdom as you serve His people.')}</p>
        </div>
        <div className="mgr-welcome-cross" aria-hidden="true">{translateText("✝")}</div>
      </div>

      {error && <div className="mgr-error">{error}</div>}

      {/* Stat cards */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
          {[...Array(STAT_CARDS.length)].map((_, i) => (
            <div key={i} className="skeleton skeleton-card" style={{ height: 96 }} />
          ))}
        </div>
      ) : (
        <section className="mgr-stats-grid">
          {STAT_CARDS.filter(card => !isAdmin || !['certificates', 'baptisms'].includes(card.key)).map(card => (
            <Link to={card.link} key={card.key} className={`stat-card stat-${card.color}`} style={{ textDecoration: 'none' }}>
              <div>
                <small>{t(card.label)}</small>
                <strong>{stats ? String(stats[card.key as keyof Stats] ?? 0) : translateText("—")}</strong>
              </div>
            </Link>
          ))}
        </section>
      )}

      <div className="mgr-two-col">
        {/* Recent Activity */}
        <section className="mgr-panel">
          <h2 className="mgr-panel-title">{t('Recent Activity')}</h2>
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                  <div className="skeleton skeleton-text" style={{ width: '75%' }} />
                  <div className="skeleton skeleton-text" style={{ width: '40%', height: 11 }} />
                </div>
              </div>
            ))
          ) : activity.length === 0 ? (
            <p className="mgr-muted">{t('No recent activity.')}</p>
          ) : (
            activity.map(a => (
              <div key={a.id} className="mgr-activity-row">
                <div className="mgr-activity-dot" data-type={a.type} />
                <div className="mgr-activity-body">
                  <p>{a.message}</p>
                  <small>{fmtTime(a.createdAt)}</small>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Quick actions */}
        <section className="mgr-panel">
          <h2 className="mgr-panel-title">{t('Quick Actions')}</h2>
          <div className="mgr-quick-grid">
            {[
              ...(isAdmin ? [
                ['/admin/accounts', 'Manage Staff Accounts'],
              ] : []),
              ...(!isAdmin ? [
                ['/manager/certificates', 'Review Certificates'],
                ['/manager/baptisms',     'Baptism Requests'],
              ] : []),
              ['/manager/courses',       'Review Courses'],
              ['/manager/members',       'View Members'],
              ['/manager/worshipers',    'View Worshipers'],
              ['/manager/home-cells',    'Home Cells'],
            ].map(([to, label]) => (
              <Link key={to} to={to} className="mgr-quick-card">
                <strong>{t(label)}</strong>
              </Link>
            ))}
          </div>

          {/* Approval center */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border-light)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
              {isAdmin ? t('Administration & Approvals') : t('Approval Center')}
            </p>
            {[
              ...(isAdmin ? [
                { label: 'Manage Staff Accounts', count: null, to: '/admin/accounts', color: 'var(--navy-600)' },
              ] : []),
              ...(!isAdmin ? [
                { label: 'Certificate Requests', count: stats?.certificates ?? 0, to: '/manager/certificates', color: '#dc2626' },
                { label: 'Baptism Requests', count: stats?.baptisms ?? 0, to: '/manager/baptisms', color: '#0891b2' },
              ] : []),
              { label: 'Course Approvals',      count: stats?.classCourseApprovals ?? 0, to: '/manager/courses',      color: 'var(--navy-600)' },
            ].map(item => (
              <Link key={item.to} to={item.to} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)', textDecoration: 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--navy-700)', fontWeight: 500 }}>{t(item.label)}</span>
                {item.count !== null && <span style={{ background: item.count > 0 ? item.color : 'var(--surface-3)', color: item.count > 0 ? '#fff' : 'var(--text-muted)', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>{item.count}</span>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
