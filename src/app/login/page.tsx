// app/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      setError('Credenciales inválidas. Por favor, verifica tu email y contraseña.');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Fondo */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#334155_0%,_#0f172a_55%,_#020617_100%)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />
      <div
        className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-[400px] animate-[fadeInUp_0.45s_ease-out]">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]">
          {/* Marca */}
          <div className="bg-black px-8 py-6 flex justify-center border-b border-white/10">
            <img
              src="/images/logo-fondo-negro.png"
              alt="Nóbile - Tecnología y Servicios del Automotor"
              width={615}
              height={220}
              className="w-[88%] max-w-[280px] h-auto aspect-[615/220] object-contain"
            />
          </div>

          <div className="px-7 pt-6 pb-7">
            <p className="text-center text-sm text-slate-500 mb-6">
              Acceso al panel de intervenciones
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="tu@email.com"
                  className="block w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400
                    focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    transition duration-150"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="block w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400
                    focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    transition duration-150"
                />
              </div>

              {error && (
                <div className="p-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg animate-[fadeIn_0.2s_ease-out]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 mt-1 rounded-lg text-sm font-semibold text-white
                  bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                  disabled:opacity-70 disabled:cursor-not-allowed
                  transition duration-150 shadow-sm shadow-blue-600/25"
              >
                {loading ? 'Ingresando…' : 'Iniciar Sesión'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Nóbile · Tecnología y servicios del automotor
        </p>
      </div>
    </div>
  );
}
