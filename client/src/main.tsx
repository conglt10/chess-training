import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Render's free API sleeps when idle. The list pages are static, but opening a
// game / the explorer / coach need the API — ping it on boot so it is waking up
// while the user browses. Fire-and-forget; failures are irrelevant.
try {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (api && /^https?:\/\//.test(api)) {
    fetch(`${new URL(api).origin}/health`, { mode: 'no-cors' }).catch(() => {});
  }
} catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
