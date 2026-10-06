'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkAdminPassword } from './actions';

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          const res = await checkAdminPassword(fd);
          if (res.ok) router.refresh();
          else setError(res.error ?? 'Try again.');
        })
      }
      className="max-w-sm w-full"
    >
      <label htmlFor="admin-password" className="block text-[10px] uppercase tracking-widest text-ink/70 mb-2">
        admin password
      </label>
      <input
        id="admin-password"
        type="password"
        name="password"
        autoComplete="current-password"
        autoFocus
        className="w-full bg-transparent border-b border-warm-gray-light focus:border-gold-deep py-2"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="mt-8 w-full bg-ink text-cream py-3 text-xs uppercase tracking-widest disabled:opacity-60"
      >
        {pending ? 'checking…' : 'enter'}
      </button>
    </form>
  );
}
