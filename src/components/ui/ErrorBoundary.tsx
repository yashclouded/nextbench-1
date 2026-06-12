import React from 'react';
import { RefreshCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary that catches render-time crashes (including
 * failed dynamic imports that slip past lazyWithRetry) and shows a
 * friendly recovery UI instead of a black screen.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  private handleUnhandledRejection: (event: PromiseRejectionEvent) => void;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
    this.handleRetry = this.handleRetry.bind(this);
    this.handleUnhandledRejection = () => {};
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidMount() {
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleUnhandledRejection(event: PromiseRejectionEvent) {
    // Prevent the default browser error logging for handled rejections
    event.preventDefault();
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason || 'Unhandled promise rejection'));
    console.error('[ErrorBoundary] Unhandled rejection:', error);
    // Only show error UI for chunk/import failures — other async errors
    // are typically non-fatal and shouldn't crash the whole UI
    if (this.isChunkError(error)) {
      this.setState({ hasError: true, error });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }

  isChunkError(error: Error | null): boolean {
    if (!error) return false;
    const msg = error.message || '';
    return (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Load failed') || // Safari
      msg.includes('Importing a module script failed') || // Safari
      msg.includes('error loading dynamically imported module') // Safari/older iOS
    );
  }

  handleReload() {
    // Clear any cached SW responses and hard-reload
    if ('caches' in window) {
      caches.keys().then((names) =>
        Promise.all(names.map((name) => caches.delete(name)))
      );
    }
    window.location.reload();
  }

  handleRetry() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isChunk = this.isChunkError(this.state.error);

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-brand-teal/10 flex items-center justify-center">
            <RefreshCcw className="text-brand-teal" size={28} />
          </div>

          <h2 className="text-2xl font-serif font-bold text-luxury-ink mb-3">
            {isChunk ? 'New Update Available' : 'Something Went Wrong'}
          </h2>

          <p className="text-sm text-luxury-ink/60 mb-8 leading-relaxed">
            {isChunk
              ? 'A new version of Nextbench has been deployed. Please refresh to get the latest experience.'
              : 'An unexpected error occurred. You can try again or refresh the page.'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="w-full sm:w-auto px-8 py-3 bg-brand-teal text-white font-bold text-xs uppercase tracking-widest rounded-full hover:bg-luxury-ink transition-all"
            >
              Refresh Page
            </button>
            {!isChunk && (
              <button
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-8 py-3 border-2 border-brand-teal/20 text-brand-teal font-bold text-xs uppercase tracking-widest rounded-full hover:border-brand-teal transition-all"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
