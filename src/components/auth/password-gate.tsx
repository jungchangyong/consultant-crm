'use client';

import { useState, useEffect } from 'react';
import { Building2, Lock } from 'lucide-react';

const CORRECT_PASSWORD = 'secret123';
const STORAGE_KEY = 'crm-authenticated';

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem(STORAGE_KEY) === 'true') {
      setAuthenticated(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      setAuthenticated(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  // SSR 깜빡임 방지
  if (!mounted) return null;

  if (authenticated) return <>{children}</>;

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-white p-8 shadow-sm"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
            표준사업장 시뮬레이터
          </h1>
          <p className="text-sm text-muted-foreground">접속하려면 비밀번호를 입력하세요</p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="비밀번호"
              autoFocus
              className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">비밀번호가 올바르지 않습니다.</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          접속
        </button>
      </form>
    </div>
  );
}
