import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { I18nProvider } from './i18n/i18n';
import { PacksProvider } from './game/packs';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PacksProvider>
        <App />
      </PacksProvider>
    </I18nProvider>
  </StrictMode>,
);
