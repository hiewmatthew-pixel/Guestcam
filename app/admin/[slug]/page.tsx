import BirdLogo from '@/components/BirdLogo';
import { isAdminAuthed } from '../actions';
import LoginForm from '../LoginForm';
import AdminEventDetail from './AdminEventDetail';

export default async function AdminEventPage({ params }: { params: { slug: string } }) {
  const authed = await isAdminAuthed();

  return (
    <main className="min-h-screen">
      <header className="px-6 pt-8 flex items-center gap-3">
        <BirdLogo className="h-5 w-8 text-ink" />
        <span className="text-[11px] tracking-widest uppercase text-ink/70">
          Golden Glance · Admin
        </span>
      </header>

      <section className="px-6 py-10">
        {!authed ? (
          <div className="max-w-sm mx-auto pt-16">
            <h1 className="font-serif italic text-4xl text-center">sign in</h1>
            <div className="mt-10 flex justify-center">
              <LoginForm />
            </div>
          </div>
        ) : (
          <AdminEventDetail slug={params.slug} />
        )}
      </section>
    </main>
  );
}
