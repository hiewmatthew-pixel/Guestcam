import Link from 'next/link';
import Logo from '@/components/Logo';
import { isAdminAuthed } from './actions';
import LoginForm from './LoginForm';
import AdminEventList from './AdminEventList';

export default async function AdminPage() {
  const authed = await isAdminAuthed();

  return (
    <main className="min-h-screen">
      <header className="px-6 pt-8 flex items-center gap-3">
        <Link
          href="/"
          aria-label="back to home"
          className="flex items-center gap-3 group"
        >
          <Logo className="h-5 w-8 text-ink" />
          <span className="text-[11px] tracking-widest uppercase text-ink/70 group-hover:text-ink transition-colors">
            Golden Glance · Admin
          </span>
        </Link>
      </header>

      <section className="px-6 py-10">
        {!authed ? (
          <div className="max-w-sm mx-auto pt-16">
            <h1 className="font-serif italic text-4xl text-center">welcome back</h1>
            <p className="mt-3 text-center text-ink/60">
              sign in to manage your events
            </p>
            <div className="mt-10 flex justify-center">
              <LoginForm />
            </div>
          </div>
        ) : (
          <AdminEventList />
        )}
      </section>
    </main>
  );
}
