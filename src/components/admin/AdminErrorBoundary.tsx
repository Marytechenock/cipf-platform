// @ts-nocheck
import React, { type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, ShieldAlert } from 'lucide-react';

interface AdminErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
  onExit: () => void;
}

interface AdminErrorBoundaryState {
  hasError: boolean;
}

export default class AdminErrorBoundary extends React.Component<AdminErrorBoundaryProps, AdminErrorBoundaryState> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AdminErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Admin route render failure:', error, errorInfo);
  }

  componentDidUpdate(prevProps: AdminErrorBoundaryProps) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-xl">
        <div className="mx-auto max-w-2xl text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500">Admin Route Failure</p>
            <h2 className="text-2xl font-black text-gray-900">The admin screen hit an unexpected error.</h2>
            <p className="text-sm font-semibold leading-relaxed text-gray-500">
              The failure was isolated so the rest of the application stayed intact. Retry the admin route or exit back to the main workspace.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFD700] transition-all hover:bg-black"
            >
              <RefreshCcw className="h-4 w-4" /> Retry admin
            </button>
            <button
              onClick={this.props.onExit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
            >
              <AlertTriangle className="h-4 w-4" /> Exit to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
