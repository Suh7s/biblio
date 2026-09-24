import React from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../Auth.jsx';
import { Icon } from './Icon.jsx';

const readerLinks = [
  ['/books', 'Catalogue', 'book'], ['/my-library', 'My library', 'shelf'],
  ['/reservations', 'Reservations', 'clock'], ['/saved-books', 'Saved books', 'heart'],
  ['/fines', 'Fines', 'wallet'], ['/ai', 'biblio AI', 'spark'],
];
export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [query, setQuery] = React.useState('');
  const [logoutError, setLogoutError] = React.useState('');
  const [loggingOut, setLoggingOut] = React.useState(false);
  const searchRef = React.useRef(null);
  React.useEffect(() => {
    if (location.pathname === '/books') setQuery(new URLSearchParams(location.search).get('search') || '');
  }, [location.pathname, location.search]);
  React.useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && searchRef.current) {
        event.preventDefault(); searchRef.current.focus(); searchRef.current.select();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  async function signOut() {
    setLoggingOut(true); setLogoutError('');
    try { await logout(); navigate('/login'); }
    catch { setLogoutError('Sign out failed. Please try again.'); }
    finally { setLoggingOut(false); }
  }
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header">
      <div className="topbar">
        <Link className="brand" to="/books" aria-label="biblio home"><img src="/brand-mark.svg" alt="" width="38" height="38"/><span>biblio<span className="brand-dot">.</span></span></Link>
        {user ? <>
          <form className="header-search" role="search" onSubmit={event => { event.preventDefault(); navigate(`/books?search=${encodeURIComponent(query.trim())}`); }}>
            <Icon name="search" size={19}/><input ref={searchRef} aria-label="Search books" placeholder="Find a book, author, or a new idea…" value={query} onChange={event => setQuery(event.target.value)}/><kbd title="Control or Command + K">⌘ / Ctrl K</kbd>
          </form>
          <div className="account-nav"><Link to="/profile" className="profile-nav"><span className="user-initial">{user.name?.trim().charAt(0) || 'R'}</span><span className="profile-name">{user.name}<small>{user.role === 'ADMIN' ? 'Library administrator' : 'Your reading space'}</small></span></Link><button className="sign-out" disabled={loggingOut} onClick={signOut} title="Sign out" aria-label="Sign out"><Icon name="logout" size={19}/></button></div>
        </> : <div className="guest-nav"><span className="header-tagline">A home for curious minds.</span><Link to="/login">Sign in</Link><Link className="guest-join" to="/register">Get started <Icon name="arrow" size={15}/></Link></div>}
      </div>
      {user && <div className="nav-shell"><nav className="primary-nav" aria-label="Main navigation">{readerLinks.map(([to, label, icon]) => <NavLink to={to} key={to} className={to === '/ai' ? 'nav-ai' : undefined}><Icon name={icon} size={17}/>{label}</NavLink>)}{user.role === 'ADMIN' && <><NavLink to="/admin" end><Icon name="grid" size={17}/>Admin</NavLink><NavLink to="/admin/books">Manage books</NavLink></>}</nav></div>}
    </header>
    {logoutError && <div className="session-error" role="alert">{logoutError}</div>}
  </>;
}
