"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      router.push('/');
    } else {
      setError(error.message);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 w-96"
      >
        <h1 className="text-2xl font-bold mb-6 text-slate-900">CRM Login</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
          required
        />
        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-2 rounded-md hover:bg-slate-800 transition-colors font-medium"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
