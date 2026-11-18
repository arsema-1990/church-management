import { translateText } from '../i18n/context';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { useLanguage } from '../i18n/context';
import { ThemeToggle } from './ThemeToggle';
import { BackButton } from './BackButton';

export function Layout({ children }: { children?: ReactNode } = {}) {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);

  const isManager    = user?.role === 'ADMINISTRATOR' || user?.role === 'CHURCH_MANAGER';
  const isInstructor = user?.role === 'CLASS_INSTRUCTOR';
  const dashboardPath = isManager ? '/manager/dashboard' : isInstructor ? '/instructor/dashboard' : '/dashboard';

  const links: [string, string][] = isManager ? [
    [dashboardPath,         t('dashboard')],
    ['/worshipers',         t('worshipers')],
    ['/members',            t('members')],
    ['/home-cells',         t('homeCells')],
    ['/manager/courses',    t('courses')],
    ['/manager/classes',    'Classes'],
    ['/manager/requests',   t('requests')],
    ['/certificates',       t('certificates')],
    ['/profile',            t('profile')],
  ] : isInstructor ? [
    [dashboardPath,              t('dashboard')],
    ['/instructor/courses',      t('courses')],
    ['/instructor/home-cells',   t('Home Cell Schedule')],
    ['/instructor/messages',     'Messages'],
    ['/profile',                 t('profile')],
  ] : [
    [dashboardPath,   t('dashboard')],
    ['/profile',      t('profile')],
    ['/courses',      t('courses')],
    ['/requests',     'Requests'],
    ['/certificates', 'Certificates'],
    ['/children',     'My Children'],
    ['/home-cells',   'Home Cell'],
    ['/contact/messages', '✉ Contact & Feedback'],
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="topbar">
        {location.pathname !== dashboardPath && <BackButton fallback={dashboardPath} />}
        <div className="brand">
          <span className="brand-mark">{translateText("✝")}</span>
          <span>
            {translateText("Grace Evangelical Church\n            ")}<small>{translateText("Church Management System")}</small>
          </span>
        </div>
        <nav className="top-links">
          {isInstructor && <NavLink to="/instructor/notifications" className="dashboard-notification" aria-label={translateText("Notifications")} title={translateText("Notifications")}>{translateText("🔔")}</NavLink>}
          <ThemeToggle />
          <button
            className="language-toggle"
            onClick={() => setLanguage(language === 'en' ? 'am' : 'en')}
          >
            {language === 'en' ? translateText("አማ") : translateText("EN")}
          </button>
          <div className="generic-account-wrap">
            <button className="user-chip generic-account-button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(v => !v)}>
              {user?.person ? `${user.person.firstName} ${user.person.lastName}` : user?.username ?? user?.role} <span aria-hidden="true">{translateText("⌄")}</span>
            </button>
            {accountOpen && <div className="generic-account-menu" role="menu">
              <Link role="menuitem" to="/profile" onClick={() => setAccountOpen(false)}>{translateText("My profile")}</Link>
              <button role="menuitem" onClick={() => { setAccountOpen(false); logout(); navigate('/login'); }}>{t('logout')}</button>
            </div>}
          </div>
        </nav>
      </header>

      <div className="app-frame">
        <aside className="sidebar">
          <div className="sidebar-label">{translateText("CHURCH WORKSPACE")}</div>
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-dot" />
              {label}
            </NavLink>
          ))}
          <div className="sidebar-foot">{translateText("Together in faith · Grow · Serve")}</div>
        </aside>
        <main className="page-content">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
