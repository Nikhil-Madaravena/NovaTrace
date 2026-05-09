import { useState, useEffect } from 'react';
import App from './App';
import AuthPage from './AuthPage';
import { authApi } from './api';

export default function Root() {
  const [auth, setAuth] = useState<{ token: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('nx_token');
    if (token) {
      authApi.me()
        .then(res => setAuth({ token, email: res.data.email }))
        .catch(() => {
          localStorage.removeItem('nx_token');
          setAuth(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#050816] flex items-center justify-center">
        <div className="animate-pulse w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return <AuthPage onAuth={(token, email) => setAuth({ token, email })} />;
  }

  return <App userEmail={auth.email} onLogout={() => { localStorage.removeItem('nx_token'); setAuth(null); }} />;
}
