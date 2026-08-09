import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 全域錯誤邊界：任一渲染錯誤不再讓整個遊戲白屏，
 * 改顯示可重新載入的 fallback（存檔在雲端，重新載入不會遺失進度）
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-screen gap-4 px-6"
          style={{ background: 'var(--bg-base)' }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            發生了預期外的錯誤
          </h1>
          <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
            別擔心，你的進度已儲存在雲端。重新載入即可回到遊戲；若持續發生，請截圖以下訊息回報。
          </p>
          <pre
            className="text-xs px-4 py-3 rounded-[8px] max-w-full overflow-x-auto"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-danger)', border: '0.5px solid var(--border-default)' }}
          >
            {this.state.error.message}
          </pre>
          <button
            className="px-6 py-2 rounded-[8px] text-sm font-medium"
            style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)', boxShadow: 'var(--shadow)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--btn-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--btn-primary)')}
            onClick={() => window.location.reload()}
          >
            重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
