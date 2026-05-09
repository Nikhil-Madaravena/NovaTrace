import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Shield, Radio } from 'lucide-react';
import { authApi } from './api';

interface Props { onAuth: (token: string, email: string) => void; }

const DEMO_CREDS = [
  { role: 'Admin', email: 'admin@novatrace.io', password: 'admin123', color: '#06b6d4' },
  { role: 'Viewer', email: 'viewer@novatrace.io', password: 'viewer123', color: '#8b5cf6' },
];

export default function AuthPage({ onAuth }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fn = mode === 'login' ? authApi.login : authApi.register;
      const { data } = await fn(email, password);
      localStorage.setItem('nx_token', data.token);
      onAuth(data.token, data.user.email);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (cred: typeof DEMO_CREDS[0]) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setMode('login');
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#050816] flex items-center justify-center relative overflow-hidden">
      <div className="grid-bg" />
      <div className="spotlight" />

      {/* Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg,#06b6d4,#8b5cf6)' }}>
            <Radio className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">NovaTrace</h1>
          <p className="text-slate-500 text-sm mt-1">Distributed Infrastructure Intelligence</p>
        </div>

        {/* Demo credentials */}
        <div className="mb-4 space-y-2">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-mono text-center mb-2">Quick Demo Access</p>
          {DEMO_CREDS.map(c => (
            <button key={c.role} onClick={() => fillDemo(c)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl glass hover:border-white/10 transition-all text-xs group">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                <span className="text-slate-400 font-mono">{c.email}</span>
              </span>
              <span className="font-bold px-2 py-0.5 rounded-lg text-[10px]"
                style={{ background: `${c.color}20`, color: c.color }}>
                {c.role}
              </span>
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-white/[0.03] p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 capitalize ${
                  mode === m ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-400'
                }`}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@novatrace.io" required
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-slate-600
                  bg-white/[0.04] border border-white/[0.06] focus:border-cyan-500/40
                  focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                  className="w-full px-4 py-2.5 pr-10 rounded-xl text-sm text-white placeholder-slate-600
                    bg-white/[0.04] border border-white/[0.06] focus:border-cyan-500/40
                    focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {error}
              </motion.p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200
                disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#06b6d4,#8b5cf6)' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-2 text-xs text-slate-700">
            <Shield className="w-3 h-3" />
            <span>JWT secured · TLS 1.3 · Bcrypt hashed</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
