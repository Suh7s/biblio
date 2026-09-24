import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import './auth.css';

const AuthContext = React.createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const refresh = React.useCallback(async () => {
    try { const r = await api.get('/auth/me'); setUser(r.data.data.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  const login = async credentials => { const r = await api.post('/auth/login', credentials); setUser(r.data.data.user); return r.data.data.user; };
  const register = async details => (await api.post('/auth/register', details)).data.data.user;
  const logout = async () => { try { await api.post('/auth/logout'); } finally { setUser(null); } };
  return <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => React.useContext(AuthContext);

export function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <main className="page"><div className="auth-loading">Checking your session…</div></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.role !== role) return <main className="page"><section className="auth-card auth-denied"><div className="eyebrow">ACCESS RESTRICTED</div><h1>Administrator access required</h1><p>Your account does not have permission to open this page.</p><Link className="auth-submit" to="/books">Return to catalogue</Link></section></main>;
  return children;
}

function AuthForm({ mode }) {
  const isRegister = mode === 'register'; const { login, register } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true); const form = new FormData(e.currentTarget);
    const values = Object.fromEntries(form.entries());
    try {
      if (isRegister) await register(values);
      await login({ email: values.email, password: values.password });
      navigate(location.state?.from?.pathname || '/profile', { replace: true });
    } catch (err) { setError(err.response?.data?.message || 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="page auth-page"><section className="auth-card"><div className="eyebrow">LIBRAMIND · UNIVERSITY LIBRARY</div><h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1><p>{isRegister ? 'Join the community and start building your reading history.' : 'Sign in to continue to your library.'}</p><form onSubmit={submit}>
    {isRegister && <label>Name<input name="name" autoComplete="name" minLength="2" required/></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required/></label>
    <label>Password<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : 1} required/></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}</button>
  </form><div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to LibraMind?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div></section></main>;
}
export function LoginPage() { return <AuthForm mode="login"/>; }
export function RegisterPage() { return <AuthForm mode="register"/>; }

export function ProfilePage() {
  const { user, refresh } = useAuth(); const [name, setName] = React.useState(user?.name || ''); const [interests, setInterests] = React.useState(user?.interests?.join(', ') || ''); const [message, setMessage] = React.useState('');
  React.useEffect(() => { setName(user?.name || ''); setInterests(user?.interests?.join(', ') || ''); }, [user]);
  async function save(e) { e.preventDefault(); setMessage(''); try { await api.patch('/users/me', { name, interests: interests.split(',').map(x => x.trim()).filter(Boolean) }); await refresh(); setMessage('Profile saved.'); } catch (err) { setMessage(err.response?.data?.message || 'Could not save your profile.'); } }
  return <main className="page auth-page"><section className="auth-card profile-card"><div className="eyebrow">YOUR ACCOUNT</div><h1>Profile</h1><p>Manage your account details and reading interests.</p><form onSubmit={save}><label>Name<input value={name} onChange={e => setName(e.target.value)} minLength="2" required/></label><label>Email<input value={user.email} readOnly/></label><label>Role<input value={user.role} readOnly/></label><label>Interests <small>Separate interests with commas</small><textarea rows="3" value={interests} onChange={e => setInterests(e.target.value)}/></label><button className="auth-submit">Save profile</button>{message && <p className="auth-message" role="status">{message}</p>}</form></section></main>;
}
