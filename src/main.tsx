import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './styles/global.css';
import App from './App';
import { loadRemoteCatalog } from './i18n';

// Merge the backend i18n catalog (direction + copy) once at boot.
void loadRemoteCatalog();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
