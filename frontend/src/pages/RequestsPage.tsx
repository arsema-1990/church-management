import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageFromError } from '../api';
import { PageTitle } from './RecordsPage';
import { useLanguage } from '../i18n/context';

const submitSchema = z.object({
  details: z.string().max(3000).optional(),
});
type RequestRecord = { id: string; type: string; status: string; details?: string; scheduledDate?: string; scheduledAddress?: string; managerNotes?: string };

export function RequestsPage() {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const form = useForm({ resolver: zodResolver(submitSchema), defaultValues: { details: '' } });
  const load = () => api.get('/portal/requests').then(({ data }) => setRequests(data.requests ?? [])).catch(e => setError(messageFromError(e)));
  useEffect(() => { void load(); }, []);

  const submit = form.handleSubmit(async values => {
    try {
      setError(''); setSuccess('');
      await api.post('/portal/requests', { ...values, type: 'BAPTISM' });
      setSuccess(t('Your baptism request was sent to the Church Manager.'));
      form.reset(); await load();
    } catch (e) { setError(messageFromError(e)); }
  });

  return <div className="content-wrap">
    <PageTitle title={t('My Requests')} description={t('Request baptism and track request history. Course certificates are issued automatically when you complete a course.')} />
    {error && <div className="error-banner">{error}</div>}{success && <div className="success-banner">{success}</div>}
    <section className="panel request-form-panel">
      <h2>{t('Request baptism')}</h2>
      <p>{t('Baptism requires an approved course certificate.')}</p>
      <form onSubmit={submit} className="form-stack">
        <label className="field"><span>{t('Note for the Church Manager')}</span><textarea rows={3} {...form.register('details')} /></label>
        <button className="btn-primary" disabled={form.formState.isSubmitting}>{t('Submit baptism request')}</button>
      </form>
    </section>
    <section className="record-grid request-grid">
      {requests.map(item => <article className="record-card" key={item.id}>
        <div className="record-top"><span className="record-avatar">{item.type.slice(0, 1)}</span><span className={`status-tag ${item.status.toLowerCase()}`}>{item.status}</span></div>
        <h2>{item.type === 'COURSE_CERTIFICATE' ? t('Course Certificate') : item.type.replaceAll('_', ' ')}</h2>
        <p className="record-subtitle">{item.details || t('No additional note')}</p>
        {item.scheduledDate && <p className="scheduled-date">{t('Scheduled')}{translateText(": ")}{new Date(item.scheduledDate).toLocaleDateString()}{item.scheduledAddress && <> {translateText("· ")}{t('Address')}{translateText(": ")}{item.scheduledAddress}</>}</p>}
        {item.managerNotes && <p className="feedback-note">{t('Manager feedback')}{translateText(": ")}{item.managerNotes}</p>}
      </article>)}
    </section>
  </div>;
}
