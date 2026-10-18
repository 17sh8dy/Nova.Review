import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

/** A crash in any component would otherwise unmount the whole tree and leave an empty dark page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Nova.Review crashed:', error);
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>Something went wrong</h1>
        <p className="lede">Nova.Review hit an error. Your reviews and account are safe.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
