import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import { ThemeProvider } from './lib/ThemeContext';
import { VideoPrefsProvider } from './lib/VideoPrefsContext';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/playfair-display/700.css';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  </StrictMode>,
);

// Dismiss the HTML loading screen now that React has mounted
if (typeof window.__hideAppLoading === 'function') {
  window.__hideAppLoading();
}
