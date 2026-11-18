import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';
import { useLanguage } from '../i18n/context';

type Stat = { label: string; value: number; color: string; icon: string };
type InstructorCourse = { id: string; title: string; category: string; status: string; updatedAt?: string; rejectionReason?: string | null };

export function DashboardPage() {
  const { t } = useLanguage();
  const { user }   = useAuth();
  const [stats,  setStats]  = useState<Record<string, number>>({});
  const [courses, setCourses] = useState<InstructorCourse[]>([]);
  const [error,  setError]  = useState('');
  const [loading,setLoading]= useState(true);

  const isManager    = user?.role === 'ADMINISTRATOR' || user?.role === 'CHURCH_MANAGER';
  const isInstructor = user?.role === 'CLASS_INSTRUCTOR';

  useEffect(() => {
    const url = isManager ? '/manager/dashboard' : isInstructor ? '/instructor/dashboard' : '/portal/dashboard';
    api.get(url)
      .then(({ data }) => { setStats(data.stats ?? {}); setCourses(data.courses ?? []); })
      .catch(e => setError(messageFromError(e)))
      .finally(() => setLoading(false));
  }, [isManager, isInstructor]);

  const cards: Stat[] = isManager ? [
    { label: 'Worshipers',          value: stats.worshipers ?? 0,           color: 'blue',   icon: '🙏' },
    { label: 'Members',             value: stats.members ?? 0,              color: 'green',  icon: '✦' },
    { label: 'Home Cells',          value: stats.homeCells ?? 0,            color: 'purple', icon: '⌂' },
    { label: 'Courses',             value: stats.courses ?? 0,              color: 'orange', icon: '📖' },
    { label: 'Classes',             value: stats.classes ?? 0,              color: 'cyan',   icon: '🏫' },
    { label: 'Pending Certificates',value: stats.certificates ?? 0,         color: 'red',    icon: '📜' },
    { label: 'Pending Baptism',     value: stats.baptisms ?? 0,             color: 'blue',   icon: '💧' },
    { label: 'Course Approvals',    value: stats.classCourseApprovals ?? 0, color: 'gold',   icon: '⏳' },
  ] : isInstructor ? [
    { label: 'Total Courses',   value: stats.totalCourses ?? 0,    color: 'blue',   icon: '📖' },
    { label: 'Total Classes',   value: stats.totalClasses ?? 0,    color: 'green',  icon: '🏫' },
    { label: 'Pending Materials', value: stats.pendingMaterials ?? 0, color: 'orange', icon: '⏳' },
    { label: 'Approved Courses', value: stats.approvedCourses ?? 0, color: 'purple', icon: '✦' },
    { label: 'Rejected Courses', value: stats.rejectedCourses ?? 0, color: 'red',   icon: '✗' },
    { label: 'Published Courses', value: stats.publishedCourses ?? 0, color: 'cyan', icon: '📢' },
    { label: 'Students / Members', value: stats.enrolledStudents ?? 0, color: 'gold', icon: '👥' },
  ] : [
    { label: 'Courses in Progress', value: stats.courses ?? 0,        color: 'blue',  icon: '📖' },
    { label: 'Pending Requests',    value: stats.pendingRequests ?? 0, color: 'orange',icon: '⏳' },
    { label: 'Certificates',        value: stats.certificates ?? 0,    color: 'green', icon: '🏅' },
  ];

  const displayName = user?.person?.firstName ?? user?.username ?? '';

  return (
    <div className="content-wrap">
      {/* Welcome */}
      <div className="welcome-banner">
        <div>
          <p className="eyebrow">{isInstructor ? t('CLASS & COURSE INSTRUCTOR') : isManager ? t('CHURCH MANAGEMENT SYSTEM') : t('MEMBER WORKSPACE')}</p>
          <h1>{t('Welcome back')}{displayName ? `, ${displayName}` : translateText("")}{translateText("!")}</h1>
          <p>
            {isManager
              ? t("Serve the church community with a clear view of today's work.")
              : isInstructor
                ? t('Manage your course content and track approvals.')
                : t('Continue your journey in faith and community.')}
          </p>
        </div>
        <div className="welcome-cross">{translateText("✝")}</div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Stats */}
      {loading ? (
        <div className="stats-grid">
          {[...Array(cards.length || 3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 90, borderRadius: 'var(--r-lg)' }} />
          ))}
        </div>
      ) : (
        <section className="stats-grid">
          {cards.map(card => (
            <article className={`stat-card stat-${card.color}`} key={card.label}>
              <div className="stat-icon">{card.icon}</div>
              <div>
                <small>{t(card.label)}</small>
                <strong>{card.value}</strong>
              </div>
            </article>
          ))}
        </section>
      )}

      {isInstructor && (
        <section className="instructor-course-overview">
          <div className="instructor-section-heading">
            <div><p className="eyebrow">{t('YOUR TEACHING WORKSPACE')}</p><h2>{t('Recent courses')}</h2><p>{t('Track course status and continue preparing your learning materials.')}</p></div>
            <Link to="/instructor/courses" className="btn-outline">{t('Manage courses')} <span aria-hidden="true">{translateText("→")}</span></Link>
          </div>
          {courses.length ? <div className="instructor-course-grid">
            {courses.slice(0, 4).map(course => <article className="instructor-course-card" key={course.id}>
              <div className="instructor-course-icon">{translateText("📖")}</div>
              <div className="instructor-course-meta"><span>{course.category.replaceAll('_', ' ')}</span><span className={`instructor-status ${course.status.toLowerCase()}`}>{course.status.replaceAll('_', ' ')}</span></div>
              <h3>{course.title}</h3>
              {course.rejectionReason && <p className="instructor-rejection">{translateText("Review note: ")}{course.rejectionReason}</p>}
              <Link to="/instructor/courses">{translateText("Open course ")}<span aria-hidden="true">{translateText("→")}</span></Link>
            </article>)}
          </div> : <div className="instructor-course-empty"><span>{translateText("✦")}</span><strong>{translateText("Start with your first course")}</strong><p>{translateText("Create a draft, add lessons and materials, then submit it to the Church Manager for approval.")}</p><Link to="/instructor/courses" className="btn-primary">{translateText("Create a course")}</Link></div>}
        </section>
      )}

      {/* Quick links */}
      <section className="quick-grid">
        <h2>{t('Quick Access')}</h2>
        <div className="quick-links">
          {(isManager
            ? [['/manager/worshipers','🙏','Worshipers'],['/manager/members','✦','Members'],['/manager/home-cells','⌂','Home Cells'],['/manager/courses','📖','Courses & Classes'],['/manager/certificates','📜','Certificates'],['/manager/baptisms','💧','Baptism Requests']]
            : isInstructor
              ? [['/instructor/courses','📖','My Courses'],['/profile','👤','Profile']]
              : [['/profile','👤','My Profile'],['/courses','📖','Courses & Classes'],['/requests','📋','My Requests'],['/certificates','🏅','Certificates'],['/home-cells','⌂','Home Cell'],['/children','👶','My Children']]
          ).map(([href, icon, label]) => (
            <Link to={href} className="quick-card" key={href}>
              <span>{icon}</span>
              <strong>{t(label)}</strong>
              <small>{t('Open section')} {translateText("→")}</small>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
