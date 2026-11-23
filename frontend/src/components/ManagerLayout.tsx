import { translateText } from '../i18n/context';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { useLanguage } from '../i18n/context';
import { ThemeToggle } from './ThemeToggle';
import { BackButton } from './BackButton';

type NavItem = { to: string; label: string; adminOnly?: boolean };

export function ManagerLayout() {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const isAdmin = user?.role === 'ADMINISTRATOR';

  const sharedItems: NavItem[] = [
    { to: '/manager/dashboard',  label: 'Dashboard' },
    { to: '/manager/worshipers', label: 'Worshipers' },
    { to: '/manager/members',    label: 'Members' },
    { to: '/manager/home-cells', label: 'Home Cells' },
    { to: '/manager/messages',   label: 'Messages' },
    { to: '/manager/courses',    label: 'Courses' },
    { to: '/manager/baptisms',   label: 'Baptism Requests' },
    { to: '/manager/profile',    label: 'Profile' },
    { to: '/manager/issued-certs', label: 'Certificates' },
  ];

  const adminItems: NavItem[] = [
    { to: '/admin/accounts',       label: 'Manage Accounts',      adminOnly: true },
  ];

  const navItems: NavItem[] = isAdmin
    ? [
        ...sharedItems.slice(0, 6), // Dashboard, worshipers, members, cells, messages, courses
        sharedItems[7],             // Profile
        sharedItems[8],             // Issued certificates
        adminItems[0],              // Manage Accounts
      ]
    : sharedItems;

  const displayName = isAdmin ? 'Admin' : user?.person
    ? `${user.person.firstName} ${user.person.lastName}`
    : user?.username ?? 'Manager';
  const pageTitle = isAdmin
    ? (location.pathname === '/dashboard' || location.pathname === '/manager/dashboard' ? t('Administrator Dashboard') : t('Administration'))
    : t('Church Manager Workspace');

  return (
    <div className={`mgr-root${collapsed ? ' mgr-collapsed' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="mgr-sidebar">
        <div className="mgr-sidebar-head">
          <div className="mgr-cross-mark" aria-hidden="true">✝</div>
          {!collapsed && (
            <div className="mgr-brand-text">
              <strong>{translateText("Grace Evangelical")}</strong>
              <small>{translateText("Church")}</small>
            </div>
          )}
          <button
            className="mgr-collapse-btn"
            onClick={() => setCollapsed(v => !v)}
            aria-label={t('Toggle sidebar')}
          >
            {collapsed ? translateText("›") : translateText("‹")}
          </button>
        </div>

        {!collapsed && (
          <>
            <button className="mgr-user-chip mgr-user-chip-button" onClick={() => navigate(isAdmin ? '/admin/accounts' : '/manager/profile')} title={t('Open account')}>
              <div className="mgr-user-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{displayName}</strong>
                <small>{isAdmin ? t('Administrator account') : t('Church Manager account')}</small>
              </div>
              <span className="mgr-account-chevron">{translateText("↗")}</span>
            </button>
            <div style={{ padding: '0 14px 10px' }}>
              <span className={`mgr-badge ${isAdmin ? 'red' : 'blue'}`} style={{ fontSize: 9, letterSpacing: '.05em' }}>
                {isAdmin ? translateText("ADMINISTRATOR") : translateText("CHURCH MANAGER")}
              </span>
            </div>
          </>
        )}

        <nav className="mgr-nav">
          {isAdmin && <div className="mgr-nav-section">{t('Church operations')}</div>}
          {navItems.filter(item => !item.adminOnly).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `mgr-nav-link${isActive ? ' active' : ''}${item.adminOnly ? ' admin-only-link' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              {!collapsed && (
                <>
                  <span className="mgr-nav-label">{t(item.label)}</span>
                  {item.adminOnly && <span className="mgr-admin-tag">{translateText("Admin")}</span>}
                </>
              )}
              {collapsed && <span className="mgr-nav-label-collapsed">{t(item.label).slice(0, 2)}</span>}
            </NavLink>
          ))}
          {isAdmin && <div className="mgr-nav-section">{t('Administration')}</div>}
          {navItems.filter(item => item.adminOnly).map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `mgr-nav-link admin-only-link${isActive ? ' active' : ''}`} title={collapsed ? item.label : undefined}>
              {!collapsed && <><span className="mgr-nav-label">{t(item.label)}</span><span className="mgr-admin-tag">{t('Admin')}</span></>}
              {collapsed && <span className="mgr-nav-label-collapsed">{t(item.label).slice(0, 2)}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mgr-sidebar-foot">
          {!collapsed && <span>{t('Together in Faith · Grow · Serve')}</span>}
          <button
            className="mgr-signout-btn"
            onClick={() => { logout(); navigate('/login'); }}
            title={t('Sign out')}
          >
            {!collapsed ? `↩ ${t('logout')}` : translateText("↩")}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="mgr-body">
        <header className="mgr-topbar">
          <div className="mgr-topbar-left">
            {location.pathname !== '/manager/dashboard' && location.pathname !== '/dashboard' && <BackButton fallback="/manager/dashboard" />}
            <h1 className="mgr-page-heading">{pageTitle}</h1>
          </div>
          <div className="mgr-topbar-right">
            <NavLink to="/manager/notifications" className="mgr-notif-btn" aria-label={t('Notifications')} title={t('Notifications')}>
              <span aria-hidden="true">{translateText("◉")}</span>
            </NavLink>
            <ThemeToggle />
            <button
              className="mgr-lang-btn"
              onClick={() => setLanguage(language === 'en' ? 'am' : 'en')}
            >
              {language === 'en' ? translateText("አማ") : translateText("EN")}
            </button>
            <div className="mgr-account-menu-wrap">
              <button className="mgr-topbar-user" aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen(v => !v)}>
                <div className="mgr-user-avatar sm">{displayName.slice(0, 1).toUpperCase()}</div>
                <div><span>{displayName}</span><small>{isAdmin ? t('Administrator') : t('Church Manager')}</small></div>
                <span aria-hidden="true">{translateText("⌄")}</span>
              </button>
              {accountOpen && <div className="mgr-account-menu" role="menu">
                <div className="mgr-account-menu-heading"><strong>{displayName}</strong><small>{user?.email}</small><small className="mgr-account-role">{isAdmin ? t('Administrator') : t('Church Manager')}</small></div>
                <Link role="menuitem" to={isAdmin ? '/admin/accounts' : '/manager/profile'} onClick={() => setAccountOpen(false)}>{isAdmin ? t('Administration settings') : t('My profile')}</Link>
                <button role="menuitem" onClick={() => { setAccountOpen(false); logout(); navigate('/login'); }}>{t('Sign out')}</button>
              </div>}
            </div>
          </div>
        </header>

        <main className="mgr-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
