import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { api, messageFromError } from '../../api';
import { useLanguage } from '../../i18n/context';

type HomeCell = { id: string; name: string; location?: string | null; meetingDay?: string | null; meetingTime?: string | null };
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function InstructorHomeCellsPage() {
  const { t } = useLanguage();
  const [cells, setCells] = useState<HomeCell[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { meetingDay: string; meetingTime: string }>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data } = await api.get('/instructor/home-cells');
      const list: HomeCell[] = data.homeCells ?? [];
      setCells(list);
      setDrafts(Object.fromEntries(list.map(cell => [cell.id, {
        meetingDay: cell.meetingDay ?? '', meetingTime: cell.meetingTime ?? '',
      }])));
    } catch (e) { setError(messageFromError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (cell: HomeCell) => {
    const schedule = drafts[cell.id];
    if (!schedule?.meetingDay || !schedule.meetingTime) {
      setError(t('Choose a meeting day and time.'));
      return;
    }
    setSaving(cell.id); setError(''); setSuccess('');
    try {
      const { data } = await api.patch(`/instructor/home-cells/${cell.id}/schedule`, schedule);
      setCells(current => current.map(item => item.id === cell.id ? data.homeCell : item));
      setSuccess(`${cell.name}: ${t('Meeting schedule saved. Members can now see it in their Home Cell dashboard.')}`);
    } catch (e) { setError(messageFromError(e)); }
    finally { setSaving(null); }
  };

  return <div className="mgr-page">
    <div className="mgr-page-header"><div><h1>{t('Home Cell Schedule')}</h1><p className="mgr-muted">{t('Set the day and time for the active Home Cell you lead. Members will see the schedule in their portal.')}</p></div></div>
    {error && <div className="mgr-error" role="alert">{error}</div>}
    {success && <div className="mgr-success" role="status">{success}</div>}
    {loading ? <div className="mgr-empty">{translateText("Loading your Home Cells…")}</div> : cells.length === 0
      ? <div className="mgr-empty">{t('No active Home Cell is assigned to you as its leader. Ask the Church Manager to assign you as the leader of a Home Cell.')}</div>
      : <div className="instructor-home-cell-grid">{cells.map(cell => <section className="mgr-panel instructor-home-cell" key={cell.id}>
        <div className="mgr-card-head"><div><p className="mgr-eyebrow">{t('Home Cell')}</p><h2>{cell.name}</h2></div></div>
        {cell.location && <p className="mgr-muted">{cell.location}</p>}
        <div className="mgr-form-grid compact">
          <label className="mgr-field"><span>{t('Meeting Day')}</span><select value={drafts[cell.id]?.meetingDay ?? ''} onChange={e => setDrafts(current => ({ ...current, [cell.id]: { ...current[cell.id], meetingDay: e.target.value } }))}><option value="">{t('Choose a day')}</option>{days.map(day => <option key={day}>{t(day)}</option>)}</select></label>
          <label className="mgr-field"><span>{t('Meeting Time')}</span><input type="time" value={drafts[cell.id]?.meetingTime ?? ''} onChange={e => setDrafts(current => ({ ...current, [cell.id]: { ...current[cell.id], meetingTime: e.target.value } }))} /></label>
        </div>
        <button className="mgr-btn-primary" disabled={saving === cell.id} onClick={() => void save(cell)}>{saving === cell.id ? t('Saving…') : t('Save meeting schedule')}</button>
      </section>)}</div>}
  </div>;
}
