import { translateText } from '../../i18n/context';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageFromError } from '../../api';
import { optionalPersonName, requiredPersonName } from '../../validation/personName';

type Person = {
  firstName: string; middleName?: string; lastName: string; email?: string; phone?: string;
  officeTelephone?: string; homeTelephone?: string; occupation?: string; gender?: string;
  dateOfBirth?: string; placeOfBirth?: string; maritalStatus?: string; nationality?: string; photoUrl?: string;
};
type Profile = { id: string; username: string; email: string; role: string; signatureData?: string | null; person?: Person | null };
const profileSchema = z.object({
  firstName: requiredPersonName,
  middleName: optionalPersonName.optional(),
  lastName: requiredPersonName,
  occupation: z.string().trim().max(100, 'Occupation must be 100 characters or fewer'),
});

export function ManagerProfilePage() {
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [error, setError]         = useState('');
  const [saved, setSaved]         = useState('');
  const [sigText, setSigText]     = useState('');
  const [sigPreview, setSigPreview] = useState('');

  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { firstName: '', middleName: '', lastName: '', occupation: '' }, mode: 'onBlur' });

  useEffect(() => {
    api.get('/manager/profile')
      .then(({ data }) => {
        setProfile(data.user);
        setSigText(data.user.signatureData ?? '');
        setSigPreview(data.user.signatureData ?? '');
        if (data.user.person) {
          form.reset({
            firstName: data.user.person.firstName ?? '', middleName: data.user.person.middleName ?? '',
            lastName: data.user.person.lastName ?? '',
            occupation: data.user.person.occupation ?? '',
          });
        }
      })
      .catch(e => setError(messageFromError(e)));
  }, []);

  const saveProfile = form.handleSubmit(async values => {
    try {
      setError(''); setSaved('');
      const { data } = await api.patch('/manager/profile', values);
      setProfile(data.user);
      setSaved('Profile saved.');
    } catch (e) { setError(messageFromError(e)); }
  });

  const saveSignature = async () => {
    try {
      setError(''); setSaved('');
      await api.patch('/manager/profile', { signatureData: sigText || null });
      setSigPreview(sigText);
      setSaved('Signature saved. It will be automatically added to all future certificates.');
    } catch (e) { setError(messageFromError(e)); }
  };

  if (!profile) return <div className="mgr-page"><div className="mgr-loading-text">{translateText("Loading profile…")}</div></div>;

  const isAdmin = profile.role === 'ADMINISTRATOR';
  const displayName = profile.person
    ? [profile.person.firstName, profile.person.middleName, profile.person.lastName].filter(Boolean).join(' ')
    : isAdmin ? 'Admin' : profile.username;

  return (
    <div className="mgr-page">
      <div className="mgr-page-header">
        <div><h1>{translateText("My Profile")}</h1><p className="mgr-muted">{translateText("Manage your ")}{isAdmin ? translateText("Administrator") : translateText("Church Manager")} {translateText("profile")}{isAdmin ? translateText(".") : translateText(" and certificate signature.")}</p></div>
      </div>

      {error && <div className="mgr-error">{error}</div>}
      {saved && <div className="mgr-success">{saved}</div>}

      {/* Profile header */}
      <div className="mgr-profile-head">
        <div className="mgr-avatar-lg">{profile.person?.photoUrl
          ? <img src={profile.person.photoUrl} alt={`${displayName} profile`} />
          : (profile.person?.firstName ?? profile.username).slice(0, 1).toUpperCase()}</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{displayName}</h2>
            <span className="mgr-badge green">{profile.role === 'ADMINISTRATOR' ? translateText("Administrator") : translateText("Church Manager")}</span>
          </div>
          <p className="mgr-muted">{profile.email}</p>
        </div>
      </div>

      <div className="mgr-two-col">
        {/* Personal info */}
        <div className="mgr-panel">
          <h3>{translateText("Personal Information")}</h3>
          <div className="mgr-detail-grid">
            {[
              ['Full Name', displayName],
              ['Gender', profile.person?.gender], ['Date of Birth', profile.person?.dateOfBirth ? new Date(profile.person.dateOfBirth).toLocaleDateString() : ''],
              ['Place of Birth', profile.person?.placeOfBirth], ['Marital Status', profile.person?.maritalStatus],
              ['Nationality', profile.person?.nationality], ['Email', profile.email],
              ['Office Telephone', profile.person?.officeTelephone], ['Home Telephone', profile.person?.homeTelephone],
            ].filter(([, value]) => value).map(([label, value]) => <div className="mgr-detail-kv" key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}
          </div>
          <h3 style={{ marginTop: 22 }}>{translateText("Contact & Work")}</h3>
          {!isAdmin && <p className="mgr-muted">{translateText("Email and phone are managed by an Administrator.")}</p>}
          <form onSubmit={saveProfile} className="mgr-form-stack">
            <label className="mgr-field"><span>{translateText("First Name *")}</span><input maxLength={80} required aria-invalid={!!form.formState.errors.firstName} {...form.register('firstName')} />{form.formState.errors.firstName && <small className="mgr-field-err" role="alert">{form.formState.errors.firstName.message}</small>}</label>
            <label className="mgr-field"><span>{translateText("Middle Name")}</span><input maxLength={80} aria-invalid={!!form.formState.errors.middleName} {...form.register('middleName')} />{form.formState.errors.middleName && <small className="mgr-field-err" role="alert">{form.formState.errors.middleName.message}</small>}</label>
            <label className="mgr-field"><span>{translateText("Last Name *")}</span><input maxLength={80} required aria-invalid={!!form.formState.errors.lastName} {...form.register('lastName')} />{form.formState.errors.lastName && <small className="mgr-field-err" role="alert">{form.formState.errors.lastName.message}</small>}</label>
            <label className="mgr-field"><span>{translateText("Phone")}</span><input type="tel" value={profile.person?.phone ?? ''} disabled /></label>
            <label className="mgr-field"><span>{translateText("Occupation / Title")}</span><input maxLength={100} aria-invalid={!!form.formState.errors.occupation} {...form.register('occupation')} />{form.formState.errors.occupation && <small className="mgr-field-err" role="alert">{form.formState.errors.occupation.message}</small>}</label>
            <button type="submit" className="mgr-btn-primary" disabled={form.formState.isSubmitting}>{translateText("Save Profile")}</button>
          </form>
        </div>

        {/* Signature */}
        {!isAdmin && <div className="mgr-panel">
          <h3>{translateText("Certificate Signature")}</h3>
          <p className="mgr-muted" style={{ fontSize: 11, marginBottom: 12 }}>
            {translateText("Your stored signature is automatically added to every certificate you approve. You do not need to sign each certificate manually.\n          ")}</p>

          {/* Preview */}
          {sigPreview && (
            <div className="mgr-sig-preview">
              {sigPreview.startsWith('data:image/')
                ? <img src={sigPreview} alt={translateText("Stored signature")} />
                : <p className="mgr-sig-text">{sigPreview}</p>}
              <small>{translateText("Current stored signature")}</small>
            </div>
          )}

          <label className="mgr-field">
            <span>{translateText("Signature (text, or paste a data: URL of your image)")}</span>
            <textarea
              rows={4}
              maxLength={100_000}
              value={sigText}
              onChange={e => setSigText(e.target.value)}
              placeholder={translateText("Enter your name as a digital signature, or paste data:image/png;base64,...")}
            />
          </label>
          <div className="mgr-action-row">
            <button className="mgr-btn-primary" onClick={saveSignature}>{translateText("Save Signature")}</button>
            {sigText && (
              <button className="mgr-btn-outline" onClick={() => { setSigText(''); setSigPreview(''); }}>{translateText("Clear")}</button>
            )}
          </div>
        </div>}
      </div>

      {/* Certificate preview with stored sig */}
      {!isAdmin && <div className="mgr-panel">
        <h3>{translateText("Certificate Preview")}</h3>
        <p className="mgr-muted" style={{ fontSize: 11 }}>{translateText("This is how certificates you approve will appear with your stored signature.")}</p>
        <div className="mgr-cert-mini-preview">
          <div className="mgr-cert-mini-inner">
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 28, color: '#123b68' }}>{translateText("✝")}</div>
              <p style={{ fontWeight: 800, color: '#123b68', margin: '4px 0', fontSize: 13 }}>{translateText("GRACE EVANGELICAL CHURCH")}</p>
              <p style={{ fontSize: 10, color: '#718096', margin: 0 }}>{translateText("CERTIFICATE OF COURSE COMPLETION")}</p>
            </div>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#444', margin: '8px 0 4px' }}>{translateText("This certifies that")}</p>
            <p style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#123b68', margin: '4px 0 8px' }}>{translateText("[Recipient Name]")}</p>
            <p style={{ textAlign: 'center', fontSize: 10, color: '#666' }}>{translateText("has successfully completed the required church process.")}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e0e9f4' }}>
              <div>
                {sigPreview
                  ? sigPreview.startsWith('data:image/')
                    ? <img src={sigPreview} alt={translateText("sig")} style={{ maxHeight: 36 }} />
                    : <p style={{ fontStyle: 'italic', fontSize: 16, margin: '0 0 2px', color: '#123b68' }}>{sigPreview}</p>
                  : <p style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>{translateText("[Signature will appear here]")}</p>}
                <div style={{ borderTop: '1px solid #123b68', paddingTop: 4, marginTop: 2 }}>
                  <strong style={{ fontSize: 11, color: '#123b68' }}>{displayName}</strong>
                  <div style={{ fontSize: 9, color: '#718096' }}>{translateText("Church Manager")}</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, background: '#f0f4f8', border: '1px solid #d0dce9', display: 'grid', placeItems: 'center', fontSize: 9, color: '#aaa' }}>{translateText("QR")}</div>
                <div style={{ fontSize: 8, color: '#aaa', marginTop: 2 }}>{translateText("Scan to verify")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
