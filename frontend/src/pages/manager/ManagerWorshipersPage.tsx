import { translateText } from '../../i18n/context';
import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, messageFromError } from '../../api';

type Address = {
  country?: string;
  region?: string;
  city?: string;
  subCity?: string;
  woreda?: string;
  kebele?: string;
};

type Person = {
  id?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  createdAt: string;
  status?: string;
  acceptedJesus?: string;
  denomination?: string;
  memberOfThisChurch?: string;
  previousChurch?: string;
  previousChurchName?: string;
  yearReceivedLord?: string;
  yearBaptized?: string;
  previousBaptismCertificateUrl?: string;
  gender?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  maritalStatus?: string;
  nationality?: string;
  officeTelephone?: string;
  homeTelephone?: string;
  makingALiving?: string;
  occupation?: string;
  sharesHomeAssociation?: string;
  homeAssociationReason?: string;
  sharesWhoseHouse?: string;
  unionLeaderName?: string;
  currentService?: string;
  pastService?: string;
  serviceLoad?: string;
  familySize?: string;
  numberOfChildren?: string;
  childrenKnowLord?: string;
  poorNotKnowLord?: string;
  unemployedInHousehold?: string;
  addresses?: { address: Address }[];
};

type Progress = {
  percentage: number;
  completedLessons?: number[];
  course: { id?: string; title: string; category: string };
};

type Certificate = {
  id?: string;
  type: string;
  certificateNumber: string;
  issuedAt: string;
};

type Request = {
  id?: string;
  type: string;
  status: string;
  scheduledDate?: string;
  details?: string;
  createdAt?: string;
};

type Baptism = {
  id?: string;
  baptizedAt: string;
  location?: string;
};

type Member = {
  id?: string;
  membershipNumber: string;
  membershipDate: string;
  cellMemberships?: { cell: { name: string } }[];
};

type Worshiper = {
  id: string;
  role: string;
  createdAt: string;
  isActive: boolean;
  person?: Person & {
    courseProgress: Progress[];
    requests: Request[];
    certificates: Certificate[];
    baptisms: Baptism[];
    member?: Member | null;
  } | null;
};

type FilterTab = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'IN_COURSE' | 'READY_BAPTISM' | 'MEMBERS';
type SortBy = 'NEWEST' | 'OLDEST' | 'NAME_ASC' | 'NAME_DESC' | 'PROGRESS';
type ModalTab = 'journey' | 'personal' | 'faith' | 'household' | 'contact' | 'requests';

function fullName(p?: Pick<Person, 'firstName' | 'middleName' | 'lastName'> | null) {
  if (!p) return 'Unknown';
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}

function calculateAge(dateOfBirth?: string) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const diff = Date.now() - dob.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function JourneyBadge({ w }: { w: Worshiper }) {
  const p = w.person;
  if (!p) return <span className="mgr-badge grey">{translateText("No profile")}</span>;
  if (p.status === 'REJECTED') return <span className="mgr-badge red">{translateText("Rejected")}</span>;
  if (!w.isActive) return <span className="mgr-badge grey">{translateText("Inactive")}</span>;
  if (p.member) return <span className="mgr-badge green">{translateText("Member")}</span>;
  if (p.baptisms && p.baptisms.length > 0) return <span className="mgr-badge blue">{translateText("Baptized")}</span>;
  const pct = Math.max(0, ...(p.courseProgress ?? []).map(cp => cp.percentage));
  const hasBaptismReq = (p.requests ?? []).some(r => r.type === 'BAPTISM' && r.status === 'PENDING');
  if (hasBaptismReq) return <span className="mgr-badge purple">{translateText("Baptism Pending")}</span>;
  if (pct >= 95) return <span className="mgr-badge orange">{translateText("Course 95%+")}</span>;
  if (pct > 0) return <span className="mgr-badge yellow">{translateText("In Course ")}{pct}%</span>;
  return <span className="mgr-badge blue">{translateText("Registered")}</span>;
}

export function ManagerWorshipersPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [worshipers, setWorshipers] = useState<Worshiper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('NEWEST');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Worshiper | null>(null);
  const [detail, setDetail] = useState<Worshiper | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>('journey');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const selectForMessage = params.get('selectForMessage') === '1';

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const returnToMessage = (w: Worshiper) => {
    const name = fullName(w.person);
    navigate(`/manager/messages?senderId=${encodeURIComponent(w.id)}&recipientRole=WORSHIPER&recipientName=${encodeURIComponent(name)}`);
  };

  const fetchWorshipers = () => {
    setLoading(true);
    api.get('/manager/worshipers')
      .then(({ data }) => {
        setWorshipers(data.worshipers ?? []);
        setError('');
      })
      .catch(e => setError(messageFromError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorshipers();
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    const total = worshipers.length;
    const active = worshipers.filter(w => w.isActive).length;
    const inCourse = worshipers.filter(w => {
      const pct = Math.max(0, ...(w.person?.courseProgress ?? []).map(cp => cp.percentage));
      return pct > 0 && !w.person?.member;
    }).length;
    const readyForBaptism = worshipers.filter(w => {
      const pct = Math.max(0, ...(w.person?.courseProgress ?? []).map(cp => cp.percentage));
      const hasReq = (w.person?.requests ?? []).some(r => r.type === 'BAPTISM');
      return (pct >= 95 || hasReq) && !w.person?.member;
    }).length;
    const members = worshipers.filter(w => Boolean(w.person?.member)).length;

    return { total, active, inCourse, readyForBaptism, members };
  }, [worshipers]);

  // Filtering and sorting
  const filtered = useMemo(() => {
    let result = worshipers.filter(w => {
      const q = search.toLowerCase().trim();
      const name = fullName(w.person).toLowerCase();
      const email = (w.person?.email ?? '').toLowerCase();
      const phone = (w.person?.phone ?? '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || email.includes(q) || phone.includes(q);
      if (!matchesSearch) return false;

      const p = w.person;
      const pct = p ? Math.max(0, ...(p.courseProgress ?? []).map(cp => cp.percentage)) : 0;
      const hasBaptismReq = (p?.requests ?? []).some(r => r.type === 'BAPTISM');
      const isMember = Boolean(p?.member);

      if (filterTab === 'ACTIVE') return w.isActive;
      if (filterTab === 'INACTIVE') return !w.isActive;
      if (filterTab === 'IN_COURSE') return pct > 0 && pct < 95 && !isMember;
      if (filterTab === 'READY_BAPTISM') return (pct >= 95 || hasBaptismReq) && !isMember;
      if (filterTab === 'MEMBERS') return isMember;
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'NEWEST') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'NAME_ASC') {
        return fullName(a.person).localeCompare(fullName(b.person));
      }
      if (sortBy === 'NAME_DESC') {
        return fullName(b.person).localeCompare(fullName(a.person));
      }
      if (sortBy === 'PROGRESS') {
        const pctA = Math.max(0, ...(a.person?.courseProgress ?? []).map(cp => cp.percentage));
        const pctB = Math.max(0, ...(b.person?.courseProgress ?? []).map(cp => cp.percentage));
        return pctB - pctA;
      }
      return 0;
    });

    return result;
  }, [worshipers, search, filterTab, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterTab, sortBy, pageSize]);

  const openDetail = async (w: Worshiper) => {
    setSelected(w);
    setLoadingDetail(true);
    setModalTab('journey');
    try {
      const { data } = await api.get(`/manager/worshipers/${w.id}`);
      setDetail(data.user);
    } catch {
      setDetail(w);
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleActive = async (w: Worshiper) => {
    const newStatus = !w.isActive;
    const actionName = newStatus ? translateText("activate") : translateText("deactivate");
    if (!window.confirm(`${translateText("Are you sure you want to")} ${actionName} ${fullName(w.person)}?`)) return;

    setActingId(w.id);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/manager/worshipers/${w.id}/status`, { isActive: newStatus });
      setSuccess(`${fullName(w.person)} ${newStatus ? translateText("account activated successfully.") : translateText("account deactivated.")}`);
      setWorshipers(curr => curr.map(item => item.id === w.id ? { ...item, isActive: newStatus } : item));
      if (selected?.id === w.id) {
        setSelected(prev => prev ? { ...prev, isActive: newStatus } : null);
        setDetail(prev => prev ? { ...prev, isActive: newStatus } : null);
      }
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setActingId(null);
    }
  };

  const deleteWorshiper = async (w: Worshiper) => {
    const name = fullName(w.person);
    if (!window.confirm(`${translateText("Permanently delete")} ${name} ${translateText("and their linked church profile? This action cannot be undone.")}`)) return;

    setActingId(w.id);
    setError('');
    setSuccess('');
    try {
      await api.delete(`/manager/worshipers/${w.id}`);
      setWorshipers(current => current.filter(item => item.id !== w.id));
      setSuccess(`${name} ${translateText("was permanently deleted.")}`);
      setSelected(null);
      setDetail(null);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setActingId(null);
    }
  };

  // Export CSV function
  const exportToCsv = () => {
    const headers = [
      '#',
      'First Name',
      'Middle Name',
      'Last Name',
      'Email',
      'Phone',
      'Gender',
      'Marital Status',
      'Status',
      'Course Progress %',
      'Membership',
      'Registered Date'
    ];

    const rows = filtered.map((w, index) => {
      const p = w.person;
      const pct = p ? Math.max(0, ...(p.courseProgress ?? []).map(cp => cp.percentage)) : 0;
      return [
        index + 1,
        `"${p?.firstName ?? ''}"`,
        `"${p?.middleName ?? ''}"`,
        `"${p?.lastName ?? ''}"`,
        `"${p?.email ?? ''}"`,
        `"${p?.phone ?? ''}"`,
        `"${p?.gender ?? ''}"`,
        `"${p?.maritalStatus ?? ''}"`,
        `"${w.isActive ? 'Active' : 'Inactive'}"`,
        pct,
        `"${p?.member ? 'Member' : 'Worshiper'}"`,
        `"${p?.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `worshipers-directory-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeDetailUser = detail ?? selected;
  const p = activeDetailUser?.person;

  return (
    <div className="mgr-page">
      {/* ── Page Header ── */}
      <div className="mgr-page-header">
        <div>
          <p className="mgr-eyebrow">{translateText("CHURCH MEMBERSHIP & DISCIPLESHIP")}</p>
          <h1>{translateText("Worshipers Directory")}</h1>
          <p className="mgr-muted">
            {selectForMessage
              ? translateText("Select a worshiper below to initiate communication.")
              : translateText("Track spiritual journey milestones, course completions, and baptism progress.")}
          </p>
        </div>
        <div className="mgr-action-row">
          <button className="mgr-btn-outline" onClick={exportToCsv} title={translateText("Export as CSV spreadsheet")}>
            <span aria-hidden="true">📥</span> {translateText("Export CSV")}
          </button>
          <button className="mgr-btn-outline" onClick={fetchWorshipers} title={translateText("Refresh directory")}>
            <span aria-hidden="true">↻</span> {translateText("Refresh")}
          </button>
        </div>
      </div>

      {error && <div className="mgr-error">{error}</div>}
      {success && <div className="mgr-success">{success}</div>}
      {copiedText && (
        <div className="mgr-info-note" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, margin: 0, boxShadow: 'var(--shadow-lg)' }}>
          ✓ {copiedText} {translateText("copied to clipboard")}!
        </div>
      )}

      {/* ── Metric KPI Cards ── */}
      <div className="mgr-kpi-grid">
        <button
          className={`mgr-kpi-card ${filterTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setFilterTab('ALL')}
        >
          <div className="mgr-kpi-icon blue">👥</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.total}</span>
            <span className="mgr-kpi-label">{translateText("Total Worshipers")}</span>
            <span className="mgr-kpi-sub">{translateText("All registered accounts")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'ACTIVE' ? 'active' : ''}`}
          onClick={() => setFilterTab('ACTIVE')}
        >
          <div className="mgr-kpi-icon green">✓</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.active}</span>
            <span className="mgr-kpi-label">{translateText("Active Accounts")}</span>
            <span className="mgr-kpi-sub">{stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% {translateText("active rate")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'IN_COURSE' ? 'active' : ''}`}
          onClick={() => setFilterTab('IN_COURSE')}
        >
          <div className="mgr-kpi-icon amber">📖</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.inCourse}</span>
            <span className="mgr-kpi-label">{translateText("In Courses")}</span>
            <span className="mgr-kpi-sub">{translateText("Actively studying")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'READY_BAPTISM' ? 'active' : ''}`}
          onClick={() => setFilterTab('READY_BAPTISM')}
        >
          <div className="mgr-kpi-icon purple">🌊</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.readyForBaptism}</span>
            <span className="mgr-kpi-label">{translateText("Ready for Baptism")}</span>
            <span className="mgr-kpi-sub">{translateText("95%+ or requested")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'MEMBERS' ? 'active' : ''}`}
          onClick={() => setFilterTab('MEMBERS')}
        >
          <div className="mgr-kpi-icon teal">🏛</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.members}</span>
            <span className="mgr-kpi-label">{translateText("Full Members")}</span>
            <span className="mgr-kpi-sub">{translateText("Baptized & inducted")}</span>
          </div>
        </button>
      </div>

      {/* ── Toolbar Header ── */}
      <div className="mgr-toolbar-header">
        {/* Search */}
        <div className="mgr-search-box">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            placeholder={translateText("Search by name, email, or telephone…")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-btn" onClick={() => setSearch('')} title={translateText("Clear search")}>
              ×
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="mgr-toolbar-controls">
          <select
            className="mgr-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            aria-label={translateText("Sort worshipers")}
          >
            <option value="NEWEST">{translateText("Sort: Newest First")}</option>
            <option value="OLDEST">{translateText("Sort: Oldest First")}</option>
            <option value="NAME_ASC">{translateText("Sort: Name (A to Z)")}</option>
            <option value="NAME_DESC">{translateText("Sort: Name (Z to A)")}</option>
            <option value="PROGRESS">{translateText("Sort: Highest Course %")}</option>
          </select>

          <div className="mgr-view-toggle">
            <button
              className={`mgr-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title={translateText("Table view")}
            >
              <span aria-hidden="true">⊞</span> {translateText("Table")}
            </button>
            <button
              className={`mgr-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title={translateText("Grid cards view")}
            >
              <span aria-hidden="true">📇</span> {translateText("Cards")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="mgr-filter-bar">
        {[
          { key: 'ALL', label: translateText('All Worshipers'), count: stats.total },
          { key: 'ACTIVE', label: translateText('Active'), count: stats.active },
          { key: 'IN_COURSE', label: translateText('In Course'), count: stats.inCourse },
          { key: 'READY_BAPTISM', label: translateText('Ready for Baptism'), count: stats.readyForBaptism },
          { key: 'MEMBERS', label: translateText('Members'), count: stats.members },
          { key: 'INACTIVE', label: translateText('Inactive'), count: stats.total - stats.active },
        ].map(item => (
          <button
            key={item.key}
            className={`mgr-filter-chip ${filterTab === item.key ? 'active' : ''}`}
            onClick={() => setFilterTab(item.key as FilterTab)}
          >
            {item.label} <span>{item.count}</span>
          </button>
        ))}
      </div>

      {/* ── Content View (Table or Cards) ── */}
      {loading ? (
        <div className="mgr-loading-text">{translateText("Loading worshipers directory…")}</div>
      ) : filtered.length === 0 ? (
        <div className="mgr-empty">
          <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
          <strong style={{ fontSize: 16, color: 'var(--navy-900)' }}>{translateText("No worshipers found")}</strong>
          <p className="mgr-muted" style={{ marginTop: 4 }}>
            {search ? translateText("No results matching your search terms.") : translateText("No records match the selected filter.")}
          </p>
          {(search || filterTab !== 'ALL') && (
            <button
              className="mgr-btn-outline"
              style={{ marginTop: 14 }}
              onClick={() => { setSearch(''); setFilterTab('ALL'); }}
            >
              {translateText("Reset filters")}
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <div className="mgr-table-wrap">
          <table className="mgr-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>{translateText("Worshiper")}</th>
                <th>{translateText("Contact Info")}</th>
                <th>{translateText("Journey Stage")}</th>
                <th>{translateText("Course Progress")}</th>
                <th>{translateText("Membership")}</th>
                <th>{translateText("Account")}</th>
                <th>{translateText("Registered")}</th>
                <th style={{ textAlign: 'right' }}>{translateText("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((w, i) => {
                const person = w.person;
                const pct = person ? Math.max(0, ...(person.courseProgress ?? []).map(cp => cp.percentage)) : 0;
                const index = (currentPage - 1) * pageSize + i + 1;
                const isSelectedRow = selected?.id === w.id;

                return (
                  <tr
                    key={w.id}
                    className={selectForMessage ? 'mgr-selectable-row' : undefined}
                    style={isSelectedRow ? { background: 'var(--navy-50)' } : undefined}
                    onClick={selectForMessage ? () => returnToMessage(w) : undefined}
                  >
                    <td><span className="mgr-muted">{index}</span></td>

                    {/* Person */}
                    <td>
                      <div className="mgr-table-person">
                        <div className="mgr-person-avatar-wrap">
                          {person?.photoUrl ? (
                            <img src={person.photoUrl} alt={fullName(person)} style={{ width: 36, height: 36, borderRadius: '50%' }} />
                          ) : (
                            <div className="mgr-avatar-sm" style={{ background: 'var(--navy-100)', color: 'var(--navy-800)' }}>
                              {(person?.firstName ?? '?').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className={`mgr-online-dot ${w.isActive ? '' : 'inactive'}`} />
                        </div>
                        <div>
                          <strong style={{ display: 'block', color: 'var(--navy-900)', fontSize: 13 }}>
                            {fullName(person)}
                          </strong>
                          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            {person?.gender ? `${person.gender}` : ''}
                            {person?.dateOfBirth && calculateAge(person.dateOfBirth) ? ` · ${calculateAge(person.dateOfBirth)} yrs` : ''}
                          </small>
                        </div>
                      </div>
                    </td>

                    {/* Contact Info */}
                    <td>
                      <div style={{ display: 'grid', gap: 2 }}>
                        {person?.phone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <a href={`tel:${person.phone}`} style={{ color: 'var(--navy-800)' }} onClick={e => e.stopPropagation()}>
                              📞 {person.phone}
                            </a>
                            <button
                              className="mgr-copy-icon"
                              onClick={e => { e.stopPropagation(); copyToClipboard(person.phone!, 'Phone'); }}
                              title={translateText("Copy phone")}
                            >
                              📋
                            </button>
                          </div>
                        ) : (
                          <span className="mgr-muted">—</span>
                        )}
                        {person?.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                            <a href={`mailto:${person.email}`} style={{ color: 'var(--navy-600)' }} onClick={e => e.stopPropagation()}>
                              ✉ {person.email}
                            </a>
                            <button
                              className="mgr-copy-icon"
                              onClick={e => { e.stopPropagation(); copyToClipboard(person.email!, 'Email'); }}
                              title={translateText("Copy email")}
                            >
                              📋
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Journey Badge */}
                    <td>
                      <JourneyBadge w={w} />
                    </td>

                    {/* Course Progress */}
                    <td>
                      {pct > 0 ? (
                        <div className="mgr-progress-mini wide">
                          <div>
                            <div
                              style={{
                                width: `${pct}%`,
                                background: pct >= 95 ? '#059669' : pct >= 50 ? '#2563eb' : '#d97706'
                              }}
                            />
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--navy-800)' }}>{pct}%</span>
                        </div>
                      ) : (
                        <span className="mgr-muted" style={{ fontSize: 12 }}>{translateText("Not started")}</span>
                      )}
                    </td>

                    {/* Membership */}
                    <td>
                      {person?.member ? (
                        <span className="mgr-badge green">✓ {translateText("Member")}</span>
                      ) : (
                        <span className="mgr-badge grey">{translateText("Worshiper")}</span>
                      )}
                    </td>

                    {/* Account Status */}
                    <td>
                      <span className={`mgr-badge ${w.isActive ? 'green' : 'grey'}`}>
                        {w.isActive ? translateText("Active") : translateText("Inactive")}
                      </span>
                    </td>

                    {/* Registered Date */}
                    <td>
                      <small style={{ color: 'var(--navy-800)' }}>
                        {person?.createdAt ? new Date(person.createdAt).toLocaleDateString() : '—'}
                      </small>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="mgr-action-row" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="mgr-btn-sm"
                          onClick={e => { e.stopPropagation(); openDetail(w); }}
                          title={translateText("View full spiritual journey and registration details")}
                        >
                          👁 {translateText("View")}
                        </button>

                        <Link
                          className="mgr-btn-sm"
                          to={`/manager/messages?senderId=${encodeURIComponent(w.id)}&recipientRole=WORSHIPER&recipientName=${encodeURIComponent(fullName(person))}`}
                          onClick={e => e.stopPropagation()}
                          title={translateText("Send direct message")}
                        >
                          ✉ {translateText("Message")}
                        </Link>

                        {!selectForMessage && (
                          <>
                            <button
                              disabled={actingId === w.id}
                              className={`mgr-btn-sm ${w.isActive ? 'orange' : 'green'}`}
                              onClick={e => { e.stopPropagation(); void toggleActive(w); }}
                              title={w.isActive ? translateText("Deactivate account") : translateText("Activate account")}
                            >
                              {w.isActive ? translateText("Deactivate") : translateText("Activate")}
                            </button>
                            <button
                              disabled={actingId === w.id}
                              className="mgr-btn-sm red"
                              onClick={e => { e.stopPropagation(); void deleteWorshiper(w); }}
                              title={translateText("Delete worshiper account and records")}
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Cards / Grid View ── */
        <div className="mgr-person-grid">
          {paginated.map(w => {
            const person = w.person;
            const pct = person ? Math.max(0, ...(person.courseProgress ?? []).map(cp => cp.percentage)) : 0;

            return (
              <div key={w.id} className="mgr-person-card">
                <div className="mgr-person-card-head">
                  <div className="mgr-person-avatar-wrap">
                    {person?.photoUrl ? (
                      <img src={person.photoUrl} alt={fullName(person)} />
                    ) : (
                      <div className="avatar-initials">
                        {(person?.firstName ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className={`mgr-online-dot ${w.isActive ? '' : 'inactive'}`} />
                  </div>
                  <div className="mgr-person-card-title">
                    <span className="mgr-person-card-name" title={fullName(person)}>
                      {fullName(person)}
                    </span>
                    <span className="mgr-person-card-sub">
                      {person?.gender || translateText("Worshiper")}
                      {person?.dateOfBirth && calculateAge(person.dateOfBirth) ? ` · ${calculateAge(person.dateOfBirth)} yrs` : ''}
                    </span>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <JourneyBadge w={w} />
                  </div>
                </div>

                {/* Contact */}
                <div className="mgr-person-card-contact">
                  <div className="mgr-contact-pill">
                    <span>📞 {person?.phone || translateText("No phone")}</span>
                    {person?.phone && (
                      <button
                        className="mgr-copy-icon"
                        onClick={() => copyToClipboard(person.phone!, 'Phone')}
                        title={translateText("Copy phone")}
                      >
                        📋
                      </button>
                    )}
                  </div>
                  <div className="mgr-contact-pill">
                    <span>✉ {person?.email || translateText("No email")}</span>
                    {person?.email && (
                      <button
                        className="mgr-copy-icon"
                        onClick={() => copyToClipboard(person.email!, 'Email')}
                        title={translateText("Copy email")}
                      >
                        📋
                      </button>
                    )}
                  </div>
                </div>

                {/* Course progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{translateText("Course Progress")}</span>
                    <strong style={{ color: 'var(--navy-800)' }}>{pct}%</strong>
                  </div>
                  <div className="mgr-progress-mini">
                    <div style={{ height: 8 }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          background: pct >= 95 ? '#059669' : pct >= 50 ? '#2563eb' : '#d97706'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mgr-person-card-foot">
                  <small style={{ color: 'var(--text-muted)' }}>
                    {translateText("Joined")} {person?.createdAt ? new Date(person.createdAt).toLocaleDateString() : '—'}
                  </small>
                  <div className="mgr-action-row">
                    <button className="mgr-btn-sm" onClick={() => openDetail(w)}>
                      {translateText("View Journey")}
                    </button>
                    <Link
                      className="mgr-btn-sm"
                      to={`/manager/messages?senderId=${encodeURIComponent(w.id)}&recipientRole=WORSHIPER&recipientName=${encodeURIComponent(fullName(person))}`}
                    >
                      ✉
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {filtered.length > 0 && (
        <div className="mgr-pagination">
          <div className="mgr-pagination-info">
            {translateText("Showing")} <strong>{(currentPage - 1) * pageSize + 1}</strong> – <strong>{Math.min(currentPage * pageSize, filtered.length)}</strong> {translateText("of")} <strong>{filtered.length}</strong> {translateText("worshipers")}
          </div>

          <div className="mgr-pagination-actions">
            <select
              className="mgr-select"
              style={{ padding: '4px 8px', fontSize: 11 }}
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
            >
              <option value={10}>10 {translateText("per page")}</option>
              <option value={15}>15 {translateText("per page")}</option>
              <option value={25}>25 {translateText("per page")}</option>
              <option value={50}>50 {translateText("per page")}</option>
            </select>

            <button
              className="mgr-page-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              ‹ {translateText("Prev")}
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
              let pageNum = idx + 1;
              if (totalPages > 5 && currentPage > 3) {
                pageNum = currentPage - 2 + idx;
                if (pageNum > totalPages) pageNum = totalPages - (4 - idx);
              }
              return (
                <button
                  key={pageNum}
                  className={`mgr-page-btn ${currentPage === pageNum ? 'active' : ''}`}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              className="mgr-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              {translateText("Next")} ›
            </button>
          </div>
        </div>
      )}

      {/* ── Journey & Registration Detail Modal ── */}
      {selected && (
        <div className="mgr-modal-backdrop" onClick={() => { setSelected(null); setDetail(null); }}>
          <div className="mgr-modal wide" onClick={e => e.stopPropagation()}>
            <button
              className="mgr-modal-close"
              onClick={() => { setSelected(null); setDetail(null); }}
              aria-label={translateText("Close modal")}
            >
              ×
            </button>

            {/* Profile Header */}
            <div className="mgr-modal-header">
              <div className="mgr-person-avatar-wrap">
                {p?.photoUrl ? (
                  <img src={p.photoUrl} alt={fullName(p)} style={{ width: 64, height: 64, borderRadius: 16 }} />
                ) : (
                  <div className="mgr-avatar-lg" style={{ borderRadius: 16, width: 64, height: 64, fontSize: 24 }}>
                    {(p?.firstName ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className={`mgr-online-dot ${activeDetailUser?.isActive ? '' : 'inactive'}`} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 22, color: 'var(--navy-900)' }}>
                    {fullName(p)}
                  </h2>
                  <JourneyBadge w={activeDetailUser!} />
                  <span className={`mgr-badge ${activeDetailUser?.isActive ? 'green' : 'grey'}`}>
                    {activeDetailUser?.isActive ? translateText("Account Active") : translateText("Account Inactive")}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
                  {p?.email && <span>✉ {p.email}</span>}
                  {p?.phone && <span>📞 {p.phone}</span>}
                  {p?.createdAt && <span>🗓 {translateText("Registered")} {new Date(p.createdAt).toLocaleDateString()}</span>}
                </div>
              </div>

              <div className="mgr-action-row" style={{ alignSelf: 'flex-start' }}>
                <Link
                  className="mgr-btn-primary mgr-btn-sm"
                  to={`/manager/messages?senderId=${encodeURIComponent(activeDetailUser!.id)}&recipientRole=WORSHIPER&recipientName=${encodeURIComponent(fullName(p))}`}
                >
                  ✉ {translateText("Send Message")}
                </Link>
                <button
                  disabled={actingId === activeDetailUser!.id}
                  className={`mgr-btn-sm ${activeDetailUser?.isActive ? 'orange' : 'green'}`}
                  onClick={() => void toggleActive(activeDetailUser!)}
                >
                  {activeDetailUser?.isActive ? translateText("Deactivate") : translateText("Activate")}
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="mgr-modal-tabs">
              <button
                className={`mgr-modal-tab ${modalTab === 'journey' ? 'active' : ''}`}
                onClick={() => setModalTab('journey')}
              >
                🌱 {translateText("Spiritual Journey")}
              </button>
              <button
                className={`mgr-modal-tab ${modalTab === 'personal' ? 'active' : ''}`}
                onClick={() => setModalTab('personal')}
              >
                👤 {translateText("Personal Info")}
              </button>
              <button
                className={`mgr-modal-tab ${modalTab === 'faith' ? 'active' : ''}`}
                onClick={() => setModalTab('faith')}
              >
                ✝ {translateText("Faith & Baptism")}
              </button>
              <button
                className={`mgr-modal-tab ${modalTab === 'household' ? 'active' : ''}`}
                onClick={() => setModalTab('household')}
              >
                🏡 {translateText("Family & Household")}
              </button>
              <button
                className={`mgr-modal-tab ${modalTab === 'contact' ? 'active' : ''}`}
                onClick={() => setModalTab('contact')}
              >
                📍 {translateText("Contact & Address")}
              </button>
              <button
                className={`mgr-modal-tab ${modalTab === 'requests' ? 'active' : ''}`}
                onClick={() => setModalTab('requests')}
              >
                📋 {translateText("Requests")} ({p?.requests?.length ?? 0})
              </button>
            </div>

            {loadingDetail ? (
              <div className="mgr-loading-text">{translateText("Loading journey profile…")}</div>
            ) : !p ? (
              <div className="mgr-empty">{translateText("No profile details found.")}</div>
            ) : (
              <>
                {/* ── TAB 1: SPIRITUAL JOURNEY ── */}
                {modalTab === 'journey' && (
                  <div>
                    <div className="mgr-card-section">
                      <h4>{translateText("Milestone Roadmap")}</h4>
                      <div className="mgr-journey-steps">
                        {[
                          { label: translateText('Account Registered'), done: true, desc: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '' },
                          { label: translateText('Enrolled in Beginner Course'), done: (p.courseProgress ?? []).some(cp => cp.course.category === 'BEGINNER' && cp.percentage > 0), desc: translateText('Started foundations lessons') },
                          { label: translateText('Completed 95%+ Coursework'), done: (p.courseProgress ?? []).some(cp => cp.course.category === 'BEGINNER' && cp.percentage >= 95), desc: translateText('Qualified for course certificate') },
                          { label: translateText('Course Certificate Issued'), done: (p.certificates ?? []).some(c => c.type === 'COURSE'), desc: translateText('Verified certificate earned') },
                          { label: translateText('Baptism Request Submitted'), done: (p.requests ?? []).some(r => r.type === 'BAPTISM'), desc: translateText('Application for water baptism') },
                          { label: translateText('Water Baptism Recorded'), done: (p.baptisms ?? []).length > 0, desc: translateText('Baptized into the body of Christ') },
                          { label: translateText('Inducted as Full Member'), done: Boolean(p.member), desc: p.member ? `${translateText("ID")}: ${p.member.membershipNumber}` : translateText('Final covenant stage') },
                        ].map((step, idx) => (
                          <div key={idx} className={`mgr-journey-item ${step.done ? 'done' : ''}`}>
                            <div className="mgr-journey-dot">
                              {step.done ? '✓' : idx + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              <strong>{step.label}</strong>
                              {step.desc && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{step.desc}</small>}
                            </div>
                            <span className={`mgr-badge ${step.done ? 'green' : 'grey'}`}>
                              {step.done ? translateText("Completed") : translateText("Pending")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Course Progress Breakdown */}
                    {(p.courseProgress ?? []).length > 0 && (
                      <div className="mgr-card-section">
                        <h4>{translateText("Course Progress")}</h4>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {p.courseProgress.map((cp, idx) => (
                            <div key={idx} style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div>
                                  <strong style={{ color: 'var(--navy-900)' }}>{cp.course.title}</strong>
                                  <span className="mgr-cat-chip" style={{ marginLeft: 8 }}>
                                    {cp.course.category.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <strong style={{ color: 'var(--navy-700)' }}>{cp.percentage}%</strong>
                              </div>
                              <div className="mgr-progress-mini">
                                <div style={{ height: 8 }}>
                                  <div style={{ width: `${cp.percentage}%`, background: cp.percentage >= 95 ? '#059669' : '#2563eb' }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Certificates */}
                    {(p.certificates ?? []).length > 0 && (
                      <div className="mgr-card-section">
                        <h4>{translateText("Issued Certificates")}</h4>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {p.certificates.map(c => (
                            <div key={c.certificateNumber} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                              <div>
                                <strong style={{ color: 'var(--navy-800)' }}>
                                  🎓 {c.type.replace(/_/g, ' ')} {translateText("Certificate")}
                                </strong>
                                <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                                  {translateText("Issued")}: {new Date(c.issuedAt).toLocaleDateString()}
                                </small>
                              </div>
                              <span className="mgr-code">#{c.certificateNumber}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Membership */}
                    {p.member && (
                      <div className="mgr-card-section">
                        <h4>{translateText("Church Membership Details")}</h4>
                        <div className="mgr-detail-grid">
                          <div className="mgr-detail-kv">
                            <small>{translateText("Membership Number")}</small>
                            <code className="mgr-code">{p.member.membershipNumber}</code>
                          </div>
                          <div className="mgr-detail-kv">
                            <small>{translateText("Member Since")}</small>
                            <strong>{new Date(p.member.membershipDate).toLocaleDateString()}</strong>
                          </div>
                          {p.member.cellMemberships?.[0] && (
                            <div className="mgr-detail-kv">
                              <small>{translateText("Home Cell")}</small>
                              <strong>{p.member.cellMemberships[0].cell.name}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 2: PERSONAL DETAILS ── */}
                {modalTab === 'personal' && (
                  <div className="mgr-card-section">
                    <h4>{translateText("Personal & Biographical Profile")}</h4>
                    <div className="mgr-detail-grid">
                      <div className="mgr-detail-kv">
                        <small>{translateText("Full Legal Name")}</small>
                        <strong>{fullName(p)}</strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Gender")}</small>
                        <strong>{p.gender || '—'}</strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Date of Birth & Age")}</small>
                        <strong>
                          {p.dateOfBirth ? `${new Date(p.dateOfBirth).toLocaleDateString()}` : '—'}
                          {p.dateOfBirth && calculateAge(p.dateOfBirth) ? ` (${calculateAge(p.dateOfBirth)} ${translateText("yrs")})` : ''}
                        </strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Place of Birth")}</small>
                        <strong>{p.placeOfBirth || '—'}</strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Marital Status")}</small>
                        <strong>{p.maritalStatus || '—'}</strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Nationality")}</small>
                        <strong>{p.nationality || '—'}</strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Occupation")}</small>
                        <strong>{p.occupation || '—'}</strong>
                      </div>
                      <div className="mgr-detail-kv">
                        <small>{translateText("Means of Livelihood")}</small>
                        <strong>{p.makingALiving || '—'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 3: FAITH & SALVATION ── */}
                {modalTab === 'faith' && (
                  <div>
                    <div className="mgr-card-section">
                      <h4>{translateText("Salvation & Confession")}</h4>
                      <div className="mgr-detail-grid">
                        <div className="mgr-detail-kv">
                          <small>{translateText("Accepted Jesus Christ")}</small>
                          <strong>{p.acceptedJesus || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Year Received the Lord")}</small>
                          <strong>{p.yearReceivedLord || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Christian Denomination")}</small>
                          <strong>{p.denomination || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Member of This Church")}</small>
                          <strong>{p.memberOfThisChurch || '—'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mgr-card-section">
                      <h4>{translateText("Baptism History")}</h4>
                      <div className="mgr-detail-grid">
                        <div className="mgr-detail-kv">
                          <small>{translateText("Year Baptized")}</small>
                          <strong>{p.yearBaptized || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Previous Church Name")}</small>
                          <strong>{p.previousChurchName || p.previousChurch || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Baptism Certificate File")}</small>
                          {p.previousBaptismCertificateUrl ? (
                            <a
                              href={p.previousBaptismCertificateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mgr-btn-sm"
                              style={{ display: 'inline-block', marginTop: 4 }}
                            >
                              📄 {translateText("View Certificate")}
                            </a>
                          ) : (
                            <span className="mgr-muted">{translateText("No file attached")}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mgr-card-section">
                      <h4>{translateText("Ministry & Church Service")}</h4>
                      <div className="mgr-detail-grid">
                        <div className="mgr-detail-kv">
                          <small>{translateText("Current Service")}</small>
                          <strong>{p.currentService || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Past Service")}</small>
                          <strong>{p.pastService || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Service Load")}</small>
                          <strong>{p.serviceLoad || '—'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 4: FAMILY & HOUSEHOLD ── */}
                {modalTab === 'household' && (
                  <div>
                    <div className="mgr-card-section">
                      <h4>{translateText("Household Size & Children")}</h4>
                      <div className="mgr-detail-grid">
                        <div className="mgr-detail-kv">
                          <small>{translateText("Family Size")}</small>
                          <strong>{p.familySize || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Number of Children")}</small>
                          <strong>{p.numberOfChildren || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Children Know the Lord")}</small>
                          <strong>{p.childrenKnowLord || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Household Members in Need")}</small>
                          <strong>{p.poorNotKnowLord || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Unemployed in Household")}</small>
                          <strong>{p.unemployedInHousehold || '—'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mgr-card-section">
                      <h4>{translateText("Home Association / Cell Connection")}</h4>
                      <div className="mgr-detail-grid">
                        <div className="mgr-detail-kv">
                          <small>{translateText("Shares Home Association")}</small>
                          <strong>{p.sharesHomeAssociation || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("House Ownership / Whose House")}</small>
                          <strong>{p.sharesWhoseHouse || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Union / Fellowship Leader")}</small>
                          <strong>{p.unionLeaderName || '—'}</strong>
                        </div>
                      </div>
                      {p.homeAssociationReason && (
                        <div style={{ marginTop: 12 }}>
                          <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                            {translateText("Association Notes")}
                          </small>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--navy-800)', background: 'var(--surface)', padding: 10, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                            {p.homeAssociationReason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB 5: CONTACT & ADDRESS ── */}
                {modalTab === 'contact' && (
                  <div>
                    <div className="mgr-card-section">
                      <h4>{translateText("Telephone & Electronic Contact")}</h4>
                      <div className="mgr-detail-grid">
                        <div className="mgr-detail-kv">
                          <small>{translateText("Mobile Phone")}</small>
                          <strong>{p.phone || '—'}</strong>
                          {p.phone && (
                            <button
                              className="mgr-copy-icon"
                              onClick={() => copyToClipboard(p.phone!, 'Phone')}
                              style={{ marginTop: 4, display: 'inline-block' }}
                            >
                              📋 {translateText("Copy Phone")}
                            </button>
                          )}
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Email Address")}</small>
                          <strong>{p.email || '—'}</strong>
                          {p.email && (
                            <button
                              className="mgr-copy-icon"
                              onClick={() => copyToClipboard(p.email!, 'Email')}
                              style={{ marginTop: 4, display: 'inline-block' }}
                            >
                              📋 {translateText("Copy Email")}
                            </button>
                          )}
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Office Telephone")}</small>
                          <strong>{p.officeTelephone || '—'}</strong>
                        </div>
                        <div className="mgr-detail-kv">
                          <small>{translateText("Home Telephone")}</small>
                          <strong>{p.homeTelephone || '—'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mgr-card-section">
                      <h4>{translateText("Physical Residential Addresses")}</h4>
                      {p.addresses && p.addresses.length > 0 ? (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {p.addresses.map((a, idx) => {
                            const addr = a.address;
                            return (
                              <div key={idx} className="mgr-detail-grid" style={{ background: 'var(--surface)', padding: 12, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                                <div className="mgr-detail-kv"><small>{translateText("Country")}</small><strong>{addr.country || '—'}</strong></div>
                                <div className="mgr-detail-kv"><small>{translateText("Region")}</small><strong>{addr.region || '—'}</strong></div>
                                <div className="mgr-detail-kv"><small>{translateText("City")}</small><strong>{addr.city || '—'}</strong></div>
                                <div className="mgr-detail-kv"><small>{translateText("Sub-City")}</small><strong>{addr.subCity || '—'}</strong></div>
                                <div className="mgr-detail-kv"><small>{translateText("Woreda")}</small><strong>{addr.woreda || '—'}</strong></div>
                                <div className="mgr-detail-kv"><small>{translateText("Kebele")}</small><strong>{addr.kebele || '—'}</strong></div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="mgr-muted">{translateText("No registered physical address.")}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB 6: REQUESTS ── */}
                {modalTab === 'requests' && (
                  <div className="mgr-card-section">
                    <h4>{translateText("Submitted Requests & Applications")}</h4>
                    {(p.requests ?? []).length > 0 ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {p.requests.map((r, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'var(--surface)',
                              padding: '12px 14px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border)'
                            }}
                          >
                            <div>
                              <strong style={{ color: 'var(--navy-900)' }}>
                                {r.type.replace(/_/g, ' ')}
                              </strong>
                              {r.details && (
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                  {r.details}
                                </p>
                              )}
                              {r.scheduledDate && (
                                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
                                  🗓 {translateText("Scheduled for")}: {new Date(r.scheduledDate).toLocaleDateString()}
                                </small>
                              )}
                            </div>
                            <span
                              className={`mgr-badge ${
                                r.status === 'APPROVED' || r.status === 'COMPLETED'
                                  ? 'green'
                                  : r.status === 'REJECTED'
                                  ? 'red'
                                  : 'orange'
                              }`}
                            >
                              {r.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="mgr-muted">{translateText("No service requests recorded.")}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
