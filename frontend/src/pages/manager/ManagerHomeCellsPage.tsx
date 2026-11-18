import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, messageFromError } from '../../api';
import { useLanguage } from '../../i18n/context';

type Leader = { firstName: string; lastName: string };
type CellMember = { member: { person: { firstName: string; lastName: string; phone?: string } } };
type Attendance = { id: string; person: { firstName: string; lastName: string }; attendedAt: string; note?: string };
type Activity = { id: string; type: string; title: string; description?: string; scheduledAt?: string };
type HomeCell = {
  id: string; name: string; meetingDay?: string; meetingTime?: string;
  capacity: number; isActive: boolean; memberCount: number; availableCapacity: number;
  leader?: Leader | null;
  members?: CellMember[];
  attendance?: Attendance[];
  activities?: Activity[];
};

const addSchema = z.object({
  name:        z.string().trim().min(2, 'Enter a Home Cell name').max(120, 'Name must be 120 characters or fewer'),
  capacity:    z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(500, 'Capacity cannot exceed 500'),
});
type AddValues = z.infer<typeof addSchema>;

const activitySchema = z.object({
  type:        z.enum(['BIBLE_STUDY', 'PRAYER', 'ANNOUNCEMENT', 'OTHER']),
  title:       z.string().trim().min(2, 'Enter a title').max(120, 'Title must be 120 characters or fewer'),
  description: z.string().max(3000, 'Description must be 3,000 characters or fewer'),
  scheduledAt: z.string().refine(value => !value || !Number.isNaN(new Date(value).getTime()), 'Enter a valid date and time'),
});
type ActivityValues = z.infer<typeof activitySchema>;

export function ManagerHomeCellsPage() {
  const { t } = useLanguage();
  const [cells, setCells]       = useState<HomeCell[]>([]);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [detail, setDetail]     = useState<HomeCell | null>(null);
  const [search, setSearch]     = useState('');
  const [capacityDraft, setCapacityDraft] = useState('');

  const addForm = useForm<AddValues>({ resolver: zodResolver(addSchema), defaultValues: { name: '', capacity: 20 }, mode: 'onBlur' });
  const actForm = useForm<ActivityValues>({ resolver: zodResolver(activitySchema), defaultValues: { type: 'BIBLE_STUDY', title: '', description: '', scheduledAt: '' }, mode: 'onBlur' });

  const load = () =>
    api.get('/manager/home-cells')
      .then(({ data }) => setCells(data.homeCells ?? []))
      .catch(e => setError(messageFromError(e)));

  useEffect(() => { void load(); }, []);

  const openDetail = async (cell: HomeCell) => {
    try {
      const { data } = await api.get(`/manager/home-cells/${cell.id}`);
      setDetail(data.homeCell);
      setCapacityDraft(String(data.homeCell.capacity));
    } catch (e) { setError(messageFromError(e)); }
  };

  const saveCapacity = async () => {
    if (!detail) return;
    const capacity = Number(capacityDraft);
    if (!Number.isInteger(capacity) || capacity < detail.memberCount || capacity > 500) {
      setError(`Capacity must be between current membership (${detail.memberCount}) and 500.`);
      return;
    }
    try {
      setError(''); setSuccess('');
      await api.patch(`/manager/home-cells/${detail.id}`, { capacity });
      setSuccess('Home Cell capacity updated.');
      setCells(current => current.map(c => c.id === detail.id ? { ...c, capacity, availableCapacity: Math.max(0, capacity - c.memberCount) } : c));
      setDetail(current => current ? { ...current, capacity, availableCapacity: Math.max(0, capacity - current.memberCount) } : current);
    } catch (e) { setError(messageFromError(e)); }
  };

  const addCell = addForm.handleSubmit(async values => {
    try {
      await api.post('/manager/home-cells', values);
      setSuccess('Home Cell created.');
      setShowAdd(false);
      addForm.reset();
      await load();
    } catch (e) { setError(messageFromError(e)); }
  });

  const addActivity = actForm.handleSubmit(async values => {
    if (!detail) return;
    try {
      await api.post(`/manager/home-cells/${detail.id}/activities`, {
        ...values, scheduledAt: values.scheduledAt || undefined,
      });
      setSuccess('Activity added.');
      actForm.reset();
      await openDetail(detail);
    } catch (e) { setError(messageFromError(e)); }
  });

  const filtered = cells.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mgr-page">
      <div className="mgr-page-header">
        <div>
          <h1>{t('Home Cells')}</h1>
          <p className="mgr-muted">{t('Create Home Cells here. Members are assigned automatically to an active cell with available capacity.')}</p>
        </div>
        <button className="mgr-btn-primary" onClick={() => setShowAdd(v => !v)}>{translateText("＋ ")}{t('Add Home Cell')}</button>
      </div>

      {error   && <div className="mgr-error">{error}</div>}
      {success && <div className="mgr-success">{success}</div>}

      {/* Add form */}
      {showAdd && (
        <div className="mgr-panel">
          <h3>{t('New Home Cell')}</h3>
          <form className="mgr-form-grid" onSubmit={addCell}>
            <label className="mgr-field"><span>{t('Home Cell name')} {translateText("*")}</span><input maxLength={120} required aria-invalid={!!addForm.formState.errors.name} {...addForm.register('name')} />{addForm.formState.errors.name && <small className="mgr-field-err" role="alert">{addForm.formState.errors.name.message}</small>}</label>
            <label className="mgr-field"><span>{t('Capacity')}</span><input type="number" min="1" max="500" step="1" aria-invalid={!!addForm.formState.errors.capacity} {...addForm.register('capacity')} />{addForm.formState.errors.capacity && <small className="mgr-field-err" role="alert">{addForm.formState.errors.capacity.message}</small>}</label>
            <div className="mgr-form-actions">
              <button type="submit" className="mgr-btn-primary" disabled={addForm.formState.isSubmitting}>{t('Save Home Cell')}</button>
              <button type="button" className="mgr-btn-outline" onClick={() => setShowAdd(false)}>{t('Cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Stats row */}
      <div className="mgr-hc-stats">
        <div className="mgr-hc-stat"><strong>{cells.length}</strong><small>{translateText("Total Home Cells")}</small></div>
        <div className="mgr-hc-stat"><strong>{cells.reduce((s, c) => s + c.memberCount, 0)}</strong><small>{translateText("Total Members")}</small></div>
        <div className="mgr-hc-stat"><strong>{cells.filter(c => c.isActive).length}</strong><small>{translateText("Active Cells")}</small></div>
        <div className="mgr-hc-stat"><strong>{cells.filter(c => !c.isActive).length}</strong><small>{translateText("Inactive")}</small></div>
      </div>

      {/* Search */}
      <div className="mgr-toolbar">
        <input className="mgr-search" placeholder={translateText("Search Home Cells…")} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead>
            <tr>
              <th>{translateText("#")}</th><th>{translateText("Home Cell Name")}</th><th>{translateText("Leader")}</th>
              <th>{translateText("Day & Time")}</th><th>{translateText("Members")}</th><th>{translateText("Status")}</th><th>{translateText("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cell, i) => (
              <tr key={cell.id}>
                <td>{i + 1}</td>
                <td><strong>{cell.name}</strong></td>
                <td>{cell.leader ? `${cell.leader.firstName} ${cell.leader.lastName}` : <span className="mgr-muted">{translateText("Not assigned")}</span>}</td>
                <td>{[cell.meetingDay, cell.meetingTime].filter(Boolean).join(' · ') || '—'}</td>
                <td>
                  <span className="mgr-capacity">
                    {cell.memberCount}{translateText("/")}{cell.capacity}
                    <small> {translateText("(")}{cell.availableCapacity} {translateText("available)")}</small>
                  </span>
                </td>
                <td>
                  <span className={`mgr-badge ${cell.isActive ? 'green' : 'grey'}`}>
                    {cell.isActive ? translateText("Active") : translateText("Inactive")}
                  </span>
                </td>
                <td><button className="mgr-btn-sm" onClick={() => openDetail(cell)}>{translateText("View")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="mgr-empty">{translateText("No Home Cells found.")}</div>}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="mgr-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="mgr-modal wide" onClick={e => e.stopPropagation()}>
            <button className="mgr-modal-close" onClick={() => setDetail(null)}>{translateText("×")}</button>
            <p className="mgr-eyebrow">{translateText("HOME CELL")}</p>
            <h2>{detail.name}</h2>
            <p className="mgr-muted">{detail.meetingDay ?? '—'} {translateText("· ")}{detail.meetingTime ?? ''}</p>

            <div className="mgr-detail-grid">
              {[
                ['Leader', detail.leader ? `${detail.leader.firstName} ${detail.leader.lastName}` : 'Not assigned'],
                ['Capacity', `${detail.memberCount} / ${detail.capacity}`],
                ['Status', detail.isActive ? 'Active' : 'Inactive'],
              ].map(([k, v]) => (
                <div key={k} className="mgr-detail-kv"><small>{k}</small><strong>{v}</strong></div>
              ))}
            </div>

            <div className="mgr-capacity-editor">
              <label className="mgr-field"><span>{translateText("Member capacity")}</span><input type="number" min={detail.memberCount} max="500" value={capacityDraft} onChange={e => setCapacityDraft(e.target.value)} /></label>
              <button className="mgr-btn-primary" type="button" onClick={() => void saveCapacity()}>{translateText("Update capacity")}</button>
            </div>

            {/* Members */}
            <div className="mgr-detail-section">
              <h4>{translateText("Members (")}{detail.members?.length ?? 0}{translateText(")")}</h4>
              {(detail.members ?? []).length === 0
                ? <p className="mgr-muted">{translateText("No members yet.")}</p>
                : (detail.members ?? []).map((m, i) => (
                  <div key={i} className="mgr-detail-row">
                    <span>{m.member.person.firstName} {m.member.person.lastName}</span>
                    <small>{m.member.person.phone ?? ''}</small>
                  </div>
                ))}
            </div>

            {/* Recent attendance */}
            {(detail.attendance ?? []).length > 0 && (
              <div className="mgr-detail-section">
                <h4>{translateText("Recent Attendance")}</h4>
                {(detail.attendance ?? []).slice(0, 8).map(a => (
                  <div key={a.id} className="mgr-detail-row">
                    <span>{a.person.firstName} {a.person.lastName}</span>
                    <small>{new Date(a.attendedAt).toLocaleDateString()}</small>
                  </div>
                ))}
              </div>
            )}

            {/* Activities */}
            <div className="mgr-detail-section">
              <h4>{translateText("Bible Study, Prayer & Activities")}</h4>
              {(detail.activities ?? []).length === 0
                ? <p className="mgr-muted">{translateText("No activities recorded.")}</p>
                : (detail.activities ?? []).map(a => (
                  <div key={a.id} className="mgr-activity-chip">
                    <span className={`mgr-act-tag ${a.type.toLowerCase()}`}>{a.type.replace('_', ' ')}</span>
                    <strong>{a.title}</strong>
                    {a.scheduledAt && <small>{new Date(a.scheduledAt).toLocaleString()}</small>}
                  </div>
                ))}

              {/* Add activity inline */}
              <form className="mgr-form-grid compact" onSubmit={addActivity} style={{ marginTop: 14 }}>
                <label className="mgr-field"><span>{translateText("Type")}</span>
                  <select {...actForm.register('type')}>
                    <option value="BIBLE_STUDY">{translateText("Bible Study")}</option>
                    <option value="PRAYER">{translateText("Prayer")}</option>
                    <option value="ANNOUNCEMENT">{translateText("Announcement")}</option>
                    <option value="OTHER">{translateText("Other")}</option>
                  </select>
                </label>
                <label className="mgr-field"><span>{translateText("Title *")}</span><input maxLength={120} required aria-invalid={!!actForm.formState.errors.title} {...actForm.register('title')} />{actForm.formState.errors.title && <small className="mgr-field-err" role="alert">{actForm.formState.errors.title.message}</small>}</label>
                <label className="mgr-field"><span>{translateText("Scheduled at")}</span><input type="datetime-local" aria-invalid={!!actForm.formState.errors.scheduledAt} {...actForm.register('scheduledAt')} />{actForm.formState.errors.scheduledAt && <small className="mgr-field-err" role="alert">{actForm.formState.errors.scheduledAt.message}</small>}</label>
                <label className="mgr-field wide"><span>{translateText("Description")}</span><textarea rows={2} maxLength={3000} aria-invalid={!!actForm.formState.errors.description} {...actForm.register('description')} />{actForm.formState.errors.description && <small className="mgr-field-err" role="alert">{actForm.formState.errors.description.message}</small>}</label>
                <button type="submit" className="mgr-btn-primary compact" disabled={actForm.formState.isSubmitting}>{translateText("Add Activity")}</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
