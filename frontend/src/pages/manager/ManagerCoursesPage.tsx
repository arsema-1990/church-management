import { translateText } from '../../i18n/context';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, messageFromError } from '../../api';
import { useAuth } from '../../state';

type Instructor = { username: string; person?: { firstName: string; lastName: string } | null };
type Material = { id: string; title: string; type: string; status: string; fileUrl?: string; onlineUrl?: string; lessonNumber?: number; rejectionReason?: string };
type Course = {
  id: string; instructorId: string; title: string; description?: string; category: string; status: string;
  duration?: string; objectives?: string; lessons: string[];
  targetAudience: string; startDate?: string; endDate?: string;
  rejectionReason?: string; publishedAt?: string; createdAt: string;
  instructor: Instructor;
  reviewer?: { username: string } | null;
  materials: Material[];
  enrollments: { id: string }[];
};
type RejectionTarget = { id: string; kind: 'course' | 'material'; title: string };

const STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: 'orange', PUBLISHED: 'green', APPROVED: 'green',
  REJECTED: 'red', DRAFT: 'grey', ARCHIVED: 'grey',
};

export function ManagerCoursesPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'CHURCH_MANAGER';
  const canReview = isManager;
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter]   = useState<'ALL' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED'>('ALL');
  const [selected, setSelected] = useState<Course | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<RejectionTarget | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingRejection, setSubmittingRejection] = useState(false);
  const [courseFormOpen, setCourseFormOpen] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);

  const load = () =>
    api.get('/manager/courses')
      .then(({ data }) => setCourses(data.courses ?? []))
      .catch(e => setError(messageFromError(e)));

  useEffect(() => { void load(); }, []);

  const reviewCourse = async (id: string, decision: 'approve' | 'reject', notes = ''): Promise<boolean | void> => {
    if (decision === 'reject' && !notes.trim()) {
      const course = courses.find(item => item.id === id);
      setRejectionTarget({ id, kind: 'course', title: course?.title ?? 'this course' });
      setRejectionReason('');
      return;
    }
    try {
      setError(''); setSuccess('');
      await api.post(`/manager/courses/${id}/review`, { decision, notes: notes.trim() });
      setSuccess(decision === 'approve' ? 'Course approved, published, and sent to eligible worshipers and members.' : 'Course rejected. The instructor can see your reason.');
      if (selected?.id === id) setSelected(null);
      await load();
      return true;
    } catch (e) { setError(messageFromError(e)); return false; }
  };

  const reviewMaterial = async (materialId: string, decision: 'approve' | 'reject', notes = ''): Promise<boolean | void> => {
    if (decision === 'reject' && !notes.trim()) {
      const material = courses.flatMap(course => course.materials).find(item => item.id === materialId);
      setRejectionTarget({ id: materialId, kind: 'material', title: material?.title ?? 'this material' });
      setRejectionReason('');
      return;
    }
    try {
      setError(''); setSuccess('');
      await api.post(`/manager/materials/${materialId}/review`, { decision, notes: notes.trim() });
      setSuccess(decision === 'approve' ? 'Material approved.' : 'Material rejected. The instructor can see your reason.');
      await load();
      if (selected) {
        const { data } = await api.get('/manager/courses');
        const updated = (data.courses as Course[]).find(c => c.id === selected.id);
        if (updated) setSelected(updated);
      }
      return true;
    } catch (e) { setError(messageFromError(e)); return false; }
  };

  const submitRejection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejectionTarget || rejectionReason.trim().length < 3) return;
    setSubmittingRejection(true);
    const success = rejectionTarget.kind === 'course'
      ? await reviewCourse(rejectionTarget.id, 'reject', rejectionReason)
      : await reviewMaterial(rejectionTarget.id, 'reject', rejectionReason);
    if (success) {
      setRejectionTarget(null);
      setRejectionReason('');
    }
    setSubmittingRejection(false);
  };

  const createMemberCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lessons = String(form.get('lessons') ?? '').split('\n').map(line => line.trim()).filter(Boolean);
    setCreatingCourse(true); setError(''); setSuccess('');
    try {
      await api.post('/manager/courses', {
        title: String(form.get('title') ?? '').trim(),
        category: String(form.get('category') ?? 'NORMAL_DAY_TO_DAY'),
        description: String(form.get('description') ?? '').trim() || undefined,
        duration: String(form.get('duration') ?? '').trim() || undefined,
        objectives: String(form.get('objectives') ?? '').trim() || undefined,
        lessons,
      });
      setCourseFormOpen(false);
      setSuccess('Member course created and published. Add videos, books, and other materials from the course details.');
      await load();
    } catch (e) { setError(messageFromError(e)); }
    finally { setCreatingCourse(false); }
  };

  const addMemberCourseMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    const url = String(data.get('onlineUrl') ?? '').trim();
    if (!(file instanceof File && file.size > 0) && !url) {
      setError('Select a file or provide a YouTube/resource URL.');
      return;
    }
    setSavingMaterial(true); setError(''); setSuccess('');
    try {
      await api.post(`/manager/courses/${selected.id}/materials`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccess('Course material added and published for members.');
      form.reset();
      const { data: refreshed } = await api.get('/manager/courses');
      const updated = (refreshed.courses as Course[]).find(course => course.id === selected.id);
      if (updated) setSelected(updated);
      setCourses(refreshed.courses ?? []);
    } catch (e) { setError(messageFromError(e)); }
    finally { setSavingMaterial(false); }
  };

  const displayed = filter === 'ALL' ? courses : courses.filter(c => c.status === filter);
  const pending = courses.filter(c => c.status === 'PENDING_APPROVAL').length;
  const pendingMaterials = courses.flatMap(c => c.materials.filter(m => m.status === 'PENDING_APPROVAL')).length;

  return (
    <div className="mgr-page">
      <div className="mgr-page-header">
        <div>
          <h1>{translateText("Courses")}</h1>
          <p className="mgr-muted">{canReview ? translateText("Review instructor submissions and approve or reject courses and learning materials.") : translateText("View courses and submissions. Course approvals are handled by the Church Manager.")}</p>
        </div>
        {isManager && <button className="mgr-btn-primary" onClick={() => setCourseFormOpen(value => !value)}>{courseFormOpen ? translateText("Cancel") : translateText("＋ Add Member Course")}</button>}
      </div>

      {error   && <div className="mgr-error">{error}</div>}
      {success && <div className="mgr-success">{success}</div>}

      {isManager && courseFormOpen && <form className="mgr-panel form-grid" onSubmit={createMemberCourse}>
        <h2 className="mgr-panel-title" style={{ gridColumn: '1 / -1' }}>{translateText("Create a course for members")}</h2>
        <label className="field"><span>{translateText("Course title *")}</span><input name="title" required minLength={2} maxLength={160} /></label>
        <label className="field"><span>{translateText("Course type *")}</span><select name="category" defaultValue="NORMAL_DAY_TO_DAY"><option value="NORMAL_DAY_TO_DAY">{translateText("Member Course")}</option><option value="HOUSEHOLD">{translateText("Home Cell Advanced Course")}</option></select></label>
        <label className="field"><span>{translateText("Duration")}</span><input name="duration" maxLength={100} placeholder={translateText("e.g. 8 weeks")} /></label>
        <label className="field wide"><span>{translateText("Description")}</span><textarea name="description" rows={3} maxLength={8000} /></label>
        <label className="field wide"><span>{translateText("Learning objectives")}</span><textarea name="objectives" rows={2} maxLength={4000} /></label>
        <label className="field wide"><span>{translateText("Lessons (one per line)")}</span><textarea name="lessons" rows={5} maxLength={20000} placeholder={'Introduction\nLesson 1\nLesson 2'} /></label>
        <div className="wide"><small>{translateText("This course is published to members when created. Add YouTube videos, PDFs, documents, images, audio, presentations, assignments, quizzes, and other resources from the course details.")}</small></div>
        <button className="mgr-btn-primary" type="submit" disabled={creatingCourse}>{creatingCourse ? translateText("Creating…") : translateText("Create and publish course")}</button>
      </form>}

      <div className="mgr-toolbar">
        <span className="mgr-muted">{translateText("Approved courses are published to eligible worshipers and members.")}</span>
        {!canReview && <span className="mgr-muted" role="note">{translateText("Course approvals are handled by the Church Manager. Admin accounts can view courses here.")}</span>}
        {canReview && pending + pendingMaterials === 0 && <span className="mgr-muted" role="status">{translateText("No course or material submissions are waiting for review. Accept and reject actions appear on pending submissions.")}</span>}
      </div>

      {/* Summary chips */}
      <div className="mgr-filter-bar">
        {([['ALL', 'All Courses', courses.length], ['PENDING_APPROVAL', `Pending (${pending + pendingMaterials})`, pending + pendingMaterials], ['PUBLISHED', 'Published', courses.filter(c => c.status === 'PUBLISHED').length], ['REJECTED', 'Rejected', courses.filter(c => c.status === 'REJECTED').length]] as [typeof filter, string, number][]).map(([key, label, count]) => (
          <button key={key} className={`mgr-filter-chip${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
            {label} <span>{count}</span>
          </button>
        ))}
      </div>

      {/* Course list */}
      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead>
            <tr>
              <th>{translateText("#")}</th><th>{translateText("Course Name")}</th><th>{translateText("Instructor")}</th><th>{translateText("Category")}</th>
              <th>{translateText("Status")}</th><th>{translateText("Enrolled")}</th><th>{translateText("Materials")}</th><th>{translateText("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((c, i) => {
              const pendingMat = c.materials.filter(m => m.status === 'PENDING_APPROVAL').length;
              return (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td><strong>{c.title}</strong></td>
                  <td>{c.instructor.person ? `${c.instructor.person.firstName} ${c.instructor.person.lastName}` : c.instructor.username}</td>
                  <td><span className="mgr-cat-chip">{c.category.replace(/_/g, ' ')}</span></td>
                  <td><span className={`mgr-badge ${STATUS_COLOR[c.status] ?? 'grey'}`}>{c.status.replace(/_/g, ' ')}</span></td>
                  <td>{c.enrollments.length}</td>
                  <td>
                    {pendingMat > 0
                      ? <span className="mgr-badge orange">{pendingMat} {translateText("pending")}</span>
                      : <span className="mgr-muted">{c.materials.length}</span>}
                  </td>
                  <td>
                    <div className="mgr-action-row">
                      <button className="mgr-btn-sm" onClick={() => setSelected(c)}>{translateText("View")}</button>
                      {canReview && c.status === 'PENDING_APPROVAL' && (
                        <>
                          <button className="mgr-btn-sm green" aria-label={`Approve ${c.title}`} onClick={() => reviewCourse(c.id, 'approve')}><span aria-hidden="true">{translateText("✓")}</span> {translateText("Approve")}</button>
                          <button className="mgr-btn-sm red" aria-label={`Reject ${c.title}`} onClick={() => reviewCourse(c.id, 'reject')}><span aria-hidden="true">{translateText("✕")}</span> {translateText("Reject")}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {displayed.length === 0 && <div className="mgr-empty">{translateText("No courses found.")}</div>}
      </div>

      {/* Course detail modal */}
      {selected && (
        <div className="mgr-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="mgr-modal wide" onClick={e => e.stopPropagation()}>
            <button className="mgr-modal-close" onClick={() => setSelected(null)}>{translateText("×")}</button>
            <p className="mgr-eyebrow">{selected.category.replace(/_/g, ' ')}</p>
            <div className="mgr-modal-head-row">
              <h2>{selected.title}</h2>
              <span className={`mgr-badge ${STATUS_COLOR[selected.status] ?? 'grey'}`}>{selected.status.replace(/_/g, ' ')}</span>
            </div>
            <p className="mgr-muted">{selected.description || 'No description provided.'}</p>

            <div className="mgr-detail-grid">
              {[
                ['Instructor', selected.instructor.person ? `${selected.instructor.person.firstName} ${selected.instructor.person.lastName}` : selected.instructor.username],
                ['Category', selected.category.replace(/_/g, ' ')],
                ['Target Audience', selected.targetAudience.replace(/_/g, ' ')],
                ['Duration', selected.duration ?? '—'],
                ['Enrolled', String(selected.enrollments.length)],
              ].map(([k, v]) => (
                <div key={k} className="mgr-detail-kv"><small>{k}</small><strong>{v}</strong></div>
              ))}
            </div>
            <div className="mgr-action-row" style={{ marginTop: 14 }}>
              <Link className="mgr-btn-outline" to={`/manager/messages?senderId=${encodeURIComponent(selected.instructorId)}`}>{translateText("Message Instructor")}</Link>
            </div>

            {selected.objectives && (
              <div className="mgr-detail-section">
                <h4>{translateText("Learning Objectives")}</h4>
                <p>{selected.objectives}</p>
              </div>
            )}

            {selected.lessons.length > 0 && (
              <div className="mgr-detail-section">
                <h4>{translateText("Lessons (")}{selected.lessons.length}{translateText(")")}</h4>
                <ol className="mgr-lesson-list">
                  {selected.lessons.map((l, i) => <li key={i}>{l}</li>)}
                </ol>
              </div>
            )}

            {selected.rejectionReason && (
              <div className="mgr-feedback-note">{translateText("Church Manager feedback: ")}{selected.rejectionReason}</div>
            )}

            {/* Review actions */}
            {canReview && selected.status === 'PENDING_APPROVAL' && (
              <div className="mgr-action-row" style={{ marginTop: 14 }}>
                <button className="mgr-btn-primary" aria-label={`Approve and publish ${selected.title}`} onClick={() => reviewCourse(selected.id, 'approve')}><span aria-hidden="true">{translateText("✓")}</span> {translateText("Approve & Publish")}</button>
                <button className="mgr-btn-danger" aria-label={`Reject ${selected.title}`} onClick={() => reviewCourse(selected.id, 'reject')}><span aria-hidden="true">{translateText("✕")}</span> {translateText("Reject")}</button>
              </div>
            )}

            {/* Materials */}
            <div className="mgr-detail-section">
              <h4>{translateText("Learning Materials (")}{selected.materials.length}{translateText(")")}</h4>
              {selected.materials.length === 0
                ? <p className="mgr-muted">{translateText("No materials uploaded yet.")}</p>
                : selected.materials.map(mat => (
                  <div key={mat.id} className="mgr-material-row">
                    <div>
                      <strong>{mat.title}</strong>
                      <small>{mat.type.replace(/_/g, ' ')} {mat.lessonNumber != null ? `· Lesson ${mat.lessonNumber}` : translateText("")}</small>
                      {mat.rejectionReason && <small className="mgr-feedback-inline">{translateText("Church Manager feedback: ")}{mat.rejectionReason}</small>}
                    </div>
                    <div className="mgr-action-row">
                      <span className={`mgr-badge ${STATUS_COLOR[mat.status] ?? 'grey'}`}>{mat.status.replace(/_/g, ' ')}</span>
                      {mat.fileUrl && <a className="mgr-btn-sm" href={mat.fileUrl} target="_blank" rel="noreferrer">{translateText("Open")}</a>}
                      {mat.onlineUrl && <a className="mgr-btn-sm" href={mat.onlineUrl} target="_blank" rel="noreferrer">{translateText("Link")}</a>}
                      {canReview && mat.status === 'PENDING_APPROVAL' && (
                        <>
                          <button className="mgr-btn-sm green" aria-label={`Approve ${mat.title}`} onClick={() => reviewMaterial(mat.id, 'approve')}><span aria-hidden="true">{translateText("✓")}</span> {translateText("Approve")}</button>
                          <button className="mgr-btn-sm red" aria-label={`Reject ${mat.title}`} onClick={() => reviewMaterial(mat.id, 'reject')}><span aria-hidden="true">{translateText("✕")}</span> {translateText("Reject")}</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            {isManager && selected.status === 'PUBLISHED' && selected.targetAudience === 'MEMBERS' && <form className="mgr-detail-section" onSubmit={addMemberCourseMaterial}>
              <h4>{translateText("Add member course material")}</h4>
              <div className="form-grid">
                <label className="field"><span>{translateText("Material title *")}</span><input name="title" required minLength={2} maxLength={160} /></label>
                <label className="field"><span>{translateText("Material type *")}</span><select name="type" defaultValue="VIDEO"><option value="VIDEO">{translateText("Video")}</option><option value="PDF_BOOK">{translateText("PDF book")}</option><option value="DOCUMENT">{translateText("Document")}</option><option value="IMAGE">{translateText("Image")}</option><option value="AUDIO">{translateText("Audio")}</option><option value="PRESENTATION">{translateText("Presentation")}</option><option value="ASSIGNMENT">{translateText("Assignment")}</option><option value="QUIZ">{translateText("Quiz")}</option><option value="OTHER">{translateText("Other")}</option></select></label>
                <label className="field"><span>{translateText("Lesson number")}</span><input name="lessonNumber" type="number" min="1" max="100" /></label>
                <label className="field"><span>{translateText("YouTube / resource URL")}</span><input name="onlineUrl" type="url" maxLength={2048} placeholder={translateText("https://youtu.be/...")} /></label>
                <label className="field wide"><span>{translateText("Or upload a file (max 100 MB)")}</span><input name="file" type="file" accept="video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,image/*" /></label>
                <button className="mgr-btn-primary" type="submit" disabled={savingMaterial}>{savingMaterial ? translateText("Adding…") : translateText("Add material")}</button>
              </div>
              <small>{translateText("Choose Video and add a YouTube URL to attach a video. Uploaded materials publish directly to this member course.")}</small>
            </form>}
          </div>
        </div>
      )}
      {rejectionTarget && (
        <div className="mgr-modal-backdrop" onClick={() => setRejectionTarget(null)}>
          <form className="mgr-modal" role="dialog" aria-modal="true" aria-labelledby="rejection-title" onClick={event => event.stopPropagation()} onSubmit={submitRejection}>
            <button type="button" className="mgr-modal-close" onClick={() => setRejectionTarget(null)} aria-label={translateText("Close")}>{translateText("×")}</button>
            <h2 id="rejection-title">{translateText("Reject ")}{rejectionTarget.kind}</h2>
            <p className="mgr-muted">{translateText("Give the instructor a reason for rejecting “")}{rejectionTarget.title}{translateText("”. They can use this feedback to revise and resubmit.")}</p>
            <label className="field" style={{ display: 'block', marginTop: 16 }}>
              <span>{translateText("Rejection reason *")}</span>
              <textarea required minLength={3} maxLength={3000} rows={5} value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder={translateText("Explain what should be changed…")} />
            </label>
            <div className="mgr-action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="mgr-btn-outline" onClick={() => setRejectionTarget(null)}>{translateText("Cancel")}</button>
              <button type="submit" className="mgr-btn-danger" disabled={submittingRejection || rejectionReason.trim().length < 3}>{submittingRejection ? translateText("Sending…") : translateText("Reject and send reason")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
