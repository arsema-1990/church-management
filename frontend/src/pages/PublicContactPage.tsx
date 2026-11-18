import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function PublicContactPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/', { replace: true, state: { openContactForm: true } });
  }, [navigate]);
  return null;
}
