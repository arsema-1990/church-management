import { translateText } from '../../i18n/context';
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../../api';
import { useAuth } from '../../state';

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
  gender?: string;
  dateOfBirth?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    isActive: boolean;
    role: string;
  } | null;
  addresses?: { address: Address }[];
};

type Baptism = {
  id?: string;
  baptizedAt: string;
  location?: string;
};

type Certificate = {
  id?: string;
  type: string;
  certificateNumber: string;
  issuedAt?: string;
};

type CellMembership = {
  cellId?: string;
  cell: {
    id?: string;
    name: string;
    location?: string;
    meetingDay?: string;
    meetingTime?: string;
  };
};

type Member = {
  id: string;
  membershipNumber: string;
  membershipDate: string;
  status: string;
  person: Person & {
    baptisms: Baptism[];
    certificates: Certificate[];
  };
  cellMemberships: CellMembership[];
};

type HomeCell = {
  id: string;
  name: string;
  capacity: number;
  memberCount: number;
  availableCapacity: number;
  location?: string;
  meetingDay?: string;
};

type FilterTab = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'IN_CELL' | 'UNASSIGNED';
type SortBy = 'DATE_DESC' | 'DATE_ASC' | 'ID_ASC' | 'NAME_ASC' | 'NAME_DESC';
type ModalTab = 'overview' | 'cell' | 'baptism' | 'contact';

function fullName(p?: Pick<Person, 'firstName' | 'middleName' | 'lastName'> | null) {
  if (!p) return '—';
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}

export function ManagerMembersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMINISTRATOR';

  const [members, setMembers] = useState<Member[]>([]);
  const [homeCells, setHomeCells] = useState<HomeCell[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [cellFilter, setCellFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('DATE_DESC');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Member | null>(null);
  const [modalTab, setModalTab] = useState<ModalTab>('overview');

  // Assign Cell Dialog State
  const [assigningMember, setAssigningMember] = useState<Member | null>(null);
  const [selectedCellId, setSelectedCellId] = useState('');
  const [assigningBusy, setAssigningBusy] = useState(false);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [membersRes, cellsRes] = await Promise.all([
        api.get('/manager/members'),
        api.get('/manager/home-cells').catch(() => ({ data: { homeCells: [] } }))
      ]);
      setMembers(membersRes.data.members ?? []);
      setHomeCells(cellsRes.data.homeCells ?? []);
      setError('');
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    const total = members.length;
    const active = members.filter(m => m.status === 'Active').length;
    const inactive = total - active;
    const inCell = members.filter(m => m.cellMemberships.length > 0).length;
    const unassigned = total - inCell;

    return { total, active, inactive, inCell, unassigned };
  }, [members]);

  // Filtering & Sorting
  const filtered = useMemo(() => {
    let result = members.filter(m => {
      const q = search.toLowerCase().trim();
      const name = fullName(m.person).toLowerCase();
      const num = m.membershipNumber.toLowerCase();
      const email = (m.person.email ?? '').toLowerCase();
      const phone = (m.person.phone ?? '').toLowerCase();
      const cellName = (m.cellMemberships[0]?.cell.name ?? '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || num.includes(q) || email.includes(q) || phone.includes(q) || cellName.includes(q);
      if (!matchesSearch) return false;

      const hasCell = m.cellMemberships.length > 0;
      if (filterTab === 'ACTIVE') return m.status === 'Active';
      if (filterTab === 'INACTIVE') return m.status !== 'Active';
      if (filterTab === 'IN_CELL') return hasCell;
      if (filterTab === 'UNASSIGNED') return !hasCell;

      if (cellFilter) {
        if (cellFilter === 'UNASSIGNED') return !hasCell;
        return m.cellMemberships.some(cm => cm.cell.name === cellFilter || cm.cellId === cellFilter);
      }

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'DATE_DESC') {
        return new Date(b.membershipDate).getTime() - new Date(a.membershipDate).getTime();
      }
      if (sortBy === 'DATE_ASC') {
        return new Date(a.membershipDate).getTime() - new Date(b.membershipDate).getTime();
      }
      if (sortBy === 'ID_ASC') {
        return a.membershipNumber.localeCompare(b.membershipNumber);
      }
      if (sortBy === 'NAME_ASC') {
        return fullName(a.person).localeCompare(fullName(b.person));
      }
      if (sortBy === 'NAME_DESC') {
        return fullName(b.person).localeCompare(fullName(a.person));
      }
      return 0;
    });

    return result;
  }, [members, search, filterTab, cellFilter, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterTab, cellFilter, sortBy, pageSize]);

  const toggleStatus = async (member: Member) => {
    const newStatus = member.status === 'Active' ? 'Inactive' : 'Active';
    const actionDesc = newStatus === 'Active' ? translateText("activate") : translateText("deactivate");
    if (!window.confirm(`${translateText("Are you sure you want to")} ${actionDesc} ${fullName(member.person)}? ${newStatus === 'Inactive' ? translateText("Account login will be disabled.") : ''}`)) return;

    setActingId(member.id);
    try {
      setError('');
      setSuccess('');
      await api.patch(`/manager/members/${member.id}/status`, { status: newStatus });
      setMembers(current => current.map(m => m.id === member.id ? { ...m, status: newStatus } : m));
      if (selected?.id === member.id) {
        setSelected(prev => prev ? { ...prev, status: newStatus } : null);
      }
      setSuccess(`${fullName(member.person)} ${newStatus === 'Active' ? translateText("account activated successfully.") : translateText("account deactivated.")}`);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setActingId(null);
    }
  };

  const deleteMember = async (member: Member) => {
    const name = fullName(member.person);
    if (!window.confirm(`${translateText("Remove")} ${name} ${translateText("from church membership? Their account, profile, course history, and baptism records will be safely preserved as a worshiper.")}`)) return;

    setActingId(member.id);
    try {
      setError('');
      setSuccess('');
      await api.delete(`/manager/members/${member.id}`);
      setMembers(current => current.filter(m => m.id !== member.id));
      setSelected(null);
      setSuccess(`${translateText("Membership removed for")} ${name}. ${translateText("Account downgraded to worshiper.")}`);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setActingId(null);
    }
  };

  // Open assign cell dialog
  const openAssignCell = (member: Member) => {
    setAssigningMember(member);
    const currentCellId = member.cellMemberships[0]?.cellId || '';
    setSelectedCellId(currentCellId);
  };

  // Submit assign / change cell
  const handleAssignCell = async () => {
    if (!assigningMember) return;
    setAssigningBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/manager/members/${assigningMember.id}/home-cell`, {
        cellId: selectedCellId || null
      });

      const updatedCell = homeCells.find(c => c.id === selectedCellId);
      const newCellMemberships: CellMembership[] = updatedCell
        ? [{ cellId: updatedCell.id, cell: { id: updatedCell.id, name: updatedCell.name, location: updatedCell.location, meetingDay: updatedCell.meetingDay } }]
        : [];

      setMembers(curr => curr.map(m => m.id === assigningMember.id ? { ...m, cellMemberships: newCellMemberships } : m));
      if (selected?.id === assigningMember.id) {
        setSelected(prev => prev ? { ...prev, cellMemberships: newCellMemberships } : null);
      }

      setSuccess(selectedCellId ? translateText("Member assigned to Home Cell.") : translateText("Member removed from Home Cell."));
      setAssigningMember(null);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setAssigningBusy(false);
    }
  };

  // Auto-assign unassigned members
  const autoAssignCells = async () => {
    if (!window.confirm(translateText("Auto-assign all unassigned members to active home cells with available space?"))) return;
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/manager/members/auto-assign-cells');
      setSuccess(`${translateText("Successfully auto-assigned")} ${data.assigned ?? 0} ${translateText("members to available home cells.")}`);
      loadData();
    } catch (e) {
      setError(messageFromError(e));
    }
  };

  // Export to CSV
  const exportToCsv = () => {
    const headers = [
      '#',
      'Membership ID',
      'Full Name',
      'Phone',
      'Email',
      'Home Cell',
      'Meeting Day',
      'Baptism Date',
      'Membership Date',
      'Status'
    ];

    const rows = filtered.map((m, idx) => [
      idx + 1,
      `"${m.membershipNumber}"`,
      `"${fullName(m.person)}"`,
      `"${m.person.phone ?? ''}"`,
      `"${m.person.email ?? ''}"`,
      `"${m.cellMemberships[0]?.cell.name ?? 'Unassigned'}"`,
      `"${m.cellMemberships[0]?.cell.meetingDay ?? ''}"`,
      `"${m.person.baptisms[0] ? new Date(m.person.baptisms[0].baptizedAt).toLocaleDateString() : ''}"`,
      `"${new Date(m.membershipDate).toLocaleDateString()}"`,
      `"${m.status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `church-members-roster-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mgr-page">
      {/* ── Page Header ── */}
      <div className="mgr-page-header">
        <div>
          <p className="mgr-eyebrow">{translateText("CHURCH ROSTER & FELLOWSHIP")}</p>
          <h1>{translateText("Church Members")}</h1>
          <p className="mgr-muted">
            {translateText("All baptized church members, credentials, and home cell fellowship assignments.")}
          </p>
        </div>
        <div className="mgr-action-row">
          {stats.unassigned > 0 && (
            <button className="mgr-btn-primary" onClick={autoAssignCells} title={translateText("Auto-assign unassigned members into home cells")}>
              <span aria-hidden="true">⚡</span> {translateText("Auto-Assign Cells")} ({stats.unassigned})
            </button>
          )}
          <button className="mgr-btn-outline" onClick={exportToCsv} title={translateText("Export roster as CSV spreadsheet")}>
            <span aria-hidden="true">📥</span> {translateText("Export CSV")}
          </button>
          <button className="mgr-btn-outline" onClick={loadData} title={translateText("Refresh members list")}>
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
          onClick={() => { setFilterTab('ALL'); setCellFilter(''); }}
        >
          <div className="mgr-kpi-icon teal">🏛</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.total}</span>
            <span className="mgr-kpi-label">{translateText("Total Members")}</span>
            <span className="mgr-kpi-sub">{translateText("Baptized church body")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'ACTIVE' ? 'active' : ''}`}
          onClick={() => { setFilterTab('ACTIVE'); setCellFilter(''); }}
        >
          <div className="mgr-kpi-icon green">✓</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.active}</span>
            <span className="mgr-kpi-label">{translateText("Active Members")}</span>
            <span className="mgr-kpi-sub">{stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% {translateText("good standing")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'IN_CELL' ? 'active' : ''}`}
          onClick={() => { setFilterTab('IN_CELL'); setCellFilter(''); }}
        >
          <div className="mgr-kpi-icon purple">🏡</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.inCell}</span>
            <span className="mgr-kpi-label">{translateText("In Home Cells")}</span>
            <span className="mgr-kpi-sub">{translateText("In small group fellowship")}</span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'UNASSIGNED' ? 'active' : ''}`}
          onClick={() => { setFilterTab('UNASSIGNED'); setCellFilter(''); }}
        >
          <div className={`mgr-kpi-icon ${stats.unassigned > 0 ? 'amber' : 'blue'}`}>
            {stats.unassigned > 0 ? '⚠️' : '✓'}
          </div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.unassigned}</span>
            <span className="mgr-kpi-label">{translateText("Unassigned Cell")}</span>
            <span className="mgr-kpi-sub">
              {stats.unassigned > 0 ? translateText("Needs cell placement") : translateText("All placed")}
            </span>
          </div>
        </button>

        <button
          className={`mgr-kpi-card ${filterTab === 'INACTIVE' ? 'active' : ''}`}
          onClick={() => { setFilterTab('INACTIVE'); setCellFilter(''); }}
        >
          <div className="mgr-kpi-icon red">⏸</div>
          <div className="mgr-kpi-content">
            <span className="mgr-kpi-val">{stats.inactive}</span>
            <span className="mgr-kpi-label">{translateText("Inactive Members")}</span>
            <span className="mgr-kpi-sub">{translateText("Suspended or resting")}</span>
          </div>
        </button>
      </div>

      {/* ── Toolbar Header ── */}
      <div className="mgr-toolbar-header">
        {/* Search */}
        <div className="mgr-search-box">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            placeholder={translateText("Search by member name, ID (MEM-...), email, phone, or cell…")}
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
          {/* Home cell filter */}
          {homeCells.length > 0 && (
            <select
              className="mgr-select"
              value={cellFilter}
              onChange={e => setCellFilter(e.target.value)}
              aria-label={translateText("Filter by home cell")}
            >
              <option value="">{translateText("All Home Cells")}</option>
              <option value="UNASSIGNED">{translateText("Unassigned Only")}</option>
              {homeCells.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Sort */}
          <select
            className="mgr-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            aria-label={translateText("Sort members")}
          >
            <option value="DATE_DESC">{translateText("Sort: Membership (Newest)")}</option>
            <option value="DATE_ASC">{translateText("Sort: Membership (Oldest)")}</option>
            <option value="ID_ASC">{translateText("Sort: Member ID")}</option>
            <option value="NAME_ASC">{translateText("Sort: Name (A to Z)")}</option>
            <option value="NAME_DESC">{translateText("Sort: Name (Z to A)")}</option>
          </select>

          {/* View Mode */}
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
              title={translateText("Card directory view")}
            >
              <span aria-hidden="true">📇</span> {translateText("Cards")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="mgr-filter-bar">
        {[
          { key: 'ALL', label: translateText('All Members'), count: stats.total },
          { key: 'ACTIVE', label: translateText('Active'), count: stats.active },
          { key: 'IN_CELL', label: translateText('In Home Cell'), count: stats.inCell },
          { key: 'UNASSIGNED', label: translateText('Unassigned Cell'), count: stats.unassigned },
          { key: 'INACTIVE', label: translateText('Inactive'), count: stats.inactive },
        ].map(item => (
          <button
            key={item.key}
            className={`mgr-filter-chip ${filterTab === item.key ? 'active' : ''}`}
            onClick={() => { setFilterTab(item.key as FilterTab); setCellFilter(''); }}
          >
            {item.label} <span>{item.count}</span>
          </button>
        ))}
      </div>

      {/* ── Content View ── */}
      {loading ? (
        <div className="mgr-loading-text">{translateText("Loading church members…")}</div>
      ) : filtered.length === 0 ? (
        <div className="mgr-empty">
          <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
          <strong style={{ fontSize: 16, color: 'var(--navy-900)' }}>{translateText("No members found")}</strong>
          <p className="mgr-muted" style={{ marginTop: 4 }}>
            {search ? translateText("No members matched your search terms.") : translateText("No members match the current filter selection.")}
          </p>
          {(search || filterTab !== 'ALL' || cellFilter) && (
            <button
              className="mgr-btn-outline"
              style={{ marginTop: 14 }}
              onClick={() => { setSearch(''); setFilterTab('ALL'); setCellFilter(''); }}
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
                <th>{translateText("Member Name")}</th>
                <th>{translateText("Member ID")}</th>
                <th>{translateText("Contact Info")}</th>
                <th>{translateText("Home Cell Fellowship")}</th>
                {!isAdmin && <th>{translateText("Water Baptism")}</th>}
                <th>{translateText("Member Since")}</th>
                <th>{translateText("Status")}</th>
                <th style={{ textAlign: 'right' }}>{translateText("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((m, i) => {
                const person = m.person;
                const cell = m.cellMemberships[0]?.cell;
                const baptism = person.baptisms[0];
                const index = (currentPage - 1) * pageSize + i + 1;
                const isSelectedRow = selected?.id === m.id;

                return (
                  <tr
                    key={m.id}
                    style={isSelectedRow ? { background: 'var(--navy-50)' } : undefined}
                  >
                    <td><span className="mgr-muted">{index}</span></td>

                    {/* Name */}
                    <td>
                      <div className="mgr-table-person">
                        <div className="mgr-person-avatar-wrap">
                          {person.photoUrl ? (
                            <img src={person.photoUrl} alt={fullName(person)} style={{ width: 36, height: 36, borderRadius: '50%' }} />
                          ) : (
                            <div className="mgr-avatar-sm" style={{ background: 'var(--navy-100)', color: 'var(--navy-800)' }}>
                              {(person.firstName ?? '?').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className={`mgr-online-dot ${m.status === 'Active' ? '' : 'inactive'}`} />
                        </div>
                        <div>
                          <strong style={{ display: 'block', color: 'var(--navy-900)', fontSize: 13 }}>
                            {fullName(person)}
                          </strong>
                          <span className="mgr-badge green" style={{ fontSize: 9, padding: '1px 6px' }}>
                            ✓ {translateText("Baptized Member")}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Member ID */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code className="mgr-code">{m.membershipNumber}</code>
                        <button
                          className="mgr-copy-icon"
                          onClick={() => copyToClipboard(m.membershipNumber, 'Member ID')}
                          title={translateText("Copy Member ID")}
                        >
                          📋
                        </button>
                      </div>
                    </td>

                    {/* Contact Info */}
                    <td>
                      <div style={{ display: 'grid', gap: 2 }}>
                        {person.phone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <a href={`tel:${person.phone}`} style={{ color: 'var(--navy-800)' }}>
                              📞 {person.phone}
                            </a>
                            <button
                              className="mgr-copy-icon"
                              onClick={() => copyToClipboard(person.phone!, 'Phone')}
                              title={translateText("Copy phone")}
                            >
                              📋
                            </button>
                          </div>
                        ) : (
                          <span className="mgr-muted">—</span>
                        )}
                        {person.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                            <a href={`mailto:${person.email}`} style={{ color: 'var(--navy-600)' }}>
                              ✉ {person.email}
                            </a>
                            <button
                              className="mgr-copy-icon"
                              onClick={() => copyToClipboard(person.email!, 'Email')}
                              title={translateText("Copy email")}
                            >
                              📋
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Home Cell Fellowship */}
                    <td>
                      {cell ? (
                        <div>
                          <strong style={{ display: 'block', color: 'var(--navy-900)', fontSize: 12 }}>
                            🏡 {cell.name}
                          </strong>
                          <small style={{ color: 'var(--text-muted)' }}>
                            {cell.meetingDay ? `${cell.meetingDay}` : translateText("Weekly fellowship")}
                          </small>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mgr-badge orange">⚠️ {translateText("Not assigned")}</span>
                          <button
                            className="mgr-btn-sm"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => openAssignCell(m)}
                          >
                            + {translateText("Assign")}
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Baptism */}
                    {!isAdmin && (
                      <td>
                        {baptism ? (
                          <div>
                            <span className="mgr-badge green">
                              ✓ {new Date(baptism.baptizedAt).toLocaleDateString()}
                            </span>
                            {baptism.location && (
                              <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                                {baptism.location}
                              </small>
                            )}
                          </div>
                        ) : (
                          <span className="mgr-muted">—</span>
                        )}
                      </td>
                    )}

                    {/* Membership Date */}
                    <td>
                      <small style={{ color: 'var(--navy-800)', fontWeight: 600 }}>
                        {new Date(m.membershipDate).toLocaleDateString()}
                      </small>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`mgr-badge ${m.status === 'Active' ? 'green' : 'grey'}`}>
                        {m.status === 'Active' ? translateText("Active") : translateText("Inactive")}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="mgr-action-row" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="mgr-btn-sm"
                          onClick={() => { setSelected(m); setModalTab('overview'); }}
                          title={translateText("View full member profile and ID card")}
                        >
                          👁 {translateText("View")}
                        </button>

                        {/* Send message button directly to member! */}
                        {person.user?.id && (
                          <Link
                            className="mgr-btn-sm"
                            to={`/manager/messages?senderId=${encodeURIComponent(person.user.id)}&recipientRole=MEMBER&recipientName=${encodeURIComponent(fullName(person))}`}
                            title={translateText("Send message to member")}
                          >
                            ✉ {translateText("Message")}
                          </Link>
                        )}

                        <button
                          className="mgr-btn-sm"
                          onClick={() => openAssignCell(m)}
                          title={translateText("Assign or change home cell")}
                        >
                          🏡 {cell ? translateText("Change Cell") : translateText("Assign Cell")}
                        </button>

                        <button
                          disabled={actingId === m.id}
                          className={`mgr-btn-sm ${m.status === 'Active' ? 'orange' : 'green'}`}
                          onClick={() => void toggleStatus(m)}
                          title={m.status === 'Active' ? translateText("Deactivate member account") : translateText("Activate member account")}
                        >
                          {m.status === 'Active' ? translateText("Deactivate") : translateText("Activate")}
                        </button>

                        <button
                          disabled={actingId === m.id}
                          className="mgr-btn-sm red"
                          onClick={() => void deleteMember(m)}
                          title={translateText("Remove from membership (preserves worshiper account)")}
                        >
                          🗑
                        </button>
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
          {paginated.map(m => {
            const person = m.person;
            const cell = m.cellMemberships[0]?.cell;

            return (
              <div key={m.id} className="mgr-person-card">
                <div className="mgr-person-card-head">
                  <div className="mgr-person-avatar-wrap">
                    {person.photoUrl ? (
                      <img src={person.photoUrl} alt={fullName(person)} />
                    ) : (
                      <div className="avatar-initials" style={{ background: 'linear-gradient(135deg, #0f7a42, #065f46)' }}>
                        {(person.firstName ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className={`mgr-online-dot ${m.status === 'Active' ? '' : 'inactive'}`} />
                  </div>

                  <div className="mgr-person-card-title">
                    <span className="mgr-person-card-name" title={fullName(person)}>
                      {fullName(person)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <code className="mgr-code" style={{ fontSize: 10 }}>{m.membershipNumber}</code>
                      <button
                        className="mgr-copy-icon"
                        onClick={() => copyToClipboard(m.membershipNumber, 'Member ID')}
                        title={translateText("Copy ID")}
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  <div style={{ marginLeft: 'auto' }}>
                    <span className={`mgr-badge ${m.status === 'Active' ? 'green' : 'grey'}`}>
                      {m.status}
                    </span>
                  </div>
                </div>

                {/* Contact */}
                <div className="mgr-person-card-contact">
                  <div className="mgr-contact-pill">
                    <span>📞 {person.phone || translateText("No phone")}</span>
                    {person.phone && (
                      <button
                        className="mgr-copy-icon"
                        onClick={() => copyToClipboard(person.phone!, 'Phone')}
                      >
                        📋
                      </button>
                    )}
                  </div>
                  <div className="mgr-contact-pill">
                    <span>✉ {person.email || translateText("No email")}</span>
                    {person.email && (
                      <button
                        className="mgr-copy-icon"
                        onClick={() => copyToClipboard(person.email!, 'Email')}
                      >
                        📋
                      </button>
                    )}
                  </div>
                </div>

                {/* Fellowship Cell Info */}
                <div style={{ background: 'var(--surface-3)', padding: '10px 12px', borderRadius: 'var(--r-sm)' }}>
                  <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' }}>
                    {translateText("Home Cell Fellowship")}
                  </small>
                  {cell ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <strong style={{ color: 'var(--navy-900)', fontSize: 13 }}>🏡 {cell.name}</strong>
                      <small style={{ color: 'var(--text-muted)' }}>{cell.meetingDay || ''}</small>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span className="mgr-badge orange">⚠️ {translateText("Unassigned")}</span>
                      <button
                        className="mgr-btn-sm"
                        style={{ padding: '2px 8px', fontSize: 10 }}
                        onClick={() => openAssignCell(m)}
                      >
                        + {translateText("Assign Cell")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mgr-person-card-foot">
                  <small style={{ color: 'var(--text-muted)' }}>
                    {translateText("Member since")} {new Date(m.membershipDate).toLocaleDateString()}
                  </small>
                  <div className="mgr-action-row">
                    <button className="mgr-btn-sm" onClick={() => { setSelected(m); setModalTab('overview'); }}>
                      {translateText("View Profile")}
                    </button>
                    {person.user?.id && (
                      <Link
                        className="mgr-btn-sm"
                        to={`/manager/messages?senderId=${encodeURIComponent(person.user.id)}&recipientRole=MEMBER&recipientName=${encodeURIComponent(fullName(person))}`}
                      >
                        ✉
                      </Link>
                    )}
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
            {translateText("Showing")} <strong>{(currentPage - 1) * pageSize + 1}</strong> – <strong>{Math.min(currentPage * pageSize, filtered.length)}</strong> {translateText("of")} <strong>{filtered.length}</strong> {translateText("members")}
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

      {/* ── Assign / Change Home Cell Dialog ── */}
      {assigningMember && (
        <div className="mgr-modal-backdrop" onClick={() => setAssigningMember(null)}>
          <div className="mgr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <button className="mgr-modal-close" onClick={() => setAssigningMember(null)}>×</button>
            <p className="mgr-eyebrow">{translateText("HOME CELL FELLOWSHIP")}</p>
            <h2>{translateText("Assign Home Cell")}</h2>
            <p className="mgr-muted" style={{ marginBottom: 18 }}>
              {translateText("Choose a home cell for")} <strong>{fullName(assigningMember.person)}</strong> ({assigningMember.membershipNumber}).
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              <div className="mgr-field">
                <span>{translateText("Select Home Cell")}</span>
                <select
                  value={selectedCellId}
                  onChange={e => setSelectedCellId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px' }}
                >
                  <option value="">-- {translateText("No Cell / Remove from Home Cell")} --</option>
                  {homeCells.map(c => {
                    const isFull = c.availableCapacity <= 0;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.memberCount}/{c.capacity} members) {c.meetingDay ? `· ${c.meetingDay}` : ''} {isFull ? `[${translateText("Full")}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedCellId && (
                (() => {
                  const cell = homeCells.find(c => c.id === selectedCellId);
                  if (!cell) return null;
                  return (
                    <div style={{ background: 'var(--surface-3)', padding: '12px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                      <strong>🏡 {cell.name}</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                        {cell.location && <span>📍 {cell.location} · </span>}
                        {cell.meetingDay && <span>🗓 {cell.meetingDay} · </span>}
                        <span>👥 {cell.memberCount} / {cell.capacity} {translateText("members")}</span>
                      </div>
                    </div>
                  );
                })()
              )}

              <div className="mgr-action-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="mgr-btn-outline"
                  onClick={() => setAssigningMember(null)}
                >
                  {translateText("Cancel")}
                </button>
                <button
                  type="button"
                  disabled={assigningBusy}
                  className="mgr-btn-primary"
                  onClick={handleAssignCell}
                >
                  {assigningBusy ? translateText("Saving…") : translateText("Save Assignment")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Member Profile Modal (with Digital Membership Card Preview!) ── */}
      {selected && (
        <div className="mgr-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="mgr-modal wide" onClick={e => e.stopPropagation()}>
            <button className="mgr-modal-close" onClick={() => setSelected(null)}>×</button>

            {/* Digital Membership ID Card */}
            <div className="mgr-id-card">
              <div className="mgr-id-card-head">
                <span className="mgr-id-church">Grace Evangelical Church</span>
                <span className="mgr-id-type">{translateText("Official Church Member")}</span>
              </div>

              <div className="mgr-id-body">
                <div className="mgr-id-avatar">
                  {selected.person.photoUrl ? (
                    <img src={selected.person.photoUrl} alt={fullName(selected.person)} />
                  ) : (
                    (selected.person.firstName ?? '?').slice(0, 1).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="mgr-id-name">{fullName(selected.person)}</div>
                  <div className="mgr-id-num">ID: {selected.membershipNumber}</div>
                  <span className={`mgr-badge ${selected.status === 'Active' ? 'green' : 'grey'}`} style={{ marginTop: 6 }}>
                    ● {selected.status}
                  </span>
                </div>
              </div>

              <div className="mgr-id-meta">
                <div className="mgr-id-meta-item">
                  <small>{translateText("Member Since")}</small>
                  <strong>{new Date(selected.membershipDate).toLocaleDateString()}</strong>
                </div>
                <div className="mgr-id-meta-item">
                  <small>{translateText("Home Cell")}</small>
                  <strong>{selected.cellMemberships[0]?.cell.name || translateText("Not assigned")}</strong>
                </div>
                <div className="mgr-id-meta-item">
                  <small>{translateText("Baptism Date")}</small>
                  <strong>
                    {selected.person.baptisms[0]
                      ? new Date(selected.person.baptisms[0].baptizedAt).toLocaleDateString()
                      : translateText("Recorded")}
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Quick Actions */}
            <div className="mgr-action-row" style={{ marginBottom: 18, justifyContent: 'space-between' }}>
              <div className="mgr-modal-tabs" style={{ marginBottom: 0, border: 'none' }}>
                <button
                  className={`mgr-modal-tab ${modalTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setModalTab('overview')}
                >
                  🏛 {translateText("Overview & Credentials")}
                </button>
                <button
                  className={`mgr-modal-tab ${modalTab === 'cell' ? 'active' : ''}`}
                  onClick={() => setModalTab('cell')}
                >
                  🏡 {translateText("Home Cell")}
                </button>
                <button
                  className={`mgr-modal-tab ${modalTab === 'baptism' ? 'active' : ''}`}
                  onClick={() => setModalTab('baptism')}
                >
                  🌊 {translateText("Baptism & Certificates")}
                </button>
                <button
                  className={`mgr-modal-tab ${modalTab === 'contact' ? 'active' : ''}`}
                  onClick={() => setModalTab('contact')}
                >
                  📍 {translateText("Contact & Address")}
                </button>
              </div>

              <div className="mgr-action-row">
                {selected.person.user?.id && (
                  <Link
                    className="mgr-btn-primary mgr-btn-sm"
                    to={`/manager/messages?senderId=${encodeURIComponent(selected.person.user.id)}&recipientRole=MEMBER&recipientName=${encodeURIComponent(fullName(selected.person))}`}
                  >
                    ✉ {translateText("Send Message")}
                  </Link>
                )}
                <button
                  className="mgr-btn-outline mgr-btn-sm"
                  onClick={() => openAssignCell(selected)}
                >
                  🏡 {translateText("Change Cell")}
                </button>
                <button
                  disabled={actingId === selected.id}
                  className={`mgr-btn-sm ${selected.status === 'Active' ? 'orange' : 'green'}`}
                  onClick={() => void toggleStatus(selected)}
                >
                  {selected.status === 'Active' ? translateText("Deactivate") : translateText("Activate")}
                </button>
              </div>
            </div>

            {/* Tab 1: Overview */}
            {modalTab === 'overview' && (
              <div className="mgr-card-section">
                <h4>{translateText("Membership Credentials")}</h4>
                <div className="mgr-detail-grid">
                  <div className="mgr-detail-kv">
                    <small>{translateText("Membership Number")}</small>
                    <code className="mgr-code">{selected.membershipNumber}</code>
                  </div>
                  <div className="mgr-detail-kv">
                    <small>{translateText("Induction Date")}</small>
                    <strong>{new Date(selected.membershipDate).toLocaleDateString()}</strong>
                  </div>
                  <div className="mgr-detail-kv">
                    <small>{translateText("Membership Status")}</small>
                    <strong style={{ color: selected.status === 'Active' ? 'var(--green-text)' : 'var(--text-muted)' }}>
                      {selected.status}
                    </strong>
                  </div>
                  <div className="mgr-detail-kv">
                    <small>{translateText("Online Portal Account")}</small>
                    <strong>{selected.person.user?.username || '—'}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Home Cell */}
            {modalTab === 'cell' && (
              <div className="mgr-card-section">
                <h4>{translateText("Home Cell Fellowship")}</h4>
                {selected.cellMemberships.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {selected.cellMemberships.map((cm, idx) => (
                      <div key={idx} style={{ background: 'var(--surface)', padding: 14, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong style={{ fontSize: 16, color: 'var(--navy-900)' }}>🏡 {cm.cell.name}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                              {cm.cell.location && <span>📍 {cm.cell.location} · </span>}
                              {cm.cell.meetingDay && <span>🗓 {cm.cell.meetingDay} {cm.cell.meetingTime ? `at ${cm.cell.meetingTime}` : ''}</span>}
                            </div>
                          </div>
                          <button className="mgr-btn-outline mgr-btn-sm" onClick={() => openAssignCell(selected)}>
                            {translateText("Change Cell")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p className="mgr-muted">{translateText("This member is currently not assigned to any Home Cell.")}</p>
                    <button className="mgr-btn-primary" style={{ marginTop: 10 }} onClick={() => openAssignCell(selected)}>
                      🏡 {translateText("Assign to a Home Cell")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Baptism & Certificates */}
            {modalTab === 'baptism' && (
              <div>
                <div className="mgr-card-section">
                  <h4>{translateText("Water Baptism Record")}</h4>
                  {selected.person.baptisms.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {selected.person.baptisms.map((b, idx) => (
                        <div key={idx} className="mgr-detail-grid">
                          <div className="mgr-detail-kv">
                            <small>{translateText("Baptism Date")}</small>
                            <strong>{new Date(b.baptizedAt).toLocaleDateString()}</strong>
                          </div>
                          <div className="mgr-detail-kv">
                            <small>{translateText("Location / Sanctuary")}</small>
                            <strong>{b.location || 'Grace Evangelical Church'}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="mgr-muted">{translateText("No water baptism date recorded.")}</span>
                  )}
                </div>

                <div className="mgr-card-section">
                  <h4>{translateText("Earned Certificates")}</h4>
                  {selected.person.certificates.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {selected.person.certificates.map(c => (
                        <div key={c.certificateNumber} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                          <div>
                            <strong style={{ color: 'var(--navy-900)' }}>
                              🎓 {c.type.replace(/_/g, ' ')} {translateText("Certificate")}
                            </strong>
                            {c.issuedAt && (
                              <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                                {translateText("Issued")}: {new Date(c.issuedAt).toLocaleDateString()}
                              </small>
                            )}
                          </div>
                          <code className="mgr-code">#{c.certificateNumber}</code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="mgr-muted">{translateText("No certificates on file.")}</span>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Contact & Address */}
            {modalTab === 'contact' && (
              <div>
                <div className="mgr-card-section">
                  <h4>{translateText("Contact Information")}</h4>
                  <div className="mgr-detail-grid">
                    <div className="mgr-detail-kv">
                      <small>{translateText("Telephone / Phone")}</small>
                      <strong>{selected.person.phone || '—'}</strong>
                      {selected.person.phone && (
                        <button
                          className="mgr-copy-icon"
                          onClick={() => copyToClipboard(selected.person.phone!, 'Phone')}
                          style={{ marginTop: 4, display: 'inline-block' }}
                        >
                          📋 {translateText("Copy Phone")}
                        </button>
                      )}
                    </div>
                    <div className="mgr-detail-kv">
                      <small>{translateText("Email Address")}</small>
                      <strong>{selected.person.email || '—'}</strong>
                      {selected.person.email && (
                        <button
                          className="mgr-copy-icon"
                          onClick={() => copyToClipboard(selected.person.email!, 'Email')}
                          style={{ marginTop: 4, display: 'inline-block' }}
                        >
                          📋 {translateText("Copy Email")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mgr-card-section">
                  <h4>{translateText("Registered Addresses")}</h4>
                  {selected.person.addresses && selected.person.addresses.length > 0 ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {selected.person.addresses.map((a, idx) => {
                        const addr = a.address;
                        return (
                          <div key={idx} className="mgr-detail-grid" style={{ background: 'var(--surface)', padding: 12, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                            <div className="mgr-detail-kv"><small>{translateText("City")}</small><strong>{addr.city || '—'}</strong></div>
                            <div className="mgr-detail-kv"><small>{translateText("Sub-City")}</small><strong>{addr.subCity || '—'}</strong></div>
                            <div className="mgr-detail-kv"><small>{translateText("Woreda")}</small><strong>{addr.woreda || '—'}</strong></div>
                            <div className="mgr-detail-kv"><small>{translateText("Kebele")}</small><strong>{addr.kebele || '—'}</strong></div>
                            <div className="mgr-detail-kv"><small>{translateText("Region")}</small><strong>{addr.region || '—'}</strong></div>
                            <div className="mgr-detail-kv"><small>{translateText("Country")}</small><strong>{addr.country || '—'}</strong></div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="mgr-muted">{translateText("No registered address.")}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
