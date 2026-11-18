import { useLocation, useNavigate } from 'react-router-dom';

type Props = { fallback?: string; label?: string; className?: string };

export function BackButton({ fallback = '/', label = 'Go back', className = '' }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  function goBack() {
    if (location.key !== 'default') navigate(-1);
    else navigate(fallback);
  }

  return (
    <button type="button" className={`app-back-button ${className}`} onClick={goBack} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m0 0 7 7m-7-7 7-7" /></svg>
    </button>
  );
}
