import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageFromError } from '../../api';
import { optionalPersonName, requiredPersonName } from '../../validation/personName';

/* ─── types ──────────────────────────────────────────────────────────────── */
type StaffPerson = {
  id: string; firstName: string; middleName?: string; lastName: string;
  phone?: string; photoUrl?: string;
};
type StaffUser = {
  id: string; username: string; email: string; role: string;
  isActive: boolean; mustChangePassword: boolean; createdAt: string;
  person?: StaffPerson | null;
};
type CreatedCredential = { email: string; username: string; role: string; temporaryPassword: string; name: string };
type AuditEvent = {
  id: string; action: string; entity: string; entityId: string; createdAt: string;
  metadata?: Record<string, unknown>;
  actor: { email: string; role: string; person?: { firstName: string; lastName: string } | null };
};

/* ─── schema ─────────────────────────────────────────────────────────────── */
const createSchema = z.object({
  firstName:          requiredPersonName,
  middleName:         optionalPersonName.optional(),
  lastName:           requiredPersonName,
  email:              z.string().email('Enter a valid email'),
  phone:              z.string().trim().min(7, 'Enter a phone number').max(40, 'Phone number is too long').regex(/^\+?[\d\s().-]{7,20}$/, 'Enter a valid phone number'),
  username:           z.string().trim().min(3, 'Username min 3 chars').max(60, 'Username is too long').optional().or(z.literal('')),
  role:               z.enum(['CHURCH_MANAGER', 'CLASS_INSTRUCTOR']),
  password:           z.string().min(12, 'Min 12 characters').max(100, 'Password is too long').regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include uppercase, lowercase, and a number'),
  confirmPassword:    z.string(),
  isActive:           z.boolean(),
  mustChangePassword: z.boolean(),
}).refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

const editSchema = z.object({
  email:      z.string().trim().email('Enter a valid email').max(254, 'Email address is too long'),
  firstName:  requiredPersonName.optional(),
  middleName: optionalPersonName.optional(),
  lastName:   requiredPersonName.optional(),
  phone:      z.string().trim().min(7, 'Enter a phone number').max(40, 'Phone number is too long').regex(/^\+?[\d\s().-]{7,20}$/, 'Enter a valid phone number'),
  role:       z.enum(['CHURCH_MANAGER', 'CLASS_INSTRUCTOR']).optional(),
  isActive:   z.boolean().optional(),
});

const resetSchema = z.object({ newPassword: z.string().min(12, 'Min 12 characters').max(100, 'Password is too long').regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Include uppercase, lowercase, and a number'), confirmReset: z.string() })
  .refine(d => d.newPassword === d.confirmReset, { message: 'Passwords do not match', path: ['confirmReset'] });

type CreateValues = {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  username?: string;
  role: 'CHURCH_MANAGER' | 'CLASS_INSTRUCTOR';
  password: string;
  confirmPassword: string;
  isActive: boolean;
  mustChangePassword: boolean;
};
type EditValues   = z.infer<typeof editSchema>;
type ResetValues  = z.infer<typeof resetSchema>;

/* ─── helpers ────────────────────────────────────────────────────────────── */
const ROLE_LABEL: Record<string, string> = {
  CHURCH_MANAGER:   'Church Manager',
  CLASS_INSTRUCTOR: 'Class / Course Instructor',
};
const ROLE_COLOR: Record<string, string> = {
  CHURCH_MANAGER: 'blue', CLASS_INSTRUCTOR: 'purple',
};
const ACTION_LABEL: Record<string, string> = {
  CREATE_ACCOUNT: 'Created account',
  EDIT_ACCOUNT:   'Edited account',
  RESET_PASSWORD: 'Reset password',
  DELETE_ACCOUNT: 'Deleted account',
};
function fullName(p?: StaffPerson | null) {
  if (!p) return '—';
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }

/* ════════════════════════════════════════════════════════════════════════════ */
export function AdminAccountsPage() {
  const [users,      setUsers]      = useState<StaffUser[]>([]);
  const [audit,      setAudit]      = useState<AuditEvent[]>([]);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [tab,        setTab]        = useState<'accounts' | 'audit'>('accounts');
  const [creating,   setCreating]   = useState<'CHURCH_MANAGER' | 'CLASS_INSTRUCTOR' | null>(null);
  const [editing,    setEditing]    = useState<StaffUser | null>(null);
  const [resetting,  setResetting]  = useState<StaffUser | null>(null);
  const [credential, setCredential] = useState<CreatedCredential | null>(null);
  const [viewUser,   setViewUser]   = useState<StaffUser | null>(null);

  const createForm = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { firstName: '', middleName: '', lastName: '', email: '', phone: '', username: '', role: 'CHURCH_MANAGER', password: '', confirmPassword: '', isActive: true, mustChangePassword: true }, mode: 'onBlur' });
  const editForm   = useForm<EditValues>({ resolver: zodResolver(editSchema), mode: 'onBlur' });
  const resetForm  = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { newPassword: '', confirmReset: '' }, mode: 'onBlur' });

  const load = async () => {
    try {
      const [{ data: u }, { data: a }] = await Promise.all([api.get('/auth/users'), api.get('/auth/audit')]);
      setUsers(u.users ?? []);
      setAudit(a.events ?? []);
    } catch (e) { setError(messageFromError(e)); }
  };

  useEffect(() => { void load(); }, []);

  /* Create */
  const submitCreate = createForm.handleSubmit(async values => {
    setError(''); setSuccess('');
    try {
      const { confirmPassword, ...payload } = values;
      const { data } = await api.post('/auth/users', { ...payload, username: payload.username || undefined });
      const created = data.user as StaffUser;
      setCredential({
        email: created.email,
        username: created.username,
        role: created.role,
        temporaryPassword: data.temporaryPassword,
        name: fullName(created.person),
      });
      createForm.reset();
      setCreating(null);
      await load();
    } catch (e) { setError(messageFromError(e)); }
  });

  /* Edit */
  const openEdit = (u: StaffUser) => {
    setEditing(u);
    editForm.reset({ email: u.email, firstName: u.person?.firstName, middleName: u.person?.middleName, lastName: u.person?.lastName, phone: u.person?.phone ?? '', role: u.role as EditValues['role'], isActive: u.isActive });
  };
  const submitEdit = editForm.handleSubmit(async values => {
    if (!editing) return;
    setError(''); setSuccess('');
    try {
      await api.patch(`/auth/users/${editing.id}`, values);
      setSuccess('Account updated.');
      setEditing(null);
      await load();
    } catch (e) { setError(messageFromError(e)); }
  });

  /* Reset password */
  const submitReset = resetForm.handleSubmit(async values => {
    if (!resetting) return;
    setError(''); setSuccess('');
    try {
      const { data } = await api.post(`/auth/users/${resetting.id}/reset-password`, { newPassword: values.newPassword });
      setCredential({ email: resetting.email, username: resetting.username, role: resetting.role, temporaryPassword: data.temporaryPassword, name: fullName(resetting.person) });
      resetForm.reset();
      setResetting(null);
      await load();
    } catch (e) { setError(messageFromError(e)); }
  });

  /* Toggle active */
  const toggleActive = async (u: StaffUser) => {
    setError(''); setSuccess('');
    try {
      await api.patch(`/auth/users/${u.id}`, { isActive: !u.isActive });
      setSuccess(`Account ${u.isActive ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (e) { setError(messageFromError(e)); }
  };

  const deleteAccount = async (u: StaffUser) => {
    const name = fullName(u.person);
    if (!window.confirm(`Permanently delete the managed account for ${name} (${u.email})? Accounts with records that must be preserved cannot be deleted; deactivate those accounts instead.`)) return;
    setError(''); setSuccess('');
    try {
      await api.delete(`/auth/users/${u.id}`);
      setSuccess(`Deleted the account for ${name}.`);
      setViewUser(current => current?.id === u.id ? null : current);
      await load();
    } catch (e) { setError(messageFromError(e)); }
  };

  /* Group by role */
  const byRole: Record<string, StaffUser[]> = { CHURCH_MANAGER: [], CLASS_INSTRUCTOR: [] };
  for (const u of users) byRole[u.role]?.push(u);

  /* ── render ── */
  return (
    <div className="mgr-page">
      <div className="mgr-page-header">
        <div>
          <h1>{translateText("🔑 Account Management")}</h1>
          <p className="mgr-muted">{translateText("Only the Administrator can create and manage Church Manager and Instructor accounts.")}</p>
        </div>
        <div className="mgr-action-row">
          <button className="mgr-btn-primary" onClick={() => setCreating('CHURCH_MANAGER')}>{translateText("＋ Create Church Manager")}</button>
          <button className="mgr-btn-outline" onClick={() => setCreating('CLASS_INSTRUCTOR')}>{translateText("＋ Create Instructor")}</button>
        </div>
      </div>

      {error   && <div className="mgr-error">{error}</div>}
      {success && <div className="mgr-success">{success}</div>}

      {/* ── Tab bar ── */}
      <div className="mgr-filter-bar" style={{ marginBottom: 18 }}>
        <button className={`mgr-filter-chip${tab === 'accounts' ? ' active' : ''}`} onClick={() => setTab('accounts')}>
          {translateText("Managed Accounts ")}<span>{users.length}</span>
        </button>
        <button className={`mgr-filter-chip${tab === 'audit' ? ' active' : ''}`} onClick={() => setTab('audit')}>
          {translateText("Audit Log ")}<span>{audit.length}</span>
        </button>
      </div>

      {/* ════ ACCOUNTS TAB ════ */}
      {tab === 'accounts' && (
        <>
          {/* Create form */}
          {creating && (
            <div className="mgr-panel admin-create-panel">
              <div className="admin-create-header">
                <h3>{translateText("New ")}{ROLE_LABEL[creating]} {translateText("Account")}</h3>
                <button className="mgr-modal-close" style={{ position: 'static' }} onClick={() => { setCreating(null); createForm.reset(); }}>{translateText("×")}</button>
              </div>
              <p className="mgr-muted" style={{ marginBottom: 16 }}>
                {translateText("After creation, a temporary password will be shown once. Share it securely with the person.\n              ")}</p>
              <form onSubmit={submitCreate} className="admin-form-grid">
                <label className="mgr-field">
                  <span>{translateText("First name *")}</span>
                  <input maxLength={80} required aria-invalid={!!createForm.formState.errors.firstName} {...createForm.register('firstName')} />
                  {createForm.formState.errors.firstName && <small className="mgr-field-err">{createForm.formState.errors.firstName.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Middle name")}</span>
                  <input maxLength={80} aria-invalid={!!createForm.formState.errors.middleName} {...createForm.register('middleName')} />
                  {createForm.formState.errors.middleName && <small className="mgr-field-err">{createForm.formState.errors.middleName.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Last name *")}</span>
                  <input maxLength={80} required aria-invalid={!!createForm.formState.errors.lastName} {...createForm.register('lastName')} />
                  {createForm.formState.errors.lastName && <small className="mgr-field-err">{createForm.formState.errors.lastName.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Email (used to log in) *")}</span>
                  <input type="email" autoComplete="email" maxLength={254} required aria-invalid={!!createForm.formState.errors.email} {...createForm.register('email')} />
                  {createForm.formState.errors.email && <small className="mgr-field-err">{createForm.formState.errors.email.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Phone")}</span>
                  <input type="tel" autoComplete="tel" maxLength={40} required aria-invalid={!!createForm.formState.errors.phone} {...createForm.register('phone')} />
                  {createForm.formState.errors.phone && <small className="mgr-field-err">{createForm.formState.errors.phone.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Username ")}<em>{translateText("(optional — defaults to email)")}</em></span>
                  <input maxLength={60} aria-invalid={!!createForm.formState.errors.username} {...createForm.register('username')} placeholder={translateText("Leave blank to use email")} />
                  {createForm.formState.errors.username && <small className="mgr-field-err">{createForm.formState.errors.username.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Role *")}</span>
                  <select {...createForm.register('role')}>
                    <option value="CHURCH_MANAGER">{translateText("Church Manager")}</option>
                    <option value="CLASS_INSTRUCTOR">{translateText("Class / Course Instructor")}</option>
                  </select>
                </label>
                <label className="mgr-field">
                  <span>{translateText("Account status")}</span>
                  <select {...createForm.register('isActive', { setValueAs: v => v === 'true' || v === true })}>
                    <option value="true">{translateText("Active")}</option>
                    <option value="false">{translateText("Inactive")}</option>
                  </select>
                </label>
                <label className="mgr-field">
                  <span>{translateText("Password * ")}<em>{translateText("(min 12 chars)")}</em></span>
                  <input type="password" autoComplete="new-password" maxLength={100} required aria-invalid={!!createForm.formState.errors.password} {...createForm.register('password')} />
                  {createForm.formState.errors.password && <small className="mgr-field-err">{createForm.formState.errors.password.message}</small>}
                </label>
                <label className="mgr-field">
                  <span>{translateText("Confirm password *")}</span>
                  <input type="password" autoComplete="new-password" maxLength={100} required aria-invalid={!!createForm.formState.errors.confirmPassword} {...createForm.register('confirmPassword')} />
                  {createForm.formState.errors.confirmPassword && <small className="mgr-field-err">{createForm.formState.errors.confirmPassword.message}</small>}
                </label>
                <label className="mgr-field admin-checkbox-field">
                  <input type="checkbox" {...createForm.register('mustChangePassword')} defaultChecked />
                  <span>{translateText("Require password change on first login ")}<em>{translateText("(recommended)")}</em></span>
                </label>
                <div className="mgr-form-actions admin-form-actions">
                  <button type="submit" className="mgr-btn-primary" disabled={createForm.formState.isSubmitting}>
                    {createForm.formState.isSubmitting ? translateText("Creating…") : `✓ Create ${ROLE_LABEL[creating]}`}
                  </button>
                  <button type="button" className="mgr-btn-outline" onClick={() => { setCreating(null); createForm.reset(); }}>{translateText("Cancel")}</button>
                </div>
              </form>
            </div>
          )}

          {/* Account tables grouped by role */}
          {Object.entries(ROLE_LABEL).map(([role, label]) => (
            <div key={role} className="mgr-panel" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <h3 style={{ margin: 0 }}>{label}</h3>
                <span className={`mgr-badge ${ROLE_COLOR[role]}`}>{byRole[role]?.length ?? 0}</span>
              </div>
              {!byRole[role]?.length ? (
                <p className="mgr-muted">{translateText("No ")}{label} {translateText("accounts yet. Use the button above to create one.")}</p>
              ) : (
                <div className="mgr-table-wrap">
                  <table className="mgr-table">
                    <thead>
                      <tr>
                        <th>{translateText("Name")}</th><th>{translateText("Email")}</th><th>{translateText("Username")}</th><th>{translateText("Phone")}</th>
                        <th>{translateText("Temp Password")}</th><th>{translateText("Status")}</th><th>{translateText("Created")}</th><th>{translateText("Actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byRole[role].map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="mgr-table-person">
                              <div className="mgr-avatar-sm">{(u.person?.firstName ?? u.email).slice(0, 1).toUpperCase()}</div>
                              <span>{fullName(u.person)}</span>
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td><code className="mgr-code">{u.username}</code></td>
                          <td>{u.person?.phone ?? '—'}</td>
                          <td>
                            {u.mustChangePassword
                              ? <span className="mgr-badge orange">{translateText("⚠ Must change")}</span>
                              : <span className="mgr-badge green">{translateText("✓ Set")}</span>}
                          </td>
                          <td><span className={`mgr-badge ${u.isActive ? 'green' : 'grey'}`}>{u.isActive ? translateText("Active") : translateText("Inactive")}</span></td>
                          <td>{fmtDate(u.createdAt)}</td>
                          <td>
                            <div className="mgr-action-row">
                              <button className="mgr-btn-sm" onClick={() => setViewUser(u)}>{translateText("View")}</button>
                              <button className="mgr-btn-sm" onClick={() => openEdit(u)}>{translateText("Edit")}</button>
                              <button className="mgr-btn-sm orange" onClick={() => { setResetting(u); resetForm.reset(); }}>{translateText("Reset Password")}</button>
                              <button className={`mgr-btn-sm ${u.isActive ? 'red' : 'green'}`} onClick={() => toggleActive(u)}>
                                {u.isActive ? translateText("Deactivate") : translateText("Activate")}
                              </button>
                              <button className="mgr-btn-sm red" onClick={() => void deleteAccount(u)}>{translateText("Delete")}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ════ AUDIT TAB ════ */}
      {tab === 'audit' && (
        <div className="mgr-panel">
          <h3 style={{ marginBottom: 14 }}>{translateText("Administrator Action Log")}</h3>
          {audit.length === 0
            ? <p className="mgr-muted">{translateText("No audit events recorded yet.")}</p>
            : (
              <div className="mgr-table-wrap">
                <table className="mgr-table">
                  <thead><tr><th>{translateText("Action")}</th><th>{translateText("Target")}</th><th>{translateText("Performed By")}</th><th>{translateText("Details")}</th><th>{translateText("Date")}</th></tr></thead>
                  <tbody>
                    {audit.map(ev => (
                      <tr key={ev.id}>
                        <td><span className="mgr-badge blue">{ACTION_LABEL[ev.action] ?? ev.action}</span></td>
                        <td><code className="mgr-code">{String(ev.metadata?.email ?? ev.entity)}</code></td>
                        <td>{ev.actor.person ? `${ev.actor.person.firstName} ${ev.actor.person.lastName}` : ev.actor.email}</td>
                        <td className="mgr-muted">
                          {ev.metadata?.changes
                            ? (ev.metadata.changes as string[]).join(', ')
                            : ev.metadata?.createdFor
                              ? `Account for ${String(ev.metadata.createdFor)}`
                              : translateText("—")}
                        </td>
                        <td>{fmtDate(ev.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ════ VIEW MODAL ════ */}
      {viewUser && (
        <div className="mgr-modal-backdrop" onClick={() => setViewUser(null)}>
          <div className="mgr-modal" onClick={e => e.stopPropagation()}>
            <button className="mgr-modal-close" onClick={() => setViewUser(null)}>{translateText("×")}</button>
            <p className="mgr-eyebrow">{ROLE_LABEL[viewUser.role] ?? viewUser.role}</p>
            <h2>{fullName(viewUser.person)}</h2>
            <div className="mgr-detail-grid">
              {[
                ['Email',            viewUser.email],
                ['Username',         viewUser.username],
                ['Phone',            viewUser.person?.phone ?? '—'],
                ['Role',             ROLE_LABEL[viewUser.role] ?? viewUser.role],
                ['Status',           viewUser.isActive ? 'Active' : 'Inactive'],
                ['Password status',  viewUser.mustChangePassword ? 'Must change on next login' : 'Permanent password set'],
                ['Created',          fmtDate(viewUser.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="mgr-detail-kv"><small>{k}</small><strong>{v}</strong></div>
              ))}
            </div>
            <div className="mgr-action-row" style={{ marginTop: 16 }}>
              <button className="mgr-btn-primary" onClick={() => { setViewUser(null); openEdit(viewUser); }}>{translateText("Edit Account")}</button>
              <button className="mgr-btn-outline" onClick={() => { setViewUser(null); setResetting(viewUser); resetForm.reset(); }}>{translateText("Reset Password")}</button>
              <button className="mgr-btn-sm red" onClick={() => void deleteAccount(viewUser)}>{translateText("Delete Account")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ EDIT MODAL ════ */}
      {editing && (
        <div className="mgr-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="mgr-modal" onClick={e => e.stopPropagation()}>
            <button className="mgr-modal-close" onClick={() => setEditing(null)}>{translateText("×")}</button>
            <p className="mgr-eyebrow">{translateText("EDIT ACCOUNT")}</p>
            <h2>{fullName(editing.person)}</h2>
            <form onSubmit={submitEdit} className="mgr-form-grid">
              <label className="mgr-field"><span>{translateText("Email *")}</span><input type="email" autoComplete="email" maxLength={254} required aria-invalid={!!editForm.formState.errors.email} {...editForm.register('email')} />{editForm.formState.errors.email && <small className="mgr-field-err">{editForm.formState.errors.email.message}</small>}</label>
              <label className="mgr-field"><span>{translateText("First name")}</span><input maxLength={80} aria-invalid={!!editForm.formState.errors.firstName} {...editForm.register('firstName')} />{editForm.formState.errors.firstName && <small className="mgr-field-err">{editForm.formState.errors.firstName.message}</small>}</label>
              <label className="mgr-field"><span>{translateText("Middle name")}</span><input maxLength={80} aria-invalid={!!editForm.formState.errors.middleName} {...editForm.register('middleName')} />{editForm.formState.errors.middleName && <small className="mgr-field-err">{editForm.formState.errors.middleName.message}</small>}</label>
              <label className="mgr-field"><span>{translateText("Last name")}</span><input maxLength={80} aria-invalid={!!editForm.formState.errors.lastName} {...editForm.register('lastName')} />{editForm.formState.errors.lastName && <small className="mgr-field-err">{editForm.formState.errors.lastName.message}</small>}</label>
              <label className="mgr-field"><span>{translateText("Phone *")}</span><input type="tel" maxLength={40} required aria-invalid={!!editForm.formState.errors.phone} {...editForm.register('phone')} />{editForm.formState.errors.phone && <small className="mgr-field-err">{editForm.formState.errors.phone.message}</small>}</label>
              <label className="mgr-field">
                <span>{translateText("Role")}</span>
                <select {...editForm.register('role')}>
                  <option value="CHURCH_MANAGER">{translateText("Church Manager")}</option>
                  <option value="CLASS_INSTRUCTOR">{translateText("Class / Course Instructor")}</option>
                </select>
              </label>
              <label className="mgr-field">
                <span>{translateText("Status")}</span>
                <select {...editForm.register('isActive', { setValueAs: v => v === 'true' || v === true })}>
                  <option value="true">{translateText("Active")}</option>
                  <option value="false">{translateText("Inactive")}</option>
                </select>
              </label>
              <div className="mgr-form-actions">
                <button type="submit" className="mgr-btn-primary" disabled={editForm.formState.isSubmitting}>{translateText("Save Changes")}</button>
                <button type="button" className="mgr-btn-outline" onClick={() => setEditing(null)}>{translateText("Cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════ RESET PASSWORD MODAL ════ */}
      {resetting && (
        <div className="mgr-modal-backdrop" onClick={() => setResetting(null)}>
          <div className="mgr-modal" onClick={e => e.stopPropagation()}>
            <button className="mgr-modal-close" onClick={() => setResetting(null)}>{translateText("×")}</button>
            <p className="mgr-eyebrow">{translateText("RESET PASSWORD")}</p>
            <h2>{fullName(resetting.person)}</h2>
            <p className="mgr-muted">{resetting.email}</p>
            <div className="fpc-alert" style={{ margin: '14px 0' }}>
              <span>{translateText("⚠")}</span>
              <div><strong>{translateText("The user will be required to change this password on their next login.")}</strong></div>
            </div>
            <form onSubmit={submitReset} className="mgr-form-stack">
              <label className="mgr-field">
                <span>{translateText("New temporary password * (min 12 chars)")}</span>
                <input type="password" autoComplete="new-password" maxLength={100} required aria-invalid={!!resetForm.formState.errors.newPassword} {...resetForm.register('newPassword')} />
                {resetForm.formState.errors.newPassword && <small className="mgr-field-err">{resetForm.formState.errors.newPassword.message}</small>}
              </label>
              <label className="mgr-field">
                <span>{translateText("Confirm new password *")}</span>
                <input type="password" autoComplete="new-password" maxLength={100} required aria-invalid={!!resetForm.formState.errors.confirmReset} {...resetForm.register('confirmReset')} />
                {resetForm.formState.errors.confirmReset && <small className="mgr-field-err">{resetForm.formState.errors.confirmReset.message}</small>}
              </label>
              <div className="mgr-form-actions">
                <button type="submit" className="mgr-btn-primary" disabled={resetForm.formState.isSubmitting}>{translateText("Reset Password")}</button>
                <button type="button" className="mgr-btn-outline" onClick={() => setResetting(null)}>{translateText("Cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════ CREDENTIAL REVEAL DIALOG ════ */}
      {credential && (
        <div className="mgr-modal-backdrop">
          <div className="admin-credential-dialog">
            <div className="admin-cred-success-icon">{translateText("✓")}</div>
            <h2>{translateText("Account Created Successfully")}</h2>
            <p>{translateText("Share these credentials securely with ")}<strong>{credential.name}</strong>{translateText(".")}</p>
            <p className="mgr-muted">{translateText("This password will ")}<strong>{translateText("not")}</strong> {translateText("be shown again after you close this dialog.")}</p>

            <div className="admin-cred-box-reveal">
              <div className="admin-cred-row">
                <span>{translateText("Role")}</span>
                <strong>{ROLE_LABEL[credential.role] ?? credential.role}</strong>
              </div>
              <div className="admin-cred-row">
                <span>{translateText("Email / Login")}</span>
                <strong>{credential.email}</strong>
              </div>
              <div className="admin-cred-row">
                <span>{translateText("Username")}</span>
                <strong>{credential.username}</strong>
              </div>
              <div className="admin-cred-row highlight">
                <span>{translateText("Temporary Password")}</span>
                <strong className="admin-cred-password">{credential.temporaryPassword}</strong>
              </div>
            </div>

            <div className="admin-cred-instructions">
              <p>{translateText("📋 Instructions for ")}<strong>{credential.name}</strong>{translateText(":")}</p>
              <ol>
                <li>{translateText("Go to the church management login page")}</li>
                <li>{translateText("Enter the email and temporary password above")}</li>
                <li>{translateText("You will be prompted to set a new permanent password")}</li>
              </ol>
            </div>

            <div className="admin-cred-actions">
              <button
                className="mgr-btn-primary"
                onClick={() => {
                  navigator.clipboard?.writeText(
                    `Role: ${ROLE_LABEL[credential.role]}\nEmail: ${credential.email}\nUsername: ${credential.username}\nTemporary Password: ${credential.temporaryPassword}\n\nLog in at: http://localhost:5173/login\nYou will be required to set a new password on first login.`,
                  ).then(() => alert('Credentials copied to clipboard.'));
                }}
              >
                {translateText("📋 Copy Credentials\n              ")}</button>
              <button className="mgr-btn-outline" onClick={() => window.print()}>{translateText("🖨 Print")}</button>
              <button className="mgr-btn-danger" onClick={() => setCredential(null)}>{translateText("✓ Done — Close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
