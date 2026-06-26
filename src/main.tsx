import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import { ThemeProvider } from './lib/ThemeContext';
import { VideoPrefsProvider } from './lib/VideoPrefsContext';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter>
      <HelmetProvider>
        <ThemeProvider>
          <VideoPrefsProvider>
            <AuthProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </AuthProvider>
          </VideoPrefsProvider>
        </ThemeProvider>
      </HelmetProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Dismiss the HTML loading screen now that React has mounted
if (typeof window.__hideAppLoading === 'function') {
  window.__hideAppLoading();
}
