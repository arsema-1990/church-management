import { translateText } from './i18n/context';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './state';

// Layouts
import { Layout }        from './components/Layout';
import { ManagerLayout } from './components/ManagerLayout';

// Public / shared
import { AuthPage }                from './pages/AuthPage';
import { ForgotPasswordPage }      from './pages/ForgotPasswordPage';
import { RegisterPage }            from './pages/RegisterPage';
import { EmailVerificationPage }   from './pages/EmailVerificationPage';
import { VerifyPage }              from './pages/VerifyPage';
import { LandingPage }             from './pages/LandingPage';
import { ForcePasswordChangePage } from './pages/ForcePasswordChangePage';
import { InstructorMessagesPage } from './pages/InstructorMessagesPage';
import { InstructorHomeCellsPage } from './pages/instructor/InstructorHomeCellsPage';

// Worshiper / Member portal
import { WorshiperPortalPage } from './pages/WorshiperPortalPage';
import { ProfilePage }         from './pages/ProfilePage';
import { CoursesPage }         from './pages/CoursesPage';
import { RequestsPage }        from './pages/RequestsPage';
import { ChildrenPage }        from './pages/ChildrenPage';

import { ContactPage }         from './pages/ContactPage';
import { PublicContactPage }   from './pages/PublicContactPage';

// Instructor / Staff
import { DashboardPage } from './pages/DashboardPage';
import { RecordsPage }   from './pages/RecordsPage';

// Manager / Admin pages
import { ManagerDashboardPage }     from './pages/manager/ManagerDashboardPage';
import { ManagerWorshipersPage }    from './pages/manager/ManagerWorshipersPage';
import { ManagerMembersPage }       from './pages/manager/ManagerMembersPage';
import { ManagerHomeCellsPage }     from './pages/manager/ManagerHomeCellsPage';
import { ManagerCoursesPage }       from './pages/manager/ManagerCoursesPage';
import { ManagerCertificatesPage }  from './pages/manager/ManagerCertificatesPage';
import { ManagerRequestsPage }      from './pages/manager/ManagerRequestsPage';
import { ManagerProfilePage }       from './pages/manager/ManagerProfilePage';
import { ManagerNotificationsPage } from './pages/manager/ManagerNotificationsPage';
import { AdminAccountsPage }        from './pages/manager/AdminAccountsPage';
import { ManagerMessagesPage }      from './pages/manager/ManagerMessagesPage';

/* ── Role groups ──────────────────────────────────────────────────────────── */
const PORTAL_ROLES  = ['WORSHIPER', 'MEMBER'];
const MANAGER_ROLES = ['ADMINISTRATOR', 'CHURCH_MANAGER'];
const ADMIN_ONLY    = ['ADMINISTRATOR'];
const INSTRUCTOR    = ['CLASS_INSTRUCTOR'];

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function Guard({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    if (MANAGER_ROLES.includes(user.role)) return <Navigate to="/manager/dashboard" replace />;
    if (INSTRUCTOR.includes(user.role)) return <Navigate to="/instructor/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function MustChangePwd({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

/* ── Decide where to send a logged-in user when they hit / ───────────────── */
function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <LandingPage />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (MANAGER_ROLES.includes(user.role)) return <Navigate to="/manager/dashboard" replace />;
  if (PORTAL_ROLES.includes(user.role))  return <WorshiperPortalPage />;
  if (INSTRUCTOR.includes(user.role))    return <Navigate to="/instructor/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>

      {/* ── Public ────────────────────────────────────────────────── */}
      <Route path="/"             element={<HomeRedirect />} />
      <Route path="/login"        element={user && !user.mustChangePassword ? <Navigate to={
        user.role === 'ADMINISTRATOR' || user.role === 'CHURCH_MANAGER' ? '/manager/dashboard'
          : user.role === 'CLASS_INSTRUCTOR' ? '/instructor/dashboard'
          : '/dashboard'
      } replace /> : <AuthPage />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage />} />
      <Route path="/register"     element={user ? <Navigate to={
        user.role === 'ADMINISTRATOR' || user.role === 'CHURCH_MANAGER' ? '/manager/dashboard'
          : user.role === 'CLASS_INSTRUCTOR' ? '/instructor/dashboard'
          : '/dashboard'
      } replace /> : <RegisterPage />} />
      <Route path="/verify-email" element={<EmailVerificationPage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />
      <Route path="/contact" element={<PublicContactPage />} />

      {/* ── Force password change ──────────────────────────────────── */}
      <Route path="/change-password" element={
        user ? <ForcePasswordChangePage /> : <Navigate to="/login" replace />
      } />

      {/* ── Manager / Admin portal ─────────────────────────────────── */}
      {/* Uses ManagerLayout which renders <Outlet /> for child pages  */}
      <Route element={<MustChangePwd><Guard roles={MANAGER_ROLES}><ManagerLayout /></Guard></MustChangePwd>}>
        <Route path="/manager/dashboard"     element={<ManagerDashboardPage />} />
        <Route path="/manager/messages"      element={<ManagerMessagesPage />} />
        <Route path="/manager/worshipers"    element={<ManagerWorshipersPage />} />
        <Route path="/manager/members"       element={<ManagerMembersPage />} />
        <Route path="/manager/home-cells"    element={<ManagerHomeCellsPage />} />
        <Route path="/manager/courses"       element={<ManagerCoursesPage />} />
        <Route path="/manager/classes"       element={<ManagerCoursesPage />} />
        <Route path="/manager/baptisms"      element={<ManagerRequestsPage />} />
        <Route path="/manager/notifications" element={<ManagerNotificationsPage />} />
        <Route path="/manager/profile"       element={<ManagerProfilePage />} />
        {/* Admin-only routes */}
        <Route path="/manager/certificates"  element={<Navigate to="/manager/issued-certs" replace />} />
        <Route path="/manager/issued-certs"  element={<ManagerCertificatesPage issued />} />
        <Route path="/admin/accounts"        element={<Guard roles={ADMIN_ONLY}><AdminAccountsPage /></Guard>} />
        {/* Short aliases */}
        <Route path="/worshipers"            element={<ManagerWorshipersPage />} />
        <Route path="/members"               element={<ManagerMembersPage />} />
        <Route path="/home-cells"            element={<ManagerHomeCellsPage />} />
      </Route>

      {/* ── Instructor portal ──────────────────────────────────────── */}
      <Route element={<MustChangePwd><Guard roles={INSTRUCTOR}><Layout /></Guard></MustChangePwd>}>
        <Route path="/instructor/dashboard"      element={<DashboardPage />} />
        <Route path="/instructor/messages"       element={<InstructorMessagesPage />} />
        <Route path="/instructor/home-cells"     element={<InstructorHomeCellsPage />} />
        <Route path="/instructor/courses"       element={<CoursesPage instructor />} />
        <Route path="/instructor/notifications" element={<RecordsPage title={translateText("Notifications")} endpoint="/instructor/notifications" collection="notifications" />} />
        <Route path="/profile"                   element={<ProfilePage />} />
      </Route>

      {/* ── Worshiper / Member portal (unified sidebar layout) ── */}
      {/* The WorshiperPortalPage provides the unified, consistent portal workspace */}
      <Route path="/worshiper-portal" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage /></Guard></MustChangePwd>} />
      <Route path="/dashboard" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage /></Guard></MustChangePwd>} />
      <Route path="/courses" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage initialTab="courses" /></Guard></MustChangePwd>} />
      <Route path="/courses/:courseId" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage initialTab="courses" /></Guard></MustChangePwd>} />
      <Route path="/certificates" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage initialTab="certificates" /></Guard></MustChangePwd>} />
      <Route path="/home-cells" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage initialTab="homeCell" /></Guard></MustChangePwd>} />
      <Route path="/profile" element={<MustChangePwd><Guard roles={PORTAL_ROLES}><WorshiperPortalPage initialTab="profile" /></Guard></MustChangePwd>} />

      {/* Worshiper secondary sub-pages */}
      <Route element={<MustChangePwd><Guard roles={PORTAL_ROLES}><Layout /></Guard></MustChangePwd>}>
        <Route path="/requests"     element={<RequestsPage />} />
        <Route path="/children"     element={<ChildrenPage />} />
        <Route path="/contact/messages" element={<ContactPage />} />
      </Route>

      {/* ── Catch-all ─────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
