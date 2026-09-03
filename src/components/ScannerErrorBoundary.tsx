'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps camera/QR library crashes from taking down the whole app route. */
export default class ScannerErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('ScannerErrorBoundary', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="card-surface"
          style={{
            margin: '1rem auto',
            maxWidth: 480,
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={40} style={{ color: 'var(--accent)', marginBottom: '0.75rem' }} />
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Сканер остановился</h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Часто так бывает после переключения вкладки — камера была прервана. Можно продолжить вручную
            или перезапустить камеру.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ error: null })}
          >
            Перезапустить сканер
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
