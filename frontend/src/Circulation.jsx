import React from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import './circulation.css';

function useResource(path, key) {
  const [pagination, setPagination] = React.useState(null); const [items, setItems] = React.useState([]); const [error, setError] = React.useState(''); const [loading, setLoading] = React.useState(true); const [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => { let live = true; setLoading(true); setError(''); api.get(path).then(r => { if (live) { setItems(r.data.data[key] || []); setPagination(r.data.data.pagination); } }).catch(e => { if (live) setError(e.response?.data?.message || 'Could not load this information. Sign in and try again.'); }).finally(() => live && setLoading(false)); return () => { live=false; }; }, [path, key, refresh]);
  return { items, pagination, error, loading, reload: () => setRefresh(v => v + 1), setItems };
}
function Message({ text, error }) { return <div role={error ? 'alert' : 'status'} className={error ? 'circ-message circ-error' : 'circ-message'}>{text}</div>; }
function Empty({ children }) { return <div className="circ-empty"><span>✳</span><p>{children}</p></div>; }
function State({ loading, error }) { if (loading) return <Message text="Loading your library…"/>; if (error) return <Message text={error} error/>; return null; }
function BookTitle({ book }) { return book ? <Link to={`/books/${book._id}`} className="circ-book"><span className="circ-thumb">{book.coverImage ? <img src={book.coverImage} alt=""/> : 'L'}</span><span><strong>{book.title}</strong><small>{book.authors?.join(', ')}</small></span></Link> : <span className="circ-book">Book details unavailable</span>; }
function LoanStatus({ loan }) { const overdue = loan.status === 'OVERDUE' || (loan.status === 'BORROWED' && new Date(loan.dueDate) < new Date()); return <span className={`circ-status ${overdue ? 'late' : loan.status === 'RETURNED' ? 'closed' : 'open'}`}>{overdue ? 'Overdue' : loan.status === 'RETURNED' ? 'Returned' : 'On loan'}</span>; }
function NoticeList({ onChange }) {
  const state = useResource('/notifications', 'notifications');
  const [actionError, setActionError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  async function markRead(item) { setBusy(true); setActionError(''); try { await api.patch(`/notifications/${item._id}/read`); state.setItems(items => items.map(n => n._id === item._id ? { ...n, read: true } : n)); onChange?.(); } catch { setActionError('Could not mark the notification as read. Try again.'); } finally { setBusy(false); } }
  if (state.loading) return <Message text="Loading notifications…"/>;
  if (state.error) return <section><Message text={state.error} error/><button onClick={state.reload}>Retry notifications</button></section>;
  if (!state.items.length) return null;
  return <section className="circ-section notice-section"><div className="circ-section-head"><div><div className="circ-kicker">FROM THE LIBRARY</div><h2>Notifications</h2></div></div>{actionError && <Message text={actionError} error/>}{state.items.slice(0,5).map(n => <article className={`notice-row ${n.read ? '' : 'unread'}`} key={n._id}><span className="notice-dot"/><div><strong>{n.title}</strong><p>{n.message}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div>{!n.read && <button disabled={busy} onClick={() => markRead(n)}>Mark read</button>}</article>)}</section>;
}
export function MyLibrary() {
  const { items, error, loading, reload } = useResource('/borrow/my', 'borrows'); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false); const active = items.filter(b => ['BORROWED','OVERDUE'].includes(b.status)); const history = items.filter(b => b.status === 'RETURNED');
  async function action(id, type) { setBusy(true); setMessage(''); try { const r = await api.patch(`/borrow/${id}/${type}`); setMessage(r.data.message + (r.data.data?.fine ? ` Fine: ${r.data.data.fine.amount}.` : '')); reload(); } catch (e) { setMessage(e.response?.data?.message || 'Unable to update this loan.'); } finally { setBusy(false); } }
  return <main className="page circ-page"><div className="breadcrumb">YOUR ACCOUNT <span>/</span> MY LIBRARY</div><div className="circ-title"><div><div className="circ-kicker">YOUR READING DESK</div><h1>My library</h1><p>Keep track of the books you have borrowed and what you have read.</p></div><div className="circ-count"><strong>{active.length}</strong><span>ACTIVE<br/>LOANS</span></div></div>{message && <Message text={message}/>}<State loading={loading} error={error}/>{!loading && !error && <><section className="circ-section"><div className="circ-section-head"><div><div className="circ-kicker">IN YOUR HANDS</div><h2>Current loans <span>{active.length}</span></h2></div><Link to="/reservations">Reservations →</Link></div>{active.length ? <div className="loan-table"><div className="loan-table-head"><span>BOOK</span><span>STATUS</span><span>DUE DATE</span><span>ACTIONS</span></div>{active.map(loan => <article className="loan-row" key={loan._id}><BookTitle book={loan.book}/><LoanStatus loan={loan}/><div className={loan.status === 'OVERDUE' || new Date(loan.dueDate) < new Date() ? 'due-date overdue-date' : 'due-date'}>{new Date(loan.dueDate).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</div><div className="loan-actions"><button disabled={busy} onClick={() => action(loan._id,'renew')}>Renew</button><button disabled={busy} onClick={() => action(loan._id,'return')}>Return</button></div></article>)}</div> : <Empty>You do not have any active loans. Explore the <Link to="/books">catalogue</Link> to find your next read.</Empty>}</section><section className="circ-section history-section"><div className="circ-section-head"><div><div className="circ-kicker">YOUR READING TRAIL</div><h2>Borrow history <span>{history.length}</span></h2></div></div>{history.length ? history.map(loan => <article className="history-row" key={loan._id}><BookTitle book={loan.book}/><span>Borrowed {new Date(loan.borrowedAt).toLocaleDateString()}</span><span>Returned {loan.returnedAt ? new Date(loan.returnedAt).toLocaleDateString() : '—'}</span></article>) : <Empty>Returned books will appear here.</Empty>}</section></>}<NoticeList/></main>;
}
export function Reservations() {
  const { items, error, loading, reload } = useResource('/reservations/my','reservations'); const [message,setMessage]=React.useState(''); const [busy,setBusy]=React.useState(false);
  async function cancel(id) { setBusy(true); try { await api.delete(`/reservations/${id}`); setMessage('Reservation cancelled.'); reload(); } catch(e) { setMessage(e.response?.data?.message || 'Unable to cancel reservation.'); } finally { setBusy(false); } }
  async function collect(bookId) { setBusy(true); setMessage(''); try { await api.post(`/borrow/${bookId}`); setMessage('Book collected. View it in My library.'); reload(); } catch(e) { setMessage(e.response?.data?.message || 'Unable to collect this reservation.'); } finally { setBusy(false); } }
  const active=items.filter(r => ['WAITING','READY'].includes(r.status));
  return <main className="page circ-page"><div className="breadcrumb"><Link to="/my-library">MY LIBRARY</Link> <span>/</span> RESERVATIONS</div><div className="circ-title"><div><div className="circ-kicker">YOUR PLACE IN LINE</div><h1>Reservations</h1><p>We will let you know when a copy is ready to collect.</p></div></div>{message && <Message text={message}/>}<State loading={loading} error={error}/>{!loading && !error && (active.length ? <section className="circ-section">{active.map(r => <article className="reservation-row" key={r._id}><BookTitle book={r.book}/><div><span className={`circ-status ${r.status === 'READY' ? 'open' : 'queued'}`}>{r.status === 'READY' ? 'Ready for pickup' : `Queue position ${r.position}`}</span>{r.expiresAt && <small className="reservation-expiry">Collect by {new Date(r.expiresAt).toLocaleDateString()}</small>}</div><div>{r.status === 'READY' && r.book && <button disabled={busy} onClick={() => collect(r.book._id)}>Collect reserved copy</button>}<button disabled={busy} onClick={() => cancel(r._id)}>Cancel reservation</button></div></article>)}</section> : <Empty>You have no active reservations. Unavailable titles can be reserved from their <Link to="/books">book details page</Link>.</Empty>)}<NoticeList/></main>;
}
export function Fines() {
  const { items, error, loading } = useResource('/fines/my','fines'); const total = items.filter(f => f.status === 'UNPAID').reduce((sum, f) => sum + f.amount, 0);
  return <main className="page circ-page"><div className="breadcrumb"><Link to="/my-library">MY LIBRARY</Link> <span>/</span> FINES</div><div className="circ-title"><div><div className="circ-kicker">ACCOUNT SUMMARY</div><h1>Fines</h1><p>Overdue charges from your library loans.</p></div><div className="fine-total"><span>UNPAID BALANCE</span><strong>{total.toFixed(2)}</strong></div></div><State loading={loading} error={error}/>{!loading && !error && (items.length ? <section className="circ-section fine-list">{items.map(f => <article className="fine-row" key={f._id}><div><strong>{f.borrow?.book?.title || 'Library loan'}</strong><p>{f.reason}</p><small>{new Date(f.createdAt).toLocaleDateString()}</small></div><span className={`fine-status ${f.status === 'PAID' ? 'closed' : 'late'}`}>{f.status}</span><strong className="fine-amount">{f.amount.toFixed(2)}</strong></article>)}</section> : <Empty>No fines on your account.</Empty>)}<NoticeList/></main>;
}

export function SavedBooks() {
  const [page, setPage] = React.useState(1);
  const state = useResource(`/users/me/saved-books?page=${page}&limit=25`, 'savedBooks');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  async function remove(id) {
    setBusy(true); setMessage('');
    try { await api.delete(`/users/me/saved-books/${id}`); if (state.items.length === 1 && page > 1) setPage(page - 1); else state.reload(); }
    catch (e) { setMessage(e.response?.data?.message || 'Could not remove this saved book.'); }
    finally { setBusy(false); }
  }
  return <main className="page circ-page"><div className="circ-title"><div><div className="circ-kicker">YOUR READING LIST</div><h1>Saved books</h1><p>Keep resources for later and shape your biblio AI recommendations.</p></div></div>
    {message && <Message text={message} error/>}<State loading={state.loading} error={state.error}/>
    {!state.loading && !state.error && (state.items.length ? <section className="circ-section">{state.items.map(item => <article className="reservation-row" key={item._id}><BookTitle book={item.book}/>{item.book && <button disabled={busy} onClick={() => remove(item.book._id)}>Remove saved book</button>}</article>)}</section> : <Empty>No saved books yet. Save resources from their <Link to="/books">book details page</Link>.</Empty>)}
    {state.pagination?.pages > 1 && <nav className="pagination" aria-label="Saved books pages"><button disabled={page <= 1 || state.loading} onClick={() => setPage(page - 1)}>Previous page</button><span>Page {page} of {state.pagination.pages}</span><button disabled={page >= state.pagination.pages || state.loading} onClick={() => setPage(page + 1)}>Next page</button></nav>}
  </main>;
}
