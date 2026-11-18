import { translateText } from '../i18n/context';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { api, messageFromError } from '../api';
import { useAuth } from '../state';
import { useRef } from 'react';
import { PERSON_NAME_ERROR, isValidPersonName } from '../validation/personName';

type ProfileValues = {
  firstName: string; middleName: string; lastName: string; phone: string; officeTelephone: string; homeTelephone: string; gender: string;
  maritalStatus: string; occupation: string; makingALiving: string; nationality: string; placeOfBirth: string;
  dateOfBirth: string; acceptedJesus: string; denomination: string; memberOfThisChurch: string;
  yearReceivedLord: string; yearBaptized: string; previousChurchName: string;
  sharesHomeAssociation: string; sharesWhoseHouse: string; unionLeaderName: string; currentService: string;
  pastService: string; serviceLoad: string; familySize: string; numberOfChildren: string; childrenKnowLord: string; poorNotKnowLord: string;
  unemployedInHousehold: string;
};

export function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileValues>({ defaultValues: {
    firstName: '', middleName: '', lastName: '', phone: '', officeTelephone: '', homeTelephone: '', gender: '',
    maritalStatus: '', occupation: '', makingALiving: '', nationality: '',
    placeOfBirth: '', dateOfBirth: '', acceptedJesus: '', denomination: '', memberOfThisChurch: '', yearReceivedLord: '', yearBaptized: '',
    previousChurchName: '', sharesHomeAssociation: '',
    sharesWhoseHouse: '', unionLeaderName: '', currentService: '', pastService: '', serviceLoad: '',
    familySize: '', numberOfChildren: '', childrenKnowLord: '', poorNotKnowLord: '', unemployedInHousehold: '',
  }, mode: 'onBlur' });

  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => {
        setProfile(data.user);
        if (data.user.person) {
          const person = data.user.person;
          form.reset(Object.fromEntries(Object.keys(form.getValues()).map(key => [
            key, key === 'dateOfBirth' ? person.dateOfBirth?.slice(0, 10) ?? '' : person[key] ?? '',
          ])) as ProfileValues);
        }
      })
      .catch(e => setError(messageFromError(e)));
  }, []);

  const submit = form.handleSubmit(async values => {
    try {
      setError(''); setSaved(false);
      if (user?.role === 'CHURCH_MANAGER' || user?.role === 'ADMINISTRATOR')
        await api.patch('/manager/profile', values);
      else if (user?.role === 'CLASS_INSTRUCTOR') {
        const { firstName, middleName, lastName, occupation } = values;
        await api.patch('/instructor/profile', { firstName, middleName, lastName, occupation });
      }
      else
        await api.patch('/portal/profile', { ...values, dateOfBirth: values.dateOfBirth || undefined });
      const { data } = await api.get('/auth/me');
      setProfile(data.user);
      setSaved(true);
    } catch (e) { setError(messageFromError(e)); }
  });

  const displayName = profile?.person
    ? `${profile.person.firstName} ${profile.person.lastName}`
    : profile?.role === 'ADMINISTRATOR' ? 'Admin' : profile?.username ?? '';

  const isInstructor = user?.role === 'CLASS_INSTRUCTOR';
  const isPortalUser = user?.role === 'WORSHIPER' || user?.role === 'MEMBER';
  const isMember = user?.role === 'MEMBER';
  const profileDenomination = form.watch('denomination');
  const profileChurchMember = form.watch('memberOfThisChurch');
  const profileSharesHome = form.watch('sharesHomeAssociation');
  const profileMaritalStatus = form.watch('maritalStatus');
  const showSpiritualJourney = !(profileDenomination === 'Protestant' && profileChurchMember === 'Yes');

  useEffect(() => {
    if (profileDenomination !== 'Protestant') form.setValue('memberOfThisChurch', '');
    if (profileDenomination === 'Protestant' && profileChurchMember === 'Yes') {
      form.setValue('yearReceivedLord', '');
      form.setValue('yearBaptized', '');
      form.setValue('previousChurchName', '');
      form.setValue('sharesHomeAssociation', '');
      form.setValue('sharesWhoseHouse', '');
      form.setValue('unionLeaderName', '');
      form.setValue('currentService', '');
      form.setValue('pastService', '');
      form.setValue('serviceLoad', '');
    }
  }, [profileDenomination, profileChurchMember]);

  useEffect(() => {
    if (profileSharesHome !== 'Yes') {
      form.setValue('sharesWhoseHouse', '');
      form.setValue('unionLeaderName', '');
      form.setValue('currentService', '');
      form.setValue('pastService', '');
      form.setValue('serviceLoad', '');
    }
  }, [profileSharesHome]);

  useEffect(() => {
    if (profileMaritalStatus !== 'Married') {
      form.setValue('familySize', '');
      form.setValue('numberOfChildren', '');
      form.setValue('childrenKnowLord', '');
      form.setValue('poorNotKnowLord', '');
      form.setValue('unemployedInHousehold', '');
    }
  }, [profileMaritalStatus]);

  const fieldRules = (name: keyof ProfileValues) => ({
    validate: (value: string) => {
      const max: Partial<Record<keyof ProfileValues, number>> = { firstName: 80, middleName: 80, lastName: 80, phone: 40, officeTelephone: 40, homeTelephone: 40, occupation: 100, nationality: 80, placeOfBirth: 100, previousChurchName: 200, sharesWhoseHouse: 200, unionLeaderName: 200, currentService: 1000, pastService: 1000, serviceLoad: 1000 };
      if (max[name] && value.length > max[name]!) return `Use ${max[name]} characters or fewer.`;
      if (['firstName', 'lastName'].includes(name) && !value.trim()) return 'Enter a name.';
      if (['firstName', 'middleName', 'lastName', 'sharesWhoseHouse', 'unionLeaderName'].includes(name) && value.trim() && !isValidPersonName(value)) return PERSON_NAME_ERROR;
      if (['phone', 'officeTelephone', 'homeTelephone'].includes(name) && value && !/^\+?[\d\s().-]{7,40}$/.test(value)) return 'Enter a valid phone number.';
      if (['yearReceivedLord', 'yearBaptized'].includes(name) && value && (!/^\d{4}$/.test(value) || Number(value) < 1900 || Number(value) > new Date().getFullYear())) return 'Enter a year between 1900 and this year.';
      if (['familySize', 'numberOfChildren', 'childrenKnowLord', 'poorNotKnowLord', 'unemployedInHousehold'].includes(name) && value && (!/^\d+$/.test(value) || Number(value) > 999)) return 'Enter a whole number from 0 to 999.';
      if (name === 'dateOfBirth' && value && new Date(value) > new Date()) return 'Date of birth cannot be in the future.';
      return true;
    },
  });
  const profileField = (name: keyof ProfileValues, label: string, type = 'text', options?: string[]) => (
    <label className="field" key={name}>
      <span>{label}</span>
      {options ? <select {...form.register(name, fieldRules(name))}><option value="">{translateText("Select…")}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
        : type === 'textarea' ? <textarea rows={3} maxLength={1000} {...form.register(name, fieldRules(name))} />
          : <input type={type} maxLength={['yearReceivedLord','yearBaptized'].includes(name) ? 4 : undefined} max={type === 'date' ? new Date().toISOString().slice(0,10) : undefined} {...form.register(name, fieldRules(name))} />}
      {form.formState.errors[name] && <small className="field-error" role="alert">{form.formState.errors[name]?.message}</small>}
    </label>
  );

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP photo that is 5 MB or smaller.');
      return;
    }
    const formData = new FormData();
    formData.append('photo', file);
    try {
      setError(''); setPhotoBusy(true);
      const { data } = await api.post(isInstructor ? '/instructor/profile/photo' : '/portal/profile/photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setProfile((current: any) => current ? { ...current, person: data.person } : current);
      setSaved(true);
    } catch (e) { setError(messageFromError(e)); }
    finally { setPhotoBusy(false); if (photoInput.current) photoInput.current.value = ''; }
  };

  return (
    <div className="content-wrap">
      <div className="page-title">
        <p className="eyebrow">{translateText("CHURCH MANAGEMENT SYSTEM")}</p>
        <h1>{translateText("My Profile")}</h1>
        <p>{translateText("Manage your church profile information.")}</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {profile && (
        <div>
          {/* Profile header */}
          <div className="profile-page-hero">
            <div className="profile-photo-avatar">
              {profile.person?.photoUrl ? <img src={profile.person.photoUrl} alt={`${displayName} profile`} /> : (profile.person?.firstName ?? profile.username ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>{displayName || profile.email}</h2>
              <span style={{ background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.9)', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,.2)' }}>
                {profile.role}
              </span>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', margin: '6px 0 0' }}>{profile.email}</p>
            </div>
            {isInstructor && <button type="button" className="btn-primary" onClick={() => document.getElementById('profile-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{translateText("Edit Profile")}</button>}
          </div>

          {/* Edit form */}
          <div className="profile-page-editor" id="profile-editor">
            <h2>{translateText("Edit Profile")}</h2>
            {(isPortalUser || isInstructor) && <div className="profile-photo-edit">
              <div><strong>{translateText("Profile photo")}</strong><small>{translateText("JPG, PNG, or WebP · up to 5 MB")}</small></div>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void uploadPhoto(e.target.files?.[0])} />
              <button type="button" className="btn-outline" disabled={photoBusy} onClick={() => photoInput.current?.click()}>{photoBusy ? translateText("Uploading…") : translateText("Change photo")}</button>
            </div>}
            <form onSubmit={submit}>
              {isPortalUser ? <>
                <ProfileSection title={translateText("Personal Information")} fields={[
                  profileField('firstName', 'First Name'), profileField('middleName', 'Middle Name'), profileField('lastName', 'Last Name'),
                  profileField('gender', 'Gender', 'text', ['Male', 'Female']), profileField('dateOfBirth', 'Date of Birth', 'date'),
                  profileField('placeOfBirth', 'Place of Birth'), profileField('maritalStatus', 'Marital Status', 'text', ['Single', 'Married', 'Widowed', 'Divorced']),
                ]} />
                <ProfileSection title={translateText("Contact & Work")} fields={[
                  <label className="field" key="email"><span>{translateText("Email")}</span><input value={profile.email} disabled /></label>,
                  <label className="field" key="phone"><span>{translateText("Mobile Phone · managed by Administrator")}</span><input value={profile.person?.phone ?? ''} disabled /></label>,
                  profileField('nationality', 'Nationality'), profileField('makingALiving', 'Make a Living', 'text', ['Employed', 'Self-employed', 'Student', 'Unemployed', 'Retired', 'Other']),
                  profileField('occupation', 'Occupation'),
                ]} />
                {isMember && <ProfileSection title={translateText("Faith & Denomination")} fields={[
                  profileField('acceptedJesus', 'Accepted Jesus Christ as Lord and Savior?', 'text', ['Yes', 'No']),
                  profileField('denomination', 'Christian denomination', 'text', ['Protestant', 'Orthodox', 'Catholic']),
                  ...(profile.person?.denomination === 'Protestant' || profileDenomination === 'Protestant' ? [profileField('memberOfThisChurch', 'Member of this church?', 'text', ['Yes', 'No'])] : []),
                ]} />}
                {isMember && showSpiritualJourney && <ProfileSection title={translateText("Spiritual Journey")} fields={[
                  profileField('yearReceivedLord', 'Year you received the Lord'), profileField('yearBaptized', 'Year baptized'),
                  profileField('previousChurchName', 'Church where you were baptized'),
                ]} />}
                {isMember && showSpiritualJourney && <ProfileSection title={translateText("Home Association")} fields={[
                  profileField('sharesHomeAssociation', 'Share a home association?', 'text', ['Yes', 'No']),
                  ...(profileSharesHome === 'Yes' ? [profileField('sharesWhoseHouse', 'Whose house'), profileField('unionLeaderName', 'Union leader')] : []),
                ]} />}
                {profileMaritalStatus === 'Married' && <ProfileSection title={translateText("Family")} fields={[
                  profileField('familySize', 'Family size'), profileField('numberOfChildren', 'Number of children'), profileField('childrenKnowLord', 'Children who know the Lord'),
                  profileField('poorNotKnowLord', 'Household members who do not know the Lord'), profileField('unemployedInHousehold', 'Unemployed in household'),
                ]} />}
                {profileSharesHome === 'Yes' && <ProfileSection title={translateText("Service & Ministry")} fields={[
                  profileField('currentService', 'Current service / ministry', 'textarea'), profileField('pastService', 'Past service', 'textarea'), profileField('serviceLoad', 'Service load', 'textarea'),
                ]} />}
              </> : isInstructor ? <>
                <ProfileSection title={translateText("Personal Information")} fields={[
                  profileField('firstName', 'First Name'), profileField('middleName', 'Middle Name'), profileField('lastName', 'Last Name'),
                  profileField('gender', 'Gender', 'text', ['Male', 'Female']), profileField('dateOfBirth', 'Date of Birth', 'date'),
                  profileField('placeOfBirth', 'Place of Birth'), profileField('maritalStatus', 'Marital Status', 'text', ['Single', 'Married', 'Widowed', 'Divorced']),
                ]} />
                <ProfileSection title={translateText("Contact & Work")} fields={[
                  <label className="field" key="email"><span>{translateText("Email")}</span><input value={profile.email} disabled /></label>,
                  profileField('phone', 'Mobile Phone'), profileField('officeTelephone', 'Office Telephone'), profileField('homeTelephone', 'Home Telephone'),
                  profileField('nationality', 'Nationality'), profileField('makingALiving', 'Make a Living'), profileField('occupation', 'Occupation'),
                ]} />
              </> : <div className="form-grid">
                <label className="field"><span>{translateText("Email")}</span><input value={profile.email} disabled /></label>
                <label className="field"><span>{translateText("Phone")}</span><input {...form.register('phone')} /></label>
                <label className="field"><span>{translateText("Gender")}</span><input {...form.register('gender')} /></label>
                <label className="field"><span>{translateText("Marital Status")}</span><input {...form.register('maritalStatus')} /></label>
                <label className="field"><span>{translateText("Occupation")}</span><input {...form.register('occupation')} /></label>
              </div>}
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 14 }}>
                <button className="btn-primary" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? translateText("Saving…") : translateText("Save Profile")}
                </button>
                {saved && <span style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>{translateText("✓ Saved")}</span>}
              </div>
            </form>
          </div>

          {/* Signature for managers */}
          {user?.role === 'CHURCH_MANAGER' && <SignatureForm />}
        </div>
      )}
    </div>
  );
}

function ProfileSection({ title, fields }: { title: string; fields: ReactNode[] }) {
  return <section className="profile-registration-section"><h3>{title}</h3><div className="form-grid">{fields}</div></section>;
}

function SignatureForm() {
  const [signature, setSignature] = useState('');
  const [message,   setMessage]   = useState('');

  useEffect(() => {
    api.get('/manager/profile')
      .then(({ data }) => setSignature(data.user?.signatureData ?? ''))
      .catch(e => setMessage(messageFromError(e)));
  }, []);

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h2>{translateText("Certificate Signature")}</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {translateText("Your stored signature is automatically added to every certificate you approve. You do not need to sign manually.\n      ")}</p>
      {signature && (
        <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 14, textAlign: 'center' }}>
          {signature.startsWith('data:image/')
            ? <img src={signature} alt={translateText("Stored signature")} style={{ maxHeight: 50, maxWidth: 220, margin: '0 auto' }} />
            : <p style={{ fontSize: 22, fontStyle: 'italic', color: 'var(--navy-800)', fontFamily: 'Georgia,serif' }}>{signature}</p>}
          <small style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>{translateText("Current stored signature")}</small>
        </div>
      )}
      <label className="field">
        <span>{translateText("Signature (text or paste a data:image URL)")}</span>
        <textarea
          rows={3}
          value={signature}
          onChange={e => setSignature(e.target.value)}
          placeholder={translateText("Enter your name or paste data:image/png;base64,...")}
        />
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          className="btn-primary"
          onClick={async () => {
            try { await api.patch('/manager/profile', { signatureData: signature }); setMessage('✓ Signature saved.'); }
            catch (e) { setMessage(messageFromError(e)); }
          }}
        >
          {translateText("Save Signature\n        ")}</button>
        {signature && (
          <button className="btn-outline" onClick={() => setSignature('')}>{translateText("Clear")}</button>
        )}
      </div>
      {message && <small style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{message}</small>}
    </div>
  );
}
