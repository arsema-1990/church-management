import { translateText } from '../i18n/context';
import { useEffect, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';
import { downloadCertificatePdf } from '../utils/downloadCertificate';
import { useLanguage } from '../i18n/context';
import { ThemeToggle } from '../components/ThemeToggle';
import { CourseStudy } from './CoursesPage';

/* ─── types ──────────────────────────────────────────────────────────────── */
type Person = {
  id: string; firstName: string; middleName?: string; lastName: string;
  email?: string; phone?: string; officeTelephone?: string; homeTelephone?: string; photoUrl?: string;
  placeOfBirth?: string; maritalStatus?: string; gender?: string; dateOfBirth?: string; nationality?: string;
  occupation?: string; makingALiving?: string; yearReceivedLord?: string; yearBaptized?: string;
  previousChurch?: string; previousChurchName?: string; sharesHomeAssociation?: string; homeAssociationReason?: string;
  sharesWhoseHouse?: string; unionLeaderName?: string; familySize?: string; numberOfChildren?: string;
  childrenKnowLord?: string; poorNotKnowLord?: string; unemployedInHousehold?: string; currentService?: string;
  pastService?: string; serviceLoad?: string;
  status: string; createdAt: string; previousBaptismCertificateUrl?: string;
};
type Progress = {
  percentage: number; completedLessons: number[];
  course: { id: string; title: string; category: string; status: string; lessons: string[] };
};
type AvailableCourse = { id: string; title: string; description?: string; category: string; duration?: string; thumbnailUrl?: string };
type Certificate = { id: string; type: string; certificateNumber: string; verificationCode: string; issuedAt: string; courseTitleSnapshot?: string; qrCodeDataUrl?: string; signatureSnapshot?: string; issuerNameSnapshot: string };
type Request = { id: string; type: string; status: string; details?: string; scheduledDate?: string; managerNotes?: string; createdAt: string };
type Notification = { id: string; title: string; message: string; category: string; targetUrl?: string; readAt?: string; createdAt: string };
type PortalMessage = Notification & { direction: 'received' | 'sent'; senderId?: string; senderName: string; recipientName?: string };
type MessageRecipient = { id: string; username: string; role: string; person?: { firstName: string; lastName: string } | null };
type HomeCell = { id: string; name: string; location?: string; meetingDay?: string; meetingTime?: string; leader?: { firstName: string; lastName: string }; activities?: { id: string; title: string; type: string; scheduledAt?: string }[] };
type Child = { child: { id: string; firstName: string; middleName?: string; lastName?: string; dateOfBirth?: string; grade?: string } };

type DashData = {
  user: { id: string; role: string; username: string; email: string };
  person: Person & { member?: { id: string; membershipNumber: string; membershipDate: string; status: string } | null; parentLinks?: Child[]; requests?: Request[]; certificates?: Certificate[]; baptisms?: { id: string; baptizedAt: string }[] };
  stats: { pendingRequests: number; courses: number; certificates: number; unreadNotifications: number };
  progress: Progress[];
  notifications: Notification[];
};

/* ─── journey steps ─────────────────────────────────────────────────────── */
const JOURNEY = [
  { key: 'registered',   label: 'Registered' },
  { key: 'course',       label: 'Beginner Course' },
  { key: 'certificate',  label: 'Course Certificate' },
  { key: 'baptism',      label: 'Baptism' },
  { key: 'member',       label: 'Member' },
];

function journeyStep(data: DashData): number {
  const { person, progress } = data;
  if (!person) return 0;
  // is member — check cell from homeCells state loaded separately
  if (person.member) return 4;
  if (person.baptisms?.length) return 4;
  const hasCert = person.certificates?.some(c => c.type === 'COURSE');
  if (hasCert) return 3;
  const beginner = progress.find(p => p.course.category === 'BEGINNER');
  if ((beginner?.percentage ?? 0) > 0) return 1;
  return 0;
}

/* ─── helpers ───────────────────────────────────────────────────────────── */
function fullName(p?: { firstName: string; middleName?: string; lastName: string } | null) {
  if (!p) return '';
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}
function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString() : '—';
}
function courseCategoryLabel(category: string) {
  if (category === 'HOUSEHOLD') return 'Home Cell Advanced Course';
  if (category === 'BEGINNER') return 'Beginner Course';
  return category.replace(/_/g, ' ');
}
function courseGroupTitle(category: string) {
  if (category === 'BEGINNER') return 'Beginner Courses';
  if (category === 'HOUSEHOLD') return 'Home Cell Courses';
  if (category === 'NORMAL_DAY_TO_DAY') return 'Day-to-Day Courses';
  if (category === 'CHILDREN') return 'Children Courses';
  return `${category.replace(/_/g, ' ')} Courses`;
}

/* ══════════════════════════════════════════════════════════════════════════ */
export function WorshiperPortalPage({ initialTab }: { initialTab?: 'home' | 'courses' | 'certificates' | 'homeCell' | 'notifications' | 'messages' | 'profile' } = {}) {
  const { logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { courseId: routeCourseId } = useParams<{ courseId?: string }>();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(routeCourseId ?? null);
  const [data, setData] = useState<DashData | null>(null);
  const [homeCells, setHomeCells] = useState<HomeCell[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [availableCourses, setAvailableCourses] = useState<AvailableCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'courses' | 'certificates' | 'homeCell' | 'notifications' | 'messages' | 'profile'>(
    routeCourseId ? 'courses' : initialTab ?? (searchParams.get('tab') as any) ?? 'home'
  );

  useEffect(() => {
    if (routeCourseId) {
      setSelectedCourseId(routeCourseId);
      setActiveTab('courses');
    }
  }, [routeCourseId]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['home', 'courses', 'certificates', 'homeCell', 'notifications', 'messages', 'profile'].includes(tabParam)) {
      setActiveTab(tabParam as any);
      if (tabParam !== 'courses') setSelectedCourseId(null);
    }
  }, [searchParams]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messageRecipients, setMessageRecipients] = useState<MessageRecipient[]>([]);
  const [messageRecipientId, setMessageRecipientId] = useState('');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get('/portal/dashboard');
      setData(d);
      const isMemberUser = d.user?.role === 'MEMBER';
      const [hcRes, chRes] = await Promise.allSettled([
        isMemberUser ? api.get('/portal/home-cell') : Promise.resolve(null),
        api.get('/portal/children'),
      ]);
      if (hcRes.status === 'fulfilled' && hcRes.value?.data?.homeCells) {
        setHomeCells(hcRes.value.data.homeCells);
      }
      if (chRes.status === 'fulfilled' && chRes.value?.data?.children) {
        setChildren(chRes.value.data.children);
      }
    } catch (e) { setError(messageFromError(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeTab !== 'courses') return;
    let active = true;
    setCoursesLoading(true);
    setCoursesError('');
    api.get('/courses')
      .then(({ data }) => { if (active) setAvailableCourses(data.courses ?? []); })
      .catch(error => { if (active) setCoursesError(messageFromError(error)); })
      .finally(() => { if (active) setCoursesLoading(false); });
    return () => { active = false; };
  }, [activeTab, children.length]);

  useEffect(() => {
    if (activeTab !== 'messages') return;
    Promise.all([api.get('/portal/messages'), api.get('/portal/messages/recipients')]).then(([inbox, people]) => {
      setMessages(inbox.data.messages ?? []);
      const recipients = people.data.users ?? [];
      setMessageRecipients(recipients);
      setMessageRecipientId(current => current && recipients.some((person: MessageRecipient) => person.id === current) ? current : recipients[0]?.id ?? '');
    }).catch(() => { setMessages([]); setMessageRecipients([]); });
  }, [activeTab]);

  const markRead = async (id: string) => {
    await api.patch(`/portal/notifications/${id}/read`).catch(() => null);
    setData(prev => prev ? { ...prev, notifications: prev.notifications.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n) } : prev);
  };

  const markAllRead = async () => {
    await api.post('/portal/notifications/read-all').catch(() => null);
    setData(prev => prev ? { ...prev, notifications: prev.notifications.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })), stats: { ...prev.stats, unreadNotifications: 0 } } : prev);
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault(); setSubmitMsg(''); setSubmitErr('');
    try {
      if (!messageRecipientId) throw new Error('Choose a recipient before sending.');
      const subject = messageSubject.trim(); const message = messageBody.trim();
      if (subject.length < 2 || subject.length > 160 || !message || message.length > 5000) throw new Error('Enter a subject of 2–160 characters and a message of 1–5,000 characters.');
      await api.post('/portal/messages', { recipientId: messageRecipientId, subject, message });
      setMessageSubject(''); setMessageBody(''); setSubmitMsg('Message sent to the Church Manager.');
      const { data: inbox } = await api.get('/portal/messages'); setMessages(inbox.messages ?? []);
    } catch (e) { setSubmitErr(messageFromError(e)); }
  };

  const replyToMessage = (message: PortalMessage) => {
    if (!message.senderId) return;
    setMessageRecipientId(message.senderId);
    setMessageSubject(`Re: ${message.title.replace(/^Re:\s*/i, '')}`);
    document.getElementById('portal-message-compose')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (!data) return (
    <div className="portal-loading">
      <div className="portal-loading-inner">
        <div className="portal-spinner" />
        <p>{t('Loading your church workspace…')}</p>
      </div>
    </div>
  );

  const { person, progress } = data;
  const isMember = data.user.role === 'MEMBER';
  const step = journeyStep(data);
  const worshiperStep = step;
  const beginner = isMember ? undefined : progress.find(p => p.course.category === 'BEGINNER');
  const homeCellCourse = isMember ? progress.find(p => p.course.category === 'HOUSEHOLD') : undefined;
  const pct = beginner?.percentage ?? 0;
  const hasCourseCertificate = person?.certificates?.some(c => c.type === 'COURSE') ?? false;
  const hasBaptism = (person?.baptisms?.length ?? 0) > 0;
  const hasBaptismCertificate = person?.certificates?.some(c => c.type === 'BAPTISM') ?? false;
  const unread = data.notifications.filter(n => !n.readAt).length;
  const courseGroups = Array.from(availableCourses.reduce((groups, course) => {
    const group = groups.get(course.category) ?? [];
    group.push(course);
    groups.set(course.category, group);
    return groups;
  }, new Map<string, AvailableCourse[]>()));
  const categoryOrder = ['BEGINNER', 'HOUSEHOLD', 'NORMAL_DAY_TO_DAY', 'CHILDREN'];
  courseGroups.sort(([a], [b]) => {
    const aOrder = categoryOrder.indexOf(a);
    const bOrder = categoryOrder.indexOf(b);
    return (aOrder < 0 ? categoryOrder.length : aOrder) - (bOrder < 0 ? categoryOrder.length : bOrder);
  });

  const navGroups: { label: string; links: { key: typeof activeTab; label: string; icon: string }[] }[] = [
    { label: t('Overview'), links: [{ key: 'home', label: t('Home'), icon: '⌂' }] },
    { label: t('Learning'), links: [
      { key: 'courses', label: t('Courses'), icon: '▤' },
      { key: 'certificates' as typeof activeTab, label: t('Certificates'), icon: '☆' },
      { key: 'homeCell' as typeof activeTab, label: t('Home Cell'), icon: '⌂' },
    ] },
    { label: t('Communication'), links: [
      { key: 'messages', label: t('Messages'), icon: '✉' },
    ] },
    { label: t('Account'), links: [{ key: 'profile', label: t('Profile'), icon: '👤' }] },
  ];
  const navLinks = navGroups.flatMap(group => group.links);

  return (
    <div className={'portal-root' + (isMember ? ' portal-root-member' : '') + (sidebarCollapsed ? ' portal-root-sidebar-collapsed' : '')}>
      {/* ── TOP NAV ── */}
      <header className="portal-topnav">
        <button className="portal-hamburger portal-top-menu" onClick={() => {
          if (window.matchMedia('(max-width: 900px)').matches) setMobileMenuOpen(value => !value);
          else setSidebarCollapsed(value => !value);
        }} aria-label={translateText("Toggle navigation")} aria-expanded={window.matchMedia('(max-width: 900px)').matches ? mobileMenuOpen : !sidebarCollapsed}>
          {mobileMenuOpen ? translateText("✕") : translateText("☰")}
        </button>
        <div className="portal-top-spacer" />
        <div className="portal-nav-right">
          <button
            className="portal-lang-btn"
            onClick={() => setLanguage(language === 'en' ? 'am' : 'en')}
            aria-label={translateText("Change language")}
            title={translateText("Change language")}
          >
            {language === 'en' ? 'EN' : 'አማ'} <span aria-hidden="true">⌄</span>
          </button>
          <ThemeToggle compact />
          <button className="dashboard-notification portal-top-notification" onClick={() => setActiveTab('notifications')} aria-label={`${translateText("Notifications")}${unread ? `, ${unread} ${translateText("unread")}` : ''}`} title={translateText("Notifications")}>
            <span aria-hidden="true">{translateText("🔔")}</span>
            {unread > 0 && <span className="portal-badge">{unread}</span>}
          </button>
          <div className="portal-account-wrap">
            <button className="portal-account-button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>
              <span className="portal-account-avatar">{person?.photoUrl ? <img src={person.photoUrl} alt="" /> : person?.firstName?.slice(0, 1).toUpperCase() || 'A'}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {accountOpen && <div className="portal-account-menu" role="menu">
              <div><strong>{fullName(person) || data.user.username}</strong><small>{isMember ? t('Member') : t('Worshiper')}</small></div>
              <button role="menuitem" onClick={() => { setAccountOpen(false); setActiveTab('profile'); }}>{t('My Profile')}</button>
              <button role="menuitem" onClick={() => { setAccountOpen(false); logout(); navigate('/login'); }}>{t('Sign out')}</button>
            </div>}
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <div className="portal-mobile-nav">
          {navLinks.map(link => (
            <button key={link.key} aria-label={link.key === 'notifications' ? link.label : undefined} className={`portal-mobile-link${activeTab === link.key ? ' active' : ''}`}
              onClick={() => {
                setSelectedCourseId(null);
                setActiveTab(link.key);
                setMobileMenuOpen(false);
                if (link.key === 'home') navigate('/dashboard');
                else navigate(`/dashboard?tab=${link.key}`);
              }}>
              {link.icon} {link.label}
            </button>
          ))}
          <button className="portal-mobile-link signout" onClick={() => { logout(); navigate('/login'); }}>
            {translateText("↩ ")}{t('Sign out')}
          </button>
        </div>
      )}

      <div className="portal-workspace">
      <aside className="portal-sidebar" aria-label={translateText("Dashboard navigation")}>
        <div className="portal-sidebar-brand">
          <img src="/church-logo.png" alt="" />
          <span><strong>{translateText("Grace Evangelical Church")}</strong></span>
        </div>
        <div className="portal-sidebar-user">
          <span className="portal-sidebar-avatar">{person?.photoUrl ? <img src={person.photoUrl} alt="" /> : person?.firstName?.slice(0, 1).toUpperCase()}</span>
          <span><strong>{fullName(person)}</strong><small>{isMember ? t('Member') : t('Worshiper')}</small></span>
        </div>
        {navGroups.map(group => <section className="portal-sidebar-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.links.map(link => <button key={link.key}
            className={`portal-sidebar-link${activeTab === link.key ? ' active' : ''}`}
            aria-current={activeTab === link.key ? 'page' : undefined}
            onClick={() => {
              setSelectedCourseId(null);
              setActiveTab(link.key);
              if (link.key === 'home') navigate('/dashboard');
              else navigate(`/dashboard?tab=${link.key}`);
            }}>
            <span aria-hidden="true">{link.icon}</span><span>{link.label}</span>
            {link.key === 'notifications' && unread > 0 && <span className="portal-sidebar-count">{unread}</span>}
          </button>)}
        </section>)}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="portal-main">
        {error && <div className="portal-error">{error}</div>}
        {submitMsg && <div className="portal-success">{submitMsg}</div>}
        {submitErr && <div className="portal-error">{submitErr}</div>}

        {/* ════ HOME TAB ════ */}
        {activeTab === 'home' && (
          <div className="portal-home">
            {/* Welcome banner */}
            <div className="portal-welcome">
              <div className="portal-welcome-text">
                <h1>{isMember ? translateText("Member Dashboard") : 'Welcome back, ' + person?.firstName + '!'}</h1>
                <p className="portal-welcome-sub">{isMember ? translateText("Your membership, learning, and church community at a glance.") : t('We are happy to have you as part of our church community.')}</p>
                <span className={`portal-role-badge ${isMember ? 'member' : 'worshiper'}`}>
                  {isMember ? translateText("✓ MEMBER") : translateText("✦ WORSHIPER")}
                </span>
              </div>
              <div className="portal-welcome-avatar" aria-label={`${fullName(person)} profile photo`}>
                {person?.photoUrl ? <img src={person.photoUrl} alt={translateText("Your profile")} /> : <span>{person?.firstName?.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="portal-welcome-cross" aria-hidden="true">✝</div>
            </div>

            <nav className="portal-shortcuts" aria-label={translateText("Quick links")}>
              <button className="portal-shortcut" onClick={() => { setSelectedCourseId(null); setActiveTab('courses'); navigate('/dashboard?tab=courses'); }}>
                <span className="portal-shortcut-icon blue">▶</span><strong>{t('Courses')}</strong><small>{translateText("Learn and grow")}</small>
              </button>
              <button className="portal-shortcut" onClick={() => { setSelectedCourseId(null); setActiveTab('courses'); navigate('/dashboard?tab=courses'); }}>
                <span className="portal-shortcut-icon green">▤</span><strong>{translateText("Bible Reading")}</strong><small>{translateText("Read study materials")}</small>
              </button>
              <button className="portal-shortcut" onClick={() => { setSelectedCourseId(null); setActiveTab('certificates'); navigate('/dashboard?tab=certificates'); }}>
                <span className="portal-shortcut-icon purple">☆</span><strong>{t('Certificates')}</strong><small>{translateText("View certificates")}</small>
              </button>
              <button className="portal-shortcut" onClick={() => { setSelectedCourseId(null); setActiveTab('homeCell'); navigate('/dashboard?tab=homeCell'); }}>
                <span className="portal-shortcut-icon orange">⌂</span><strong>{t('Home Cell')}</strong><small>{translateText("Meeting and activities")}</small>
              </button>
              <button className="portal-shortcut" onClick={() => { setSelectedCourseId(null); setActiveTab('messages'); navigate('/dashboard?tab=messages'); }}>
                <span className="portal-shortcut-icon cyan">✉</span><strong>{t('Messages')}</strong><small>{translateText("Contact the church")}</small>
              </button>
              <button className="portal-shortcut" onClick={() => navigate('/children')}>
                <span className="portal-shortcut-icon rose">♧</span><strong>{translateText("My Children")}</strong><small>{children.length ? translateText("Manage family") : translateText("Add a child")}</small>
              </button>
            </nav>

            {isMember && <section className="portal-member-summary">
              <div className="portal-member-summary-heading"><span>✦</span><div><small>{translateText("MEMBER ACCOUNT")}</small><h2>{translateText("Welcome to your church family")}</h2></div></div>
              <div className="portal-member-summary-grid">
                <div><small>{translateText("Member ID")}</small><strong>{person?.member?.membershipNumber ?? translateText("Assigned by the church")}</strong></div>
                <div><small>{translateText("Membership date")}</small><strong>{person?.member?.membershipDate ? fmtDate(person.member.membershipDate) : translateText("Active member")}</strong></div>
                <div><small>{t("Home Cell")}</small><strong>{homeCells[0]?.name ?? translateText("Not assigned yet")}</strong></div>
              </div>
            </section>}

            {!isMember && <section className="portal-section portal-journey-dashboard">
              <h2 className="portal-section-title"><span aria-hidden="true">✦ </span>{t("My Journey")}</h2>
              <div className="portal-journey">
                {JOURNEY.map((j, i, steps) => (
                  <div key={j.key} className={`portal-journey-step${i < worshiperStep ? " done" : i === worshiperStep ? " current" : ""}`}>
                    <div className="portal-journey-dot">{i < worshiperStep ? "✓" : i === worshiperStep ? "▶" : String(i + 1)}</div>
                    <span>{t(j.label)}</span>
                    {i < steps.length - 1 && <div className="portal-journey-line" />}
                  </div>
                ))}
              </div>
              <div className="portal-journey-detail">
                {hasBaptism ? <>
                  <h3>{translateText("Next step: membership")}</h3>
                  <p>{translateText("Your baptism is recorded. The Church Manager will confirm your membership and Home Cell assignment.")}</p>
                </> : hasCourseCertificate ? <>
                  <h3>{translateText("Next step: request baptism")}</h3>
                  <p>{translateText("Your Course Certificate is ready. Submit or track your baptism request with the Church Manager.")}</p>
                  <button className="portal-btn-primary" onClick={() => navigate('/requests')}>{translateText("Open My Requests")}</button>
                </> : <>
                  <h3>{translateText("Next step: complete the Beginner Course")}</h3>
                  <p>{translateText("Complete the course to receive your certificate. Then you can request baptism.")}</p>
                  <button className="portal-btn-primary" onClick={() => {
                    setSelectedCourseId(null);
                    setActiveTab('courses');
                    navigate('/dashboard?tab=courses');
                  }}>{translateText("Go to Courses")}</button>
                </>}
              </div>
            </section>}

            <div className="portal-dashboard-lower">
              <section className="portal-section portal-progress-dashboard">
                <h2 className="portal-section-title">{t("Course Progress")}</h2>
                {(isMember ? homeCellCourse : beginner) ? <>
                  <h3>{isMember ? homeCellCourse!.course.title : beginner!.course.title}</h3>
                  <div className="portal-progress-bar-wrap">
                    <div className="portal-progress-bar" style={{ width: `${isMember ? homeCellCourse!.percentage : pct}%` }} />
                  </div>
                  <div className="portal-progress-label">
                    <span>{isMember ? homeCellCourse!.percentage : pct}{translateText("% Complete")}</span>
                    <span>{isMember ? homeCellCourse!.completedLessons.length : beginner!.completedLessons.length} / {isMember ? homeCellCourse!.course.lessons.length : beginner!.course.lessons.length} {t("lessons")}</span>
                  </div>
                  <button className="portal-btn-primary" onClick={() => {
                    const target = isMember ? homeCellCourse : beginner;
                    if (target?.course?.id) {
                      setSelectedCourseId(target.course.id);
                      setActiveTab("courses");
                      navigate(`/courses/${target.course.id}`);
                    } else {
                      setSelectedCourseId(null);
                      setActiveTab("courses");
                      navigate('/dashboard?tab=courses');
                    }
                  }}>{translateText("▶ ")}{t("Continue Course")}</button>
                </> : <>
                  <h3>{isMember ? translateText("Home Cell Advanced Course") : t("Start Your Beginner Course")}</h3>
                  <p>{isMember ? translateText("Begin the advanced course for members from your Courses page.") : t("Your first step is to complete the Beginner Course.")}</p>
                  <button className="portal-btn-primary" onClick={() => {
                    setSelectedCourseId(null);
                    setActiveTab("courses");
                    navigate('/dashboard?tab=courses');
                  }}>{translateText("▶ ")}{isMember ? t("Browse Member Courses") : t("Start Beginner Course")}</button>
                </>}
              </section>

              <section className="portal-recent-notifications">
                <div className="portal-recent-heading">
                  <div><span aria-hidden="true">•</span><h2>{t("Recent Notifications")}</h2></div>
                  <button type="button" onClick={() => setActiveTab("notifications")}>{t("View All")} <span aria-hidden="true">→</span></button>
                </div>
                {data.notifications.length === 0 ? (
                  <div className="portal-notifications-empty">
                    <span aria-hidden="true">🔔</span>
                    <p className="portal-muted">{t("No notifications yet")}</p>
                    <small>{translateText("Announcements and updates from church leadership will appear here.")}</small>
                  </div>
                ) : <div className="portal-recent-list">
                  {data.notifications.slice(0, 3).map(notification => <button type="button" key={notification.id} className={`portal-recent-item${notification.readAt ? "" : " unread"}`} onClick={() => { void markRead(notification.id); setActiveTab("notifications"); }}>
                    <span className="portal-recent-icon" aria-hidden="true">{notification.readAt ? "•" : "●"}</span>
                    <span className="portal-recent-copy"><strong>{notification.title}</strong><small>{notification.message}</small></span>
                    <time>{fmtDate(notification.createdAt)}</time>
                  </button>)}
                </div>}
              </section>
            </div>
          </div>
        )}

        {/* ════ COURSES TAB ════ */}
        {activeTab === 'courses' && (
          selectedCourseId ? (
            <div className="portal-tab-section portal-course-study-wrap">
              <CourseStudy
                courseId={selectedCourseId}
                onBack={() => {
                  setSelectedCourseId(null);
                  navigate('/dashboard?tab=courses');
                }}
              />
            </div>
          ) : (
            <div className="portal-tab-section">
              <div className="portal-tab-header">
                <h1>{t('My Courses')}</h1>
                <p>{t('Track your learning journey and course progress. Courses are shown when you are eligible.')}</p>
              </div>
              {coursesError && <div className="portal-error">{coursesError}</div>}
              {coursesLoading ? <div className="portal-loading-inner"><div className="portal-spinner"/><p>{translateText('Loading courses…')}</p></div> : availableCourses.length === 0 ? (
                <div className="portal-empty">
                  <span aria-hidden="true">▤</span>
                  <strong>{translateText('No courses available yet')}</strong>
                  <p>{translateText('Courses for your account will appear here once published by your church instructor.')}</p>
                  <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span>{translateText('Looking to register children for Sunday School?')} </span>
                    <Link to="/children" style={{ color: 'var(--navy-600)', fontWeight: 700, textDecoration: 'underline' }}>{translateText('Manage Children')}</Link>
                  </div>
                </div>
              ) : (
                <div className="portal-course-sections">
                  {courseGroups.map(([category, groupedCourses]) => <section className="portal-course-section" key={category}>
                    <h2>{translateText(courseGroupTitle(category))}</h2>
                    <div className="portal-cards-grid">{groupedCourses.map(course => {
                    const courseProgress = progress.find(item => item.course.id === course.id);
                    return <div key={course.id} className="portal-card">
                      <div className="portal-card-top">
                        <span className="portal-course-cat">{courseCategoryLabel(course.category)}</span>
                      </div>
                      <h3>{course.title}</h3>
                      {course.description&&<p className="portal-card-detail">{course.description}</p>}
                      {courseProgress ? <>
                        <div className="portal-progress-bar-wrap"><div className="portal-progress-bar" style={{ width: `${courseProgress.percentage}%` }} /></div>
                        <p className="portal-card-detail">{courseProgress.percentage}{translateText("% ")}{t('Complete')}</p>
                        <p className="portal-card-detail">{courseProgress.completedLessons.length} {translateText("/ ")}{courseProgress.course.lessons.length} {t('lessons')}</p>
                      </> : <p className="portal-card-detail">{translateText('Not started')}</p>}
                      <button className="portal-btn-outline" onClick={() => {
                        setSelectedCourseId(course.id);
                        navigate(`/courses/${course.id}`);
                      }}>{courseProgress ? t('Continue') : translateText('Start course')}</button>
                    </div>;
                  })}</div>
                  </section>)}
                </div>
              )}
            </div>
          )
        )}

        {/* ════ CERTIFICATES TAB ════ */}
        {activeTab === 'certificates' && (
          <div className="portal-tab-section">
            <div className="portal-tab-header">
              <h1>{t('Certificate Center')}</h1>
              <p>{t('Your issued church certificates with QR verification.')}</p>
            </div>
            <div className="portal-cert-cards">
              {(['COURSE', ...(hasBaptism || hasBaptismCertificate ? ['BAPTISM' as const] : [])] as const).map(type => {
                const cert = person?.certificates?.find(c => c.type === type);
                const labels = { COURSE: cert?.courseTitleSnapshot ?? 'Course Certificate', BAPTISM: 'Baptism Certificate' };
                const descs = { COURSE: 'Awarded automatically after completing the course.', BAPTISM: 'Awarded after baptism is recorded.' };
                return (
                  <div key={type} className={`portal-cert-card ${cert ? 'issued' : 'locked'}`}>
                    <div className="portal-cert-icon">{type === 'COURSE' ? '▤' : '◇'}</div>
                    <h3>{t(labels[type])}</h3>
                    <p className="portal-card-detail">{t(descs[type])}</p>
                    {cert ? (
                      <>
                        <p className="portal-cert-num">{translateText("#")}{cert.certificateNumber}</p>
                        <p className="portal-cert-date">{t('Issued')}{translateText(": ")}{fmtDate(cert.issuedAt)}</p>
                        {cert.qrCodeDataUrl && (
                          <img src={cert.qrCodeDataUrl} alt={translateText("QR verification")} className="portal-cert-qr" />
                        )}
                        <div className="portal-btn-row">
                          <Link to={`/verify/${cert.verificationCode}`} className="portal-btn-outline">
                            {translateText("⌕ ")}{t('Verify')}
                          </Link>
                          <button className="portal-btn-outline" onClick={event => void downloadCertificatePdf(event.currentTarget.closest('.portal-cert-card') as HTMLElement | null, {
                            title: `CERTIFICATE OF ${cert.courseTitleSnapshot ?? (cert.type === 'BAPTISM' ? 'BAPTISM' : 'COURSE')} COMPLETION`,
                            recipientName: fullName(person),
                            issuerName: cert.issuerNameSnapshot,
                            signatureSnapshot: cert.signatureSnapshot,
                            isCourse: cert.type === 'COURSE',
                          })}>
                            {translateText("↓ Download PDF")}
                          </button>
                          <button className="portal-btn-primary" onClick={() => window.print()}>
                            {translateText("▣ ")}{t('Print')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="portal-cert-unavail">{t('Not available yet')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════ HOME CELL TAB ════ */}
        {activeTab === 'homeCell' && (
          <div className="portal-tab-section">
            <div className="portal-tab-header">
              <h1>{t('Home Cell')}</h1>
              <p>{isMember ? t('Your Home Cell community, meetings, and activities.') : t('Home Cell access becomes available after membership.')}</p>
            </div>
            {!isMember ? (
              <div className="portal-empty">
                <span aria-hidden="true">⌂</span>
                <strong>{t('Available after membership')}</strong>
                <p>{t('Complete the Beginner Course, get your certificate, and be baptized to become a Member.')}</p>
              </div>
            ) : homeCells.length === 0 ? (
              <div className="portal-empty">
                <span aria-hidden="true">⌂</span>
                <strong>{t('You are not yet in a Home Cell')}</strong>
                <p>{t('Contact the Church Manager to be assigned to a Home Cell near you.')}</p>
              </div>
            ) : (
              homeCells.map(cell => (
                <div key={cell.id} className="portal-homecel-card">
                  <div className="portal-homecel-header">
                    <span className="portal-homecel-icon">{translateText("⌂")}</span>
                    <div>
                      <h2>{cell.name}</h2>
                      <p>{cell.location || t('Location not set')}</p>
                    </div>
                  </div>
                  <div className="portal-homecel-meta">
                    <div className="portal-meta-item">
                      <small>{t('Leader')}</small>
                      <strong>{cell.leader ? fullName(cell.leader) : t('Not assigned')}</strong>
                    </div>
                    <div className="portal-meta-item">
                      <small>{t('Meeting Day')}</small>
                      <strong>{cell.meetingDay || '—'}</strong>
                    </div>
                    <div className="portal-meta-item">
                      <small>{t('Meeting Time')}</small>
                      <strong>{cell.meetingTime || '—'}</strong>
                    </div>
                  </div>
                  {cell.activities && cell.activities.length > 0 && (
                    <>
                      <h3>{t('Recent Activities')}</h3>
                      <div className="portal-activity-list">
                        {cell.activities.map(a => (
                          <div key={a.id} className="portal-activity-item">
                            <span className={`portal-activity-tag ${a.type.toLowerCase()}`}>
                              {a.type.replace('_', ' ')}
                            </span>
                            <strong>{a.title}</strong>
                            {a.scheduledAt && <small>{fmtDate(a.scheduledAt)}</small>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ════ NOTIFICATIONS TAB ════ */}
        {activeTab === 'notifications' && (
          <div className="portal-tab-section">
            <div className="portal-tab-header">
              <h1>{t('Notifications')}</h1>
              <div className="portal-tab-actions">
                {unread > 0 && (
                  <button className="portal-btn-outline" onClick={markAllRead}>
                    {translateText("✓ ")}{t('Mark all as read')}
                  </button>
                )}
              </div>
            </div>
            {data.notifications.length === 0 ? (
              <div className="portal-empty">
                <span aria-hidden="true">•</span>
                <strong>{t('No notifications yet')}</strong>
              </div>
            ) : (
              <div className="portal-notif-list">
                {data.notifications.map(n => (
                  <div key={n.id} className={`portal-notif-item ${!n.readAt ? 'unread' : ''}`}
                    onClick={() => !n.readAt && markRead(n.id)}>
                    <div className="portal-notif-dot" />
                    <div className="portal-notif-body">
                      <strong>{n.title}</strong>
                      <p>{n.message}</p>
                      <small>{fmtDate(n.createdAt)}</small>
                    </div>
                    {!n.readAt && <span className="portal-notif-unread-tag">{t('New')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="portal-tab-section">
            <div className="portal-tab-header"><h1>{t('Messages')}</h1><p>{translateText("Contact church staff about baptism or any church matter.")}</p></div>
            {submitMsg && <div className="portal-success-note">{submitMsg}</div>}
            {submitErr && <div className="portal-error-note">{submitErr}</div>}
            <section className="portal-message-compose" id="portal-message-compose">
              <h2>{translateText("Send a message")}</h2>
              <form onSubmit={sendMessage}>
                <label className="field"><span>{translateText("Recipient")}</span><select value={messageRecipientId} onChange={e => setMessageRecipientId(e.target.value)} required><option value="">{translateText("Choose a recipient")}</option>{messageRecipients.map(person => <option key={person.id} value={person.id}>{person.person ? `${person.person.firstName} ${person.person.lastName}` : person.username} {translateText("· ")}{person.role === 'CHURCH_MANAGER' ? translateText("Church Manager") : person.role === 'CLASS_INSTRUCTOR' ? translateText("Class Instructor") : person.role === 'MEMBER' ? translateText("Member") : translateText("Admin")}</option>)}</select></label>
                <label className="field"><span>{translateText("Subject")}</span><input value={messageSubject} onChange={e => setMessageSubject(e.target.value)} minLength={2} maxLength={160} required placeholder={translateText("Baptism or other matter")} /></label>
                <label className="field"><span>{translateText("Message")}</span><textarea rows={4} value={messageBody} onChange={e => setMessageBody(e.target.value)} maxLength={5000} required /></label>
                <button className="portal-btn-primary" type="submit">{translateText("Send message")}</button>
              </form>
            </section>
            <section className="portal-message-inbox">
              <h2>{translateText("Inbox & sent messages")}</h2>
              {messages.length ? (
                messages.map(message => (
                  <article key={message.id} className="portal-message-card">
                    <strong>{message.title}</strong>
                    <p>{message.message}</p>
                    <small>{message.direction === 'received' ? `From ${message.senderName}` : `To ${message.recipientName ?? 'recipient'}`}</small>
                    <small>{fmtDate(message.createdAt)}</small>
                    {message.direction === 'received' && <button className="portal-btn-secondary" type="button" onClick={() => replyToMessage(message)}>{translateText("Reply")}</button>}
                  </article>
                ))
              ) : (
                <p className="portal-muted">{translateText("No messages yet.")}</p>
              )}
            </section>
          </div>
        )}

        {/* ════ PROFILE TAB ════ */}
        {activeTab === 'profile' && (
          <div className="portal-tab-section">
            <div className="portal-tab-header">
              <h1>{t('My Profile')}</h1>
              <p>{t('Your personal church profile information.')}</p>
            </div>
            <div className="portal-profile-wrap">
              <div className="portal-profile-avatar">
                {person?.photoUrl ? <img src={person.photoUrl} alt={`${fullName(person)} profile`} /> : person?.firstName?.slice(0, 1).toUpperCase()}
              </div>
              <div className="portal-profile-info">
                <h2>{fullName(person)}</h2>
                <span className={`portal-role-badge ${isMember ? 'member' : 'worshiper'}`}>
                  {isMember ? translateText("✓ MEMBER") : translateText("✦ WORSHIPER")}
                </span>
              </div>
            </div>
            <div className="portal-profile-details">
              {[
                { title: 'Personal Information', items: [
                  ['First Name', person?.firstName], ['Middle Name', person?.middleName], ['Last Name', person?.lastName],
                  [t('Gender'), person?.gender], [t('Date of Birth'), person?.dateOfBirth ? fmtDate(person.dateOfBirth) : null],
                  [t('Place of Birth'), person?.placeOfBirth], [t('Marital Status'), person?.maritalStatus],
                ] },
                { title: 'Contact & Work', items: [
                  [t('Email'), person?.email], [t('Phone'), person?.phone], ['Office Telephone', person?.officeTelephone],
                  ['Home Telephone', person?.homeTelephone], [t('Nationality'), person?.nationality], ['Make a Living', person?.makingALiving],
                  [t('Occupation'), person?.occupation],
                ] },
                ...(isMember ? [{ title: 'Spiritual Journey', items: [
                  ['Year Received the Lord', person?.yearReceivedLord], ['Year Baptized', person?.yearBaptized],
                  ['Previous Church Member', person?.previousChurch],
                  ['Previous Church', person?.previousChurchName],
                ] },
                { title: 'Home Association', items: [
                  ['Shares Home Association', person?.sharesHomeAssociation], ['Reason', person?.homeAssociationReason],
                  ['Whose House', person?.sharesWhoseHouse], ['Union Leader', person?.unionLeaderName],
                ] }] : []),
                { title: 'Family', items: [
                  ['Family Size', person?.familySize], ['Number of Children', person?.numberOfChildren],
                  ['Children Who Know the Lord', person?.childrenKnowLord], ['Household Members Who Do Not Know the Lord', person?.poorNotKnowLord],
                  ['Unemployed in Household', person?.unemployedInHousehold],
                ] },
                { title: 'Service & Ministry', items: [
                  ['Current Service / Ministry', person?.currentService], ['Past Service', person?.pastService], ['Service Load', person?.serviceLoad],
                ] },
                { title: 'Church Record', items: [
                  [t('Status'), person?.status], ['Registration Date', person?.createdAt ? fmtDate(person.createdAt) : null],
                ] },
              ].map(group => {
                const details = group.items.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
                return details.length ? <section className="portal-profile-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <div className="portal-profile-grid">
                    {details.map(([label, value]) => <div key={String(label)} className="portal-profile-row">
                      <small>{label}</small><strong>{value}</strong>
                    </div>)}
                  </div>
                </section> : null;
              })}
              {person?.previousBaptismCertificateUrl && (
                <a className="portal-btn-outline" href={person.previousBaptismCertificateUrl} target="_blank" rel="noreferrer">{translateText("View submitted baptism certificate")}</a>
              )}
            </div>
            <Link to="/profile" className="portal-btn-primary">{translateText("✏️ ")}{t('Edit Profile')}</Link>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
