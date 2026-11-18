import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider }     from './state';
import { LanguageProvider } from './i18n/context';
import { ToastProvider }    from './components/Toast';
import App from './App';
import './styles.css';

// Apply the saved preference before React paints the page to avoid a light-mode flash.
document.documentElement.dataset.theme = localStorage.getItem('cms-theme') === 'dark' ? 'dark' : 'light';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
