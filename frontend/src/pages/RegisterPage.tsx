import { translateText } from '../i18n/context';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PhoneInput, { getCountries, getCountryCallingCode, type Country } from 'react-phone-number-input/input';
import phoneCountryFlags from 'react-phone-number-input/flags';
import { isValidPhoneNumber } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import { useAuth } from '../state';
import { api, messageFromError } from '../api';
import { useLanguage } from '../i18n/context';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { optionalPersonName, requiredPersonName } from '../validation/personName';

const schema = z.object({
  firstName: requiredPersonName, middleName: optionalPersonName.optional(),
  lastName: requiredPersonName, gender: z.string().min(1, 'Required'),
  dateOfBirth: z.string().optional(), placeOfBirth: z.string().trim().max(120, 'Keep this under 120 characters').optional(),
  photoUrl: z.string().optional(),
  maritalStatus: z.string().optional(), phone: z.string().trim().min(1, 'Required').max(40, 'Phone number is too long').refine(isValidPhoneNumber, 'Enter a valid phone number for the selected country'),
  officeTelephone: z.string().trim().max(40, 'Phone number is too long').optional().refine(value => !value || isValidPhoneNumber(value), 'Enter a valid phone number for the selected country'),
  email: z.string().trim().email('Invalid email address').max(254, 'Email address is too long').refine(value => value.toLowerCase().endsWith('@gmail.com'), 'Invalid email address').transform(value => value.toLowerCase()), nationality: z.string().optional(),
  makingALiving: z.string().optional(), occupation: z.string().optional(),
  acceptedJesus: z.string().min(1, 'Choose Yes or No').refine(value => ['Yes','No'].includes(value), 'Choose Yes or No'),
  denomination: z.string().optional().refine(value => !value || ['Protestant','Orthodox','Catholic'].includes(value), 'Select your Christian denomination'),
  memberOfThisChurch: z.string().optional().refine(value => !value || ['Yes','No'].includes(value), 'Choose Yes or No'),
  password: z.string().min(10, 'Use at least 10 characters').max(100, 'Password is too long'), confirmPassword: z.string(),
  yearReceivedLord: z.string().optional(), yearBaptized: z.string().optional(),
  previousChurchName: z.string().optional(), sharesHomeAssociation: z.string().optional(),
  sharesWhoseHouse: optionalPersonName.optional(),
  unionLeaderName: optionalPersonName.optional(),
  familySize: z.string().optional(), numberOfChildren: z.string().optional(),
  childrenKnowLord: z.string().optional(), poorNotKnowLord: z.string().optional(),
  unemployedInHousehold: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.password !== d.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Passwords do not match', path: ['confirmPassword'] });
  if (d.acceptedJesus === 'Yes' && !d.denomination) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select your Christian denomination', path: ['denomination'] });
  if (d.denomination === 'Protestant' && !d.memberOfThisChurch) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose Yes or No', path: ['memberOfThisChurch'] });
  if (d.dateOfBirth) {
    const date = new Date(`${d.dateOfBirth}T00:00:00`);
    const maximumBirthDate = new Date(); maximumBirthDate.setFullYear(maximumBirthDate.getFullYear() - 15); maximumBirthDate.setDate(maximumBirthDate.getDate() - 1);
    if (Number.isNaN(date.getTime()) || date > maximumBirthDate) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'You must be older than 15 to register', path: ['dateOfBirth'] });
  } else ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date of birth is required', path: ['dateOfBirth'] });
  if (d.password && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(d.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Include an uppercase letter, a lowercase letter, and a number', path: ['password'] });
  for (const field of ['yearReceivedLord', 'yearBaptized'] as const) {
    const value = (d[field] ?? '').trim();
    if (value && (!/^\d{4}$/.test(value) || Number(value) < 1900 || Number(value) > new Date().getFullYear())) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid year', path: [field] });
  }
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { label: 'Account', title: 'Create your account', description: 'Use an email you check regularly. You will verify it before signing in.' },
  { label: 'Personal', title: 'Personal information', description: 'Tell us who you are. A photo is optional and can be added later.' },
  { label: 'Contact', title: 'Contact and work', description: 'We use your mobile number if we need to reach you about your registration.' },
  { label: 'Faith', title: 'Christian journey', description: 'Your answers here decide whether you continue as a worshiper or as a member.' },
];

const LIVING_OPTIONS = ['Employed', 'Self-employed', 'Student', 'Unemployed', 'Retired', 'Other'];
const OCCUPATION_OPTIONS = [
  'Accountant', 'Administrator', 'Artisan', 'Business owner', 'Clergy / church worker',
  'Civil servant', 'Driver', 'Engineer', 'Farmer', 'Healthcare worker', 'Homemaker',
  'Other', 'Retired', 'Skilled worker', 'Student', 'Teacher', 'Unemployed',
];
const PHONE_COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
const PHONE_COUNTRIES = getCountries()
  .map(country => ({ country, name: PHONE_COUNTRY_NAMES.of(country) ?? country, callingCode: getCountryCallingCode(country) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const ETHIOPIAN_CITIES = [
  'Addis Ababa', 'Adama', 'Adigrat', 'Ambo', 'Arba Minch', 'Arsi Negele', 'Asella',
  'Assosa', 'Axum', 'Bahir Dar', 'Bedele', 'Bishoftu', 'Bonga', 'Bule Hora',
  'Burayu', 'Butajira', 'Debre Birhan', 'Debre Markos', 'Debre Tabor', 'Dessie',
  'Dilla', 'Dire Dawa', 'Gambella', 'Goba', 'Gode', 'Gondar', 'Harar', 'Hawassa',
  'Hosaena', 'Jigjiga', 'Jimma', 'Kebri Dehar', 'Kombolcha', 'Lalibela', 'Mekelle',
  'Mettu', 'Mizan Teferi', 'Modjo', 'Moyale', 'Nekemte', 'Robe', 'Sebeta', 'Semera',
  'Shashamane', 'Shire (Inda Selassie)', 'Tepi', 'Wolaita Sodo', 'Woliso', 'Woldia',
  'Yabello',
];
const maxBirthDate = new Date(new Date().setFullYear(new Date().getFullYear() - 15) - 86400000).toISOString().slice(0, 10);

export function RegisterPage() {
  const { register: authRegister } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<Country>('ET');
  const [alternatePhoneCountry, setAlternatePhoneCountry] = useState<Country>('ET');

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName:'',middleName:'',lastName:'',gender:'',dateOfBirth:'',placeOfBirth:'',photoUrl:'',maritalStatus:'',phone:'',officeTelephone:'',email:'',nationality:'',makingALiving:'',occupation:'',password:'',confirmPassword:'',acceptedJesus:'',denomination:'',memberOfThisChurch:'',yearReceivedLord:'',yearBaptized:'',previousChurchName:'',sharesHomeAssociation:'',sharesWhoseHouse:'',unionLeaderName:'',familySize:'',numberOfChildren:'',childrenKnowLord:'',poorNotKnowLord:'',unemployedInHousehold:'' },
    mode: 'onBlur',
  });

  const maritalStatus = form.watch('maritalStatus');
  const isMarried = maritalStatus === 'Married';
  const sharesHome = form.watch('sharesHomeAssociation');
  const acceptedJesus = form.watch('acceptedJesus');
  const denomination = form.watch('denomination');
  const memberOfThisChurch = form.watch('memberOfThisChurch');
  const passwordValue = form.watch('password');
  const spiritualGateAnswered = acceptedJesus === 'Yes' && !!denomination && (denomination !== 'Protestant' || !!memberOfThisChurch);
  const showSpiritualJourney = acceptedJesus === 'Yes' && denomination === 'Protestant' && spiritualGateAnswered && memberOfThisChurch !== 'Yes';
  const registerAsMember = denomination === 'Protestant' && memberOfThisChurch === 'Yes';
  const registerAtFaithStep = acceptedJesus === 'No' || (acceptedJesus === 'Yes' && (denomination === 'Catholic' || denomination === 'Orthodox' || registerAsMember));
  const visibleSteps = STEPS;
  const canFinish = step === visibleSteps.length - 1;
  const passwordChecks = [
    { ok: (passwordValue?.length ?? 0) >= 10, label: '10+ characters' },
    { ok: /[A-Z]/.test(passwordValue ?? ''), label: 'Uppercase letter' },
    { ok: /[a-z]/.test(passwordValue ?? ''), label: 'Lowercase letter' },
    { ok: /\d/.test(passwordValue ?? ''), label: 'Number' },
  ];

  useEffect(() => {
    if (acceptedJesus === 'No') {
      form.setValue('denomination', '', { shouldValidate: true });
      form.setValue('memberOfThisChurch', '', { shouldValidate: true });
    }
  }, [acceptedJesus, form]);

  const next = async () => {
    const fieldsPerStep: (keyof FormValues)[][] = [
      ['email','password','confirmPassword'],
      ['firstName','lastName','gender','dateOfBirth','placeOfBirth'],
      ['phone','officeTelephone'],
      ['acceptedJesus',...(acceptedJesus === 'Yes' ? ['denomination' as const,...(denomination === 'Protestant' ? ['memberOfThisChurch' as const] : []),...(showSpiritualJourney ? ['yearReceivedLord' as const,'yearBaptized' as const] : [])] : [])],
    ];
    const ok = await form.trigger(fieldsPerStep[step], { shouldFocus: true });
    if (ok) setStep(s => Math.min(s + 1, visibleSteps.length - 1));
  };

  const submit = form.handleSubmit(async values => {
    try {
      setError('');
      const { confirmPassword, ...payload } = values;
      const cleaned = Object.fromEntries(Object.entries(payload).map(([k,v]) => [k, v === '' ? undefined : v]));
      let photoUrl: string | undefined;
      if (photoFile) {
        const photoData = new FormData();
        photoData.append('photo', photoFile);
        const { data } = await api.post('/auth/profile-photo', photoData, { headers: { 'Content-Type': 'multipart/form-data' } });
        photoUrl = data.photoUrl;
      }
      const result = await authRegister({ ...cleaned, ...(photoUrl ? { photoUrl } : {}) });
      navigate(`/verify-email?email=${encodeURIComponent(result.email)}`, {
        replace: true,
        state: { notice: t('Your account was created. Check your email for the six-digit verification code.') },
      });
    } catch (e) {
      if (axios.isAxiosError<{ accountCreated?: boolean; email?: string; error?: string }>(e) && e.response?.data.accountCreated && e.response.data.email) {
        navigate(`/verify-email?email=${encodeURIComponent(e.response.data.email)}`, {
          replace: true,
          state: { error: e.response.data.error ?? messageFromError(e) },
        });
        return;
      }
      setError(messageFromError(e));
    }
  });

  const F = useCallback(({ name, label, type='text', required=false, max, placeholder, autoComplete, wide=false }: {
    name: keyof FormValues; label: string; type?: string; required?: boolean; max?: string; placeholder?: string; autoComplete?: string; wide?: boolean;
  }) => {
    const err = form.formState.errors[name]?.message as string | undefined;
    return (
      <label className={`field${wide ? ' form-wide' : ''}`}>
        <span>{label}{required && <span className="portal-req-star"> {translateText("*")}</span>}</span>
        {type === 'textarea' ? (
          <textarea rows={3} placeholder={placeholder} {...form.register(name)} aria-invalid={!!err} />
        ) : (
          <input type={type} max={max} placeholder={placeholder} autoComplete={autoComplete} {...form.register(name)} aria-invalid={!!err} />
        )}
        {err && <small className="field-error" role="alert">{err}</small>}
        {name === 'email' && <small style={{ display: 'block', marginTop: 5, color: 'var(--text-muted)' }}>{translateText("Use a unique Gmail address ending in @gmail.com.")}</small>}
      </label>
    );
  }, [form]);

  const Dropdown = useCallback(({ name, label, options, required=false, wide=false }: {
    name: keyof FormValues; label: string; options: string[]; required?: boolean; wide?: boolean;
  }) => {
    const err = form.formState.errors[name]?.message as string | undefined;
    return (
      <label className={`field${wide ? ' form-wide' : ''}`}>
        <span>{label}{required && <span className="portal-req-star"> {translateText("*")}</span>}</span>
        <select {...form.register(name)} aria-invalid={!!err}>
          <option value="">{translateText("Select ")}{label.toLowerCase()}</option>
          {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        {err && <small className="field-error" role="alert">{err}</small>}
      </label>
    );
  }, [form]);

  const PasswordField = useCallback(({ name, label, visible, onToggle, autoComplete }: {
    name: 'password' | 'confirmPassword'; label: string; visible: boolean; onToggle: () => void; autoComplete: string;
  }) => {
    const err = form.formState.errors[name]?.message as string | undefined;
    return (
      <label className="field">
        <span>{label}<span className="portal-req-star"> {translateText("*")}</span></span>
        <div className="register-password-wrap">
          <input
            type={visible ? 'text' : 'password'}
            autoComplete={autoComplete}
            placeholder={name === 'password' ? 'Create a password' : 'Repeat your password'}
            {...form.register(name)}
            aria-invalid={!!err}
          />
          <button type="button" className="register-password-toggle" onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? translateText("Hide") : translateText("Show")}
          </button>
        </div>
        {err && <small className="field-error" role="alert">{err}</small>}
      </label>
    );
  }, [form]);

  const applyPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP photo that is 5 MB or smaller.');
      return;
    }
    setError('');
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  return (
    <div className="register-screen">
      <aside className="register-banner">
        <div className="register-banner-content">
          <div className="auth-church-mark">{translateText("✝")}</div>
          <p className="auth-church-name">{translateText("Grace Evangelical Church")}</p>
          <h1>{translateText("Join our ")}<em>{translateText("church family")}</em></h1>
          <p className="auth-tagline">{translateText("Worshiper registration · Grow · Serve")}</p>
          <blockquote className="auth-verse">
            {translateText("“So in Christ we, though many, form one body, and each member belongs to all the others.”\n            ")}<cite>{translateText("Romans 12:5")}</cite>
          </blockquote>
        </div>

        <ol className="register-steps" aria-label={translateText("Registration steps")}>
          {visibleSteps.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                className={`register-step ${i === step ? 'active' : i < step ? 'done' : ''}`}
                disabled={i > step}
                onClick={() => { if (i < step) setStep(i); }}
              >
                <span className="register-step-num">{i < step ? translateText("✓") : String(i + 1)}</span>
                <span>
                  <strong>{s.label}</strong>
                  <small>{s.title}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="register-form-panel">
        <BackButton fallback="/" className="register-back-button" />
        <div className="register-form-inner">
          <div className="register-page-tools">
            <ThemeToggle />
            <div className="lang-toggle-auth">
              <button type="button" className={`lang-btn${language==='en'?' active':''}`} onClick={() => setLanguage('en')}>{translateText("English")}</button>
              <button type="button" className={`lang-btn${language==='am'?' active':''}`} onClick={() => setLanguage('am')}>{translateText("አማርኛ")}</button>
            </div>
          </div>

          <div className="register-form-card">
            <div className="register-step-header">
              <div>
                <p className="register-step-kicker">{translateText("Step ")}{step + 1} {translateText("of ")}{visibleSteps.length}</p>
                <h2>{visibleSteps[step].title}</h2>
                <p className="register-step-description">{visibleSteps[step].description}</p>
              </div>
              <span className="register-step-count">{String(step + 1).padStart(2, '0')}<small>{translateText("/ ")}{visibleSteps.length}</small></span>
            </div>

            <ol className="register-mobile-steps" aria-label={translateText("Registration progress")}>
              {visibleSteps.map((s, i) => (
                <li key={s.label} className={i === step ? 'active' : i < step ? 'done' : ''}>
                  <button type="button" disabled={i > step} onClick={() => { if (i < step) setStep(i); }}>{s.label}</button>
                </li>
              ))}
            </ol>

            <div className="register-progress" role="progressbar" aria-valuenow={Math.round(((step + 1) / visibleSteps.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={translateText("Registration progress")}>
              <div style={{ width: `${((step + 1) / visibleSteps.length) * 100}%` }} />
            </div>

            {error && <div className="alert error" role="alert">{error}</div>}

            <form onSubmit={event => { event.preventDefault(); if (canFinish) void submit(); else void next(); }}>
              {step === 0 && (
                <div>
                  <div className="form-stack">
                    <F name="email" label="Email address" type="email" required placeholder={translateText("you@email.com")} autoComplete="email" />
                    <div className="form-grid">
                      <PasswordField name="password" label="Password" visible={showPassword} onToggle={() => setShowPassword(v => !v)} autoComplete="new-password" />
                      <PasswordField name="confirmPassword" label="Confirm password" visible={showConfirm} onToggle={() => setShowConfirm(v => !v)} autoComplete="new-password" />
                    </div>
                    <ul className="register-password-checks">
                      {passwordChecks.map(check => (
                        <li key={check.label} className={check.ok ? 'ok' : ''}>{check.label}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <div className="register-photo-field">
                    <div className="register-photo-preview">
                      {photoPreview ? <img src={photoPreview} alt={translateText("Selected profile preview")} /> : <span className="register-photo-placeholder">{translateText("Photo")}</span>}
                    </div>
                    <div className="register-photo-copy">
                      <strong>{translateText("Profile photo")}</strong>
                      <small>{translateText("Optional · JPG, PNG, or WebP · Max 5 MB")}</small>
                      <div className="register-photo-actions">
                        <label className="btn-outline register-photo-button">
                          {photoFile ? translateText("Change photo") : translateText("Choose photo")}
                          <input className="register-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
                            applyPhoto(event.target.files?.[0]);
                            event.target.value = '';
                          }} />
                        </label>
                        {photoFile && <Button variant="danger" className="register-photo-remove" onClick={() => { setPhotoFile(null); setPhotoPreview(''); }}>{translateText("Remove")}</Button>}
                      </div>
                    </div>
                  </div>
                  <div className="form-grid">
                    <F name="firstName" label="First name" required placeholder={translateText("Given name")} autoComplete="given-name" />
                    <F name="middleName" label="Middle name" placeholder={translateText("Optional")} autoComplete="additional-name" />
                    <F name="lastName" label="Last name" required placeholder={translateText("Family name")} autoComplete="family-name" />
                    <Dropdown name="gender" label="Gender" required options={['Male', 'Female']} />
                    <F name="dateOfBirth" label="Date of birth" type="date" max={maxBirthDate} required />
                    <label className="field">
                      <span>{translateText("Place of birth")}</span>
                      <select {...form.register('placeOfBirth')} aria-invalid={!!form.formState.errors.placeOfBirth}>
                        <option value="">{translateText("Select a city")}</option>
                        {ETHIOPIAN_CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                      </select>
                      {form.formState.errors.placeOfBirth?.message && <small className="field-error" role="alert">{form.formState.errors.placeOfBirth.message}</small>}
                    </label>
                    <Dropdown name="maritalStatus" label="Marital status" options={['Single', 'Married', 'Widowed', 'Divorced']} wide />
                  </div>
                  {isMarried && (
                    <div className="register-married-section">
                      <h4>{translateText("Head of household")}</h4>
                      <p>{translateText("Optional details about your family at home.")}</p>
                      <div className="form-grid">
                        <F name="familySize" label="Family size" placeholder={translateText("e.g. 5")} />
                        <F name="numberOfChildren" label="Number of children" placeholder={translateText("e.g. 2")} />
                        <F name="childrenKnowLord" label="Children who know the Lord" />
                        <F name="poorNotKnowLord" label="Those who don't know the Lord among the poor" />
                        <F name="unemployedInHousehold" label="Unemployed in household" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="form-grid">
                  <label className="field form-wide">
                    <span>{translateText("Mobile phone ")}<span className="portal-req-star">{translateText("*")}</span></span>
                    <Controller
                      name="phone"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <div className={`register-phone-control${fieldState.error ? ' has-error' : ''}`}>
                          <div className="register-phone-country-picker">
                            {(() => {
                              const Flag = phoneCountryFlags[phoneCountry];
                              return Flag ? <Flag title={PHONE_COUNTRY_NAMES.of(phoneCountry) ?? phoneCountry} /> : <span aria-hidden="true">{translateText("🌐")}</span>;
                            })()}
                            <select
                              className="register-phone-country-select"
                              aria-label={translateText("Phone number country")}
                              value={phoneCountry}
                              onChange={event => {
                                const nextCountry = event.target.value as Country;
                                setPhoneCountry(nextCountry);
                                form.setValue('phone', '', { shouldValidate: true, shouldDirty: true });
                              }}
                            >
                              {PHONE_COUNTRIES.map(option => <option key={option.country} value={option.country}>{option.name} {translateText("+")}{option.callingCode}</option>)}
                            </select>
                            <span className="register-phone-country-code">{translateText("+")}{getCountryCallingCode(phoneCountry)}</span>
                            <span className="PhoneInputCountrySelectArrow" aria-hidden="true" />
                          </div>
                          <PhoneInput
                            country={phoneCountry}
                            value={field.value || undefined}
                            onChange={value => field.onChange(value ?? '')}
                            onBlur={field.onBlur}
                            autoComplete="tel"
                            className="PhoneInputInput"
                            aria-invalid={Boolean(fieldState.error)}
                            placeholder={translateText("Phone number")}
                            ref={field.ref}
                          />
                        </div>
                      )}
                    />
                    {form.formState.errors.phone?.message && <small className="field-error" role="alert">{form.formState.errors.phone.message}</small>}
                  </label>
                  <label className="field form-wide">
                    <span>{translateText("Alternative phone number")}</span>
                    <Controller
                      name="officeTelephone"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <div className={`register-phone-control${fieldState.error ? ' has-error' : ''}`}>
                          <div className="register-phone-country-picker">
                            {(() => {
                              const Flag = phoneCountryFlags[alternatePhoneCountry];
                              return Flag ? <Flag title={PHONE_COUNTRY_NAMES.of(alternatePhoneCountry) ?? alternatePhoneCountry} /> : <span aria-hidden="true">{translateText("🌐")}</span>;
                            })()}
                            <select
                              className="register-phone-country-select"
                              aria-label={translateText("Alternative phone number country")}
                              value={alternatePhoneCountry}
                              onChange={event => {
                                const nextCountry = event.target.value as Country;
                                setAlternatePhoneCountry(nextCountry);
                                form.setValue('officeTelephone', '', { shouldValidate: true, shouldDirty: true });
                              }}
                            >
                              {PHONE_COUNTRIES.map(option => <option key={option.country} value={option.country}>{option.name} {translateText("+")}{option.callingCode}</option>)}
                            </select>
                            <span className="register-phone-country-code">{translateText("+")}{getCountryCallingCode(alternatePhoneCountry)}</span>
                            <span className="PhoneInputCountrySelectArrow" aria-hidden="true" />
                          </div>
                          <PhoneInput
                            country={alternatePhoneCountry}
                            value={field.value || undefined}
                            onChange={value => field.onChange(value ?? '')}
                            onBlur={field.onBlur}
                            autoComplete="tel"
                            className="PhoneInputInput"
                            aria-invalid={Boolean(fieldState.error)}
                            placeholder={translateText("Optional phone number")}
                            ref={field.ref}
                          />
                        </div>
                      )}
                    />
                    {form.formState.errors.officeTelephone?.message && <small className="field-error" role="alert">{form.formState.errors.officeTelephone.message}</small>}
                  </label>
                  <label className="field">
                    <span>{translateText("Nationality")}</span>
                    <select {...form.register('nationality')} aria-invalid={!!form.formState.errors.nationality}>
                      <option value="">{translateText("Select a nationality")}</option>
                      {PHONE_COUNTRIES.map(option => <option key={option.country} value={option.name}>{option.name}</option>)}
                    </select>
                    {form.formState.errors.nationality?.message && <small className="field-error" role="alert">{form.formState.errors.nationality.message}</small>}
                  </label>
                  <Dropdown name="makingALiving" label="How do you make a living?" options={LIVING_OPTIONS} wide />
                  <label className="field form-wide">
                    <span>{translateText("Occupation")}</span>
                    <select {...form.register('occupation')} aria-invalid={!!form.formState.errors.occupation}>
                      <option value="">{translateText("Select occupation")}</option>
                      {OCCUPATION_OPTIONS.map(occupation => <option key={occupation} value={occupation}>{occupation}</option>)}
                    </select>
                    {form.formState.errors.occupation?.message && <small className="field-error" role="alert">{form.formState.errors.occupation.message}</small>}
                  </label>
                </div>
              )}

              {step === 3 && (
                <div className="form-stack">
                  <Dropdown name="acceptedJesus" label="Have you accepted Jesus Christ as your Lord and Savior?" required options={['Yes', 'No']} wide />
                  {acceptedJesus === 'Yes' && <Dropdown name="denomination" label="What is your Christian denomination?" required options={['Protestant', 'Orthodox', 'Catholic']} wide />}
                  {acceptedJesus === 'Yes' && denomination === 'Protestant' && (
                    <Dropdown name="memberOfThisChurch" label="Are you a member of this church?" required options={['Yes', 'No']} wide />
                  )}
                  {registerAsMember && (
                    <p className="register-note register-note-member">{translateText("Your account will be active when registration finishes, and you will enter the member portal.")}</p>
                  )}
                  {registerAtFaithStep && !registerAsMember && (
                    <p className="register-note">{translateText("Thank you. You can finish registration now as a worshiper.")}</p>
                  )}
                  {showSpiritualJourney && (
                    <>
                      <div className="register-section-heading"><h3>{translateText("Spiritual journey")}</h3></div>
                      <div className="form-grid">
                        <F name="yearReceivedLord" label="Year you received the Lord" placeholder={translateText("YYYY")} />
                        <F name="yearBaptized" label="Baptism year" placeholder={translateText("YYYY")} />
                        {form.watch('yearBaptized') && <F name="previousChurchName" label="Church where you were baptized" wide />}
                      </div>
                      <div className="register-section-heading"><h3>{translateText("Home association")}</h3></div>
                      <Dropdown name="sharesHomeAssociation" label="Do you share a home association?" options={['Yes', 'No']} wide />
                      {sharesHome === 'Yes' && (
                        <div className="form-grid">
                          <F name="sharesWhoseHouse" label="Whose house?" />
                          <F name="unionLeaderName" label="Union leader name" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="register-nav-btns">
                {step > 0 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>{translateText("Back")}</Button>}
                {canFinish ? (
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? translateText("Registering…") : `Register as ${registerAsMember ? 'member' : 'worshiper'}`}
                  </Button>
                ) : (
                  <Button type="submit">{translateText("Continue")}</Button>
                )}
              </div>
            </form>

            <p className="register-signin-link">
              {translateText("Already have an account? ")}<Link to="/login">{translateText("Sign in")}</Link>
              <span aria-hidden="true"> {translateText("· ")}</span>
              <Link to="/forgot-password">{translateText("Forgot password?")}</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
