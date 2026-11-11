"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { EyeIcon, EyeOffIcon, RadarIcon } from '@/components/Icons';
import { Banner, Button, Field, IconButton, Input } from '@/components/ui';
import { ThemeMenu } from '@/components/shell/TopbarMenus';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/');
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.replace('/');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--border-strong) / 0.55) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 45%, black 25%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 45%, black 25%, transparent 78%)',
        }}
      />
      <div className="absolute right-3 top-3 sm:right-5 sm:top-4">
        <ThemeMenu />
      </div>

      <main className="relative w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-on shadow-float">
            <RadarIcon className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold text-fg">Sign in to Lead Radar</h1>
          <p className="mt-1 text-sm text-fg-muted">Find, win and manage leads in one place.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 rounded-card border border-border bg-surface p-5 shadow-float sm:p-6">
          {error && (
            <Banner tone="danger" title="Could not sign in">
              <span className="break-words">{error}</span>
            </Banner>
          )}

          <Field label="Email" htmlFor="login-email">
            <Input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </Field>

          <Field label="Password" htmlFor="login-password">
            <div className="relative">
              <Input
                id="login-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-11"
                required
              />
              <span className="absolute right-1 top-1/2 -translate-y-1/2">
                <IconButton label={show ? 'Hide password' : 'Show password'} size="sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>
                  {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </IconButton>
              </span>
            </div>
          </Field>

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-fg-subtle">Use the account you created for this workspace.</p>
      </main>
    </div>
  );
}
