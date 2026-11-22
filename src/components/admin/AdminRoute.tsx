import { AlertTriangle, LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError, isApiErrorStatus } from '../../lib/api';
import { User } from '../../types';
import AdminPanel from '../AdminPanel';
import AdminErrorBoundary from './AdminErrorBoundary';
import { resolveAdminAccess } from './adminAccess';

interface AdminRouteProps {
  user: User | null;
  onUserChange: (user: User | null) => void;
  onRefreshCore: () => void;
  onRequireLogin: (message: string) => void;
  onExit: () => void;
}

type AdminRouteState =
  | { status: 'checking'; nonce: number }
  | { status: 'ready'; user: User; nonce: number }
  | { status: 'forbidden'; user: User | null; message: string; nonce: number }
  | { status: 'fatal'; message: string; nonce: number };

export default function AdminRoute({
  user,
  onUserChange,
  onRefreshCore,
  onRequireLogin,
  onExit
}: AdminRouteProps) {
  const [routeState, setRouteState] = useState<AdminRouteState>({ status: 'checking', nonce: 0 });

  useEffect(() => {
    let isActive = true;

    const verifyAccess = async () => {
      setRouteState(current => ({ status: 'checking', nonce: current.nonce }));

      try {
        const response = await api.getMe();
        if (!isActive) return;

        const decision = resolveAdminAccess(response.user);

        if (decision.state === 'ready') {
          onUserChange(decision.user);
          setRouteState(current => ({ status: 'ready', user: decision.user, nonce: current.nonce }));
          return;
        }

        if (decision.state === 'forbidden') {
          onUserChange(response.user);
          setRouteState(current => ({
            status: 'forbidden',
            user: decision.user,
            message: decision.message,
            nonce: current.nonce
          }));
          return;
        }

        if (decision.state === 'redirect-login') {
          onUserChange(null);
          onRequireLogin(decision.message);
          return;
        }

        setRouteState(current => ({ status: 'fatal', message: decision.message, nonce: current.nonce }));
      } catch (error) {
        if (!isActive) return;

        const decision = resolveAdminAccess(user, error);
        if (decision.state === 'redirect-login') {
          onUserChange(null);
          onRequireLogin(decision.message);
          return;
        }

        if (decision.state === 'forbidden') {
          setRouteState(current => ({
            status: 'forbidden',
            user: decision.user,
            message: decision.message,
            nonce: current.nonce
          }));
          return;
        }

        const fatalMessage = decision.state === 'fatal'
          ? decision.message
          : 'We could not verify your administrator session.';
        setRouteState(current => ({ status: 'fatal', message: fatalMessage, nonce: current.nonce }));
      }
    };

    void verifyAccess();

    return () => {
      isActive = false;
    };
  }, [onRequireLogin, onUserChange, routeState.nonce]);

  const handleRetry = () => {
    setRouteState(current => ({ status: 'checking', nonce: current.nonce + 1 }));
  };

  const handleAdminAuthFailure = (error: ApiError) => {
    if (isApiErrorStatus(error, [401])) {
      onUserChange(null);
      onRequireLogin('Your administrator session expired. Please sign in again.');
      return;
    }

    if (isApiErrorStatus(error, [403])) {
      setRouteState(current => ({
        status: 'forbidden',
        user,
        message: 'Your administrator access is no longer available for this session.',
        nonce: current.nonce
      }));
    }
  };

  if (routeState.status === 'checking') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mx-auto max-w-2xl text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-[#8B6914]">
            <ShieldCheck className="h-7 w-7 animate-pulse" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#8B6914]">Admin Verification</p>
            <h2 className="text-2xl font-black text-gray-900">Checking administrator access</h2>
            <p className="text-sm font-semibold leading-relaxed text-gray-500">
              The admin route is revalidating your session against the server before loading any protected data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (routeState.status === 'forbidden') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-xl">
        <div className="mx-auto max-w-2xl text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-[#8B6914]">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#8B6914]">Access Denied</p>
            <h2 className="text-2xl font-black text-gray-900">This account cannot open the admin route</h2>
            <p className="text-sm font-semibold leading-relaxed text-gray-500">{routeState.message}</p>
            {routeState.user && (
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">
                Signed in as {routeState.user.firstName} {routeState.user.lastName} · {routeState.user.role}
              </p>
            )}
          </div>
          <button
            onClick={onExit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFD700] transition-all hover:bg-black"
          >
            <AlertTriangle className="h-4 w-4" /> Return to home
          </button>
        </div>
      </div>
    );
  }

  if (routeState.status === 'fatal') {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-xl">
        <div className="mx-auto max-w-2xl text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500">Verification Failed</p>
            <h2 className="text-2xl font-black text-gray-900">We could not safely open the admin route</h2>
            <p className="text-sm font-semibold leading-relaxed text-gray-500">{routeState.message}</p>
          </div>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={handleRetry}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFD700] transition-all hover:bg-black"
            >
              <RefreshCcw className="h-4 w-4" /> Retry verification
            </button>
            <button
              onClick={onExit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
            >
              <AlertTriangle className="h-4 w-4" /> Exit to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminErrorBoundary onRetry={handleRetry} onExit={onExit}>
      <AdminPanel
        user={routeState.user}
        onRefreshCore={onRefreshCore}
        onAuthFailure={handleAdminAuthFailure}
      />
    </AdminErrorBoundary>
  );
}
