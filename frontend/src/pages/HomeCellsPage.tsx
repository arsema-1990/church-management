import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';
import { PageTitle } from './RecordsPage';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a Home Cell name').max(120, 'Name must be 120 characters or fewer'),
  leaderId: z.string().optional(),
  location: z.string().trim().max(200, 'Location must be 200 characters or fewer'),
  meetingDay: z.string().trim().max(40, 'Meeting day must be 40 characters or fewer'),
  meetingTime: z.string().trim().max(40, 'Meeting time must be 40 characters or fewer'),
  capacity: z.coerce.number({ invalid_type_error: 'Enter a member capacity' }).int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(500, 'Capacity cannot exceed 500'),
});
type Cell = Record<string, any>;

export function HomeCellsPage() {
  const { user } = useAuth();
  const manager = user?.role === 'ADMINISTRATOR' || user?.role === 'CHURCH_MANAGER';
  const [cells, setCells] = useState<Cell[]>([]);
  const [members, setMembers] = useState<Cell[]>([]);
  const [detail, setDetail] = useState<Cell | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', leaderId: '', location: '', meetingDay: '', meetingTime: '', capacity: 20 }, mode: 'onBlur' });

  const load = () => api.get(manager ? '/manager/home-cells' : '/portal/home-cell')
    .then(({ data }) => setCells(data.homeCells ?? []))
    .catch(e => setError(messageFromError(e)));

  useEffect(() => {
    void load();
    if (manager) api.get('/manager/members').then(({ data }) => setMembers(data.members ?? [])).catch(() => undefined);
  }, [manager]);

  const submit = form.handleSubmit(async values => {
    try {
      await api.post('/manager/home-cells', { ...values, leaderId: values.leaderId || undefined });
      setSuccess('Home Cell added.');
      setOpen(false);
      form.reset();
      await load();
    } catch (e) { setError(messageFromError(e)); }
  });

  const view = async (cell: Cell) => {
    if (!manager) { setDetail(cell); return; }
    try {
      const { data } = await api.get(`/manager/home-cells/${cell.id}`);
      setDetail(data.homeCell);
    } catch (e) { setError(messageFromError(e)); }
  };

  return <div className="content-wrap">
    <PageTitle title={translateText("Home Cells")} description="Home Cell leaders, location, membership, attendance, Bible study, and prayer activities." />
    {error && <div className="error-banner">{error}</div>}
    {success && <div className="success-banner">{success}</div>}
    {manager && <button className="btn-primary" onClick={() => setOpen(value => !value)}>{open ? translateText("Close") : translateText("＋ Add Home Cell")}</button>}
    {open && <section className="panel">
      <h2>{translateText("Add Home Cell")}</h2>
      <form className="form-grid" noValidate onSubmit={submit}>
        <label className="field"><span>{translateText("Home Cell name *")}</span><input maxLength={120} aria-invalid={!!form.formState.errors.name} {...form.register('name')} />{form.formState.errors.name && <small className="field-error" role="alert">{form.formState.errors.name.message}</small>}</label>
        <label className="field"><span>{translateText("Home Cell leader")}</span><select {...form.register('leaderId')}><option value="">{translateText("No leader assigned")}</option>{members.map(member => <option key={member.personId} value={member.personId}>{member.person?.firstName} {member.person?.lastName}</option>)}</select></label>
        <label className="field"><span>{translateText("Location")}</span><input maxLength={200} aria-invalid={!!form.formState.errors.location} {...form.register('location')} />{form.formState.errors.location && <small className="field-error" role="alert">{form.formState.errors.location.message}</small>}</label>
        <label className="field"><span>{translateText("Meeting day")}</span><input maxLength={40} placeholder={translateText("e.g. Saturday")} {...form.register('meetingDay')} />{form.formState.errors.meetingDay && <small className="field-error" role="alert">{form.formState.errors.meetingDay.message}</small>}</label>
        <label className="field"><span>{translateText("Meeting time")}</span><input maxLength={40} placeholder={translateText("e.g. 4:00 PM")} {...form.register('meetingTime')} />{form.formState.errors.meetingTime && <small className="field-error" role="alert">{form.formState.errors.meetingTime.message}</small>}</label>
        <label className="field"><span>{translateText("Member capacity")}</span><input type="number" min="1" max="500" step="1" aria-invalid={!!form.formState.errors.capacity} {...form.register('capacity')} />{form.formState.errors.capacity && <small className="field-error" role="alert">{form.formState.errors.capacity.message}</small>}</label>
        <button className="btn-primary" disabled={form.formState.isSubmitting}>{translateText("Save Home Cell")}</button>
      </form>
    </section>}
    {!cells.length
      ? <div className="empty-card mt-4"><strong>{translateText("No Home Cells available")}</strong><p>{translateText("Contact the church team for an assignment.")}</p></div>
      : <div className="record-grid mt-4">{cells.map(cell => <article className="record-card" key={cell.id}>
        <div className="record-top"><span className="record-avatar">{translateText("⌂")}</span><span className={`status-tag ${cell.isActive === false ? 'rejected' : 'active'}`}>{cell.isActive === false ? translateText("Inactive") : translateText("Active")}</span></div>
        <h2>{cell.name}</h2><p className="record-subtitle">{cell.location ?? 'Church community'}</p>
        <div className="record-details">
          <p><span>{translateText("Leader")}</span><strong>{cell.leader ? [cell.leader.firstName, cell.leader.lastName].filter(Boolean).join(' ') : translateText("Not assigned")}</strong></p>
          <p><span>{translateText("Meeting")}</span><strong>{[cell.meetingDay, cell.meetingTime].filter(Boolean).join(' · ') || 'Not scheduled'}</strong></p>
          <p><span>{translateText("Members")}</span><strong>{cell.memberCount ?? cell.members?.length ?? 0} {translateText("/ ")}{cell.capacity ?? '—'}</strong></p>
        </div>
        <button className="btn-outline mt-3" onClick={() => void view(cell)}>{translateText("View Home Cell")}</button>
      </article>)}</div>}
    {detail && <div className="modal-backdrop" onClick={() => setDetail(null)}>
      <section className="study-modal" onClick={event => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setDetail(null)}>{translateText("×")}</button>
        <p className="eyebrow">{translateText("HOME CELL")}</p><h2>{detail.name}</h2>
        <p>{detail.location ?? 'Church community'} {translateText("· ")}{detail.meetingDay ?? 'Meeting day not set'} {detail.meetingTime ?? ''}</p>
        <h3>{translateText("Members")}</h3><div className="material-list">{(detail.members ?? []).map((link: any) => <div key={link.member?.id ?? link.id}>{link.member?.person ? [link.member.person.firstName, link.member.person.lastName].filter(Boolean).join(' ') : link.person ? [link.person.firstName, link.person.lastName].filter(Boolean).join(' ') : translateText("Member")}</div>)}</div>
        <h3>{translateText("Recent attendance")}</h3><div className="material-list">{(detail.attendance ?? []).map((record: any) => <div key={record.id}>{record.person?.firstName} {record.person?.lastName} {translateText("· ")}{new Date(record.attendedAt).toLocaleDateString()}</div>)}</div>
        <h3>{translateText("Bible study & prayer")}</h3><div className="material-list">{(detail.activities ?? []).map((activity: any) => <div key={activity.id}><strong>{activity.title}</strong><small>{activity.type.replaceAll('_', ' ')} {translateText("· ")}{activity.scheduledAt ? new Date(activity.scheduledAt).toLocaleString() : translateText("No time set")}</small></div>)}</div>
      </section>
    </div>}
  </div>;
}
