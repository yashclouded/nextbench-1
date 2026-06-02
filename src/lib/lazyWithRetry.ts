import React from 'react';

/**
 * A wrapper around React.lazy() that retries the dynamic import on failure.
 *
 * When a new build is deployed, old chunk URLs become 404s. This catches
 * that failure, reloads the page once to get fresh HTML with new chunk
 * URLs, and prevents the dreaded "black screen" crash.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(() => retryImport(factory));
}

const SESSION_KEY = 'chunk_retry_force_refreshed';

async function retryImport<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
): Promise<{ default: T }> {
  try {
    return await factory();
  } catch (error) {
    if (retries > 0) {
      // Wait briefly then retry — handles transient network blips
      await new Promise((r) => setTimeout(r, 1000));
      return retryImport(factory, retries - 1);
    }

    // All retries exhausted — this is likely a stale chunk from a new deployment.
    // Force a full page reload, but only once per session to avoid infinite loops.
    const hasRefreshed = sessionStorage.getItem(SESSION_KEY);
    if (!hasRefreshed) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      window.location.reload();
      // Return a never-resolving promise while the page reloads
      return new Promise(() => {});
    }

    // Already tried refreshing, surface the error
    throw error;
  }
}
