import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { startPendingMessageOrchestrator } from './stores/pendingMessageRehydrate';
import i18n, { initI18n } from './i18n';
import './styles/globals.css';
import { initializeInterfaceScale } from './platform/interfaceScale';
import { initializeAppearance } from './platform/appearance';
import { waitForEmojiShortcodeNames } from './utils/emojiShortcodes';

const stopInterfaceScale = initializeInterfaceScale();
const stopAppearance = initializeAppearance();
if (import.meta.hot) import.meta.hot.dispose(() => { stopInterfaceScale(); stopAppearance(); });

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; showStack: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, showStack: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    // Renderer is alive enough to show the fallback UI — disarm the boot timer.
    // Without this, the timer fires 20s after a caught render error and
    // overrides the in-app error UI with native recovery, which is wrong.
    // Gated on VITE_FORCE_BOOT_STALL so the smoke harness can suppress both
    // ping paths simultaneously when testing the renderer-stalled recovery path.
    if (import.meta.env.VITE_FORCE_BOOT_STALL) return;
    if (typeof window.backspace?.rendererReady === 'function') {
      window.backspace.rendererReady();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: 'calc(100*var(--app-vh))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c0c0e',
          color: '#ededf0',
          flexDirection: 'column',
          gap: '16px',
          padding: '24px',
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600 }}>{i18n.t('common:crash.title')}</h1>
          <p style={{ color: '#a0a0a8', maxWidth: '480px', textAlign: 'center' }}>{this.state.error?.message}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                height: '34px',
                padding: '0 16px',
                backgroundColor: '#6e5bef',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              {i18n.t('common:actions.tryAgain')}
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                height: '34px',
                padding: '0 16px',
                backgroundColor: '#1b1b1f',
                color: '#ededf0',
                border: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.075)',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {i18n.t('common:crash.reload')}
            </button>
          </div>
          {this.state.error?.stack && (
            <details
              open={this.state.showStack}
              onToggle={(e) => this.setState({ showStack: (e.target as HTMLDetailsElement).open })}
              style={{ maxWidth: '600px', width: '100%', marginTop: '8px' }}
            >
              <summary style={{ color: '#a0a0a8', cursor: 'pointer', fontSize: '13px' }}>
                {i18n.t('common:crash.details')}
              </summary>
              <pre style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#1b1b1f',
                borderRadius: '10px',
                fontSize: '11px',
                color: '#a0a0a8',
                overflow: 'auto',
                maxHeight: '200px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

startPendingMessageOrchestrator();

function render(): void {
  ReactDOM.createRoot(root!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// The selected language's catalogs are loaded before the first paint, so
// nothing flashes English first. English itself is bundled, so if loading a
// language fails the app still renders, in English, rather than not at all.
// The emoji shortcode names (emoji-mart's data set and Discord's table, each a
// chunk of its own, requested with the main chunk through the modulepreload
// links src/build/startupChunks.ts adds) load alongside, so text renders
// converted from the first paint. The wait is capped: a chunk that stalls
// must not leave a blank page. Past the cap the app renders with shortcodes as
// written and converts them when the names land; the wait never rejects.
const i18nReady = initI18n()
  .catch((err) => { console.error('[i18n] Failed to initialise, rendering in English:', err); });
const EMOJI_NAMES_MAX_WAIT_MS = 1000;
Promise.all([i18nReady, waitForEmojiShortcodeNames(EMOJI_NAMES_MAX_WAIT_MS)]).finally(render);
