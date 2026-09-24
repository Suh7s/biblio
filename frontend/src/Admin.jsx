import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from './api.js';

const links = [
  ['/admin', 'Overview'], ['/admin/users', 'Users'], ['/admin/borrowings', 'Borrowings'], ['/admin/analytics', 'Analytics']
];
const errMsg = error => error.response?.data?.message || 'Unable to load admin data. Sign in with an admin account and try again.';
function useAdminData(path, params) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  const query = new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([, value]) => value !== ''))).toString();
  React.useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', data: null });
    api.get(`${path}${query ? `?${query}` : ''}`).then(response => active && setState({ loading: false, error: '', data: response.data.data })).catch(error => active && setState({ loading: false, error: errMsg(error), data: null }));
    return () => { active = false; };
  }, [path, query]);
  return state;
}
function AdminShell({ children, title, description }) {
  return <main className="page admin-console"><div className="breadcrumb">LIBRARY TOOLS <span>/</span> ADMINISTRATION</div>
    <div className="admin-title"><div><div className="eyebrow">BIBLIO ADMIN</div><h1>{title}</h1><p>{description}</p></div><Link className="admin-book-link" to="/admin/books">Manage books <span>↗</span></Link></div>
    <nav className="admin-nav">{links.map(([to, label]) => <NavLink end={to === '/admin'} key={to} to={to}>{label}</NavLink>)}<Link to="/admin/books">Book management ↗</Link></nav>{children}
  </main>;
}
function LoadState({ loading, error, children }) {
  if (loading) return <div className="state"><span className="spinner"/>Loading admin data…</div>;
  if (error) return <div className="admin-error" role="alert">{error}</div>;
  return children;
}
function StatCard({ label, value, detail }) { return <div className="stat-card"><span>{label}</span><strong>{value ?? '—'}</strong>{detail && <small>{detail}</small>}</div>; }
function Bars({ title, rows, valueLabel = 'items' }) {
  const max = Math.max(1, ...(rows || []).map(row => row.count));
  return <section className="admin-panel"><div className="admin-panel-head"><h2>{title}</h2><span>LAST 12 MONTHS</span></div>{rows?.length ? <div className="trend-chart" role="img" aria-label={title}>{rows.map(row => <div className="trend-column" key={row.month} title={`${row.month}: ${row.count} ${valueLabel}`}><div className="trend-bar-wrap"><i style={{ height: `${Math.max(row.count ? 5 : 0, row.count / max * 100)}%` }}/></div><span>{row.month.slice(5)}</span></div>)}</div> : <p className="admin-muted">No activity recorded yet.</p>}</section>;
}
function DataRows({ rows, empty, render }) { return rows?.length ? <div className="admin-rows">{rows.map((row, index) => <div className="admin-row" key={row._id || row.month || index}>{render(row, index)}</div>)}</div> : <p className="admin-muted">{empty}</p>; }

function PageControls({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  return <nav className="pagination" aria-label="Table pages"><button disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous page</button><span>Page {pagination.page} of {pagination.pages}</span><button disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next page</button></nav>;
}

export function AdminDashboard() {
  const { loading, error, data } = useAdminData('/admin/dashboard');
  return <AdminShell title="Library overview" description="A live view of circulation, readers, and collection health."><LoadState loading={loading} error={error}>{data && <>
    <div className="admin-stats"><StatCard label="BOOKS IN CATALOGUE" value={data.totalBooks?.toLocaleString()}/><StatCard label="REGISTERED USERS" value={data.totalUsers?.toLocaleString()}/><StatCard label="ACTIVE BORROWINGS" value={data.activeBorrowings?.toLocaleString()}/><StatCard label="OVERDUE" value={data.overdue?.toLocaleString()}/><StatCard label="ACTIVE RESERVATIONS" value={data.activeReservations?.toLocaleString()}/><StatCard label="OUTSTANDING FINES" value={Number(data.outstandingFines || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} detail={`${data.unpaidFineCount || 0} unpaid fines`}/></div>
    <div className="admin-grid"><section className="admin-panel"><div className="admin-panel-head"><h2>Popular books</h2><Link to="/admin/analytics">View analytics →</Link></div><DataRows rows={data.popularBooks} empty="Borrowing activity will appear here." render={book => <><span className="row-rank">{String(data.popularBooks.indexOf(book) + 1).padStart(2, '0')}</span><div className="row-main"><strong>{book.title}</strong><small>{book.authors?.join(', ')}</small></div><span className="row-value">{book.borrowCount} loans</span></>}/></section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Popular categories</h2></div><DataRows rows={data.popularCategories} empty="No category activity recorded." render={item => <><div className="row-main"><strong>{item.category || 'Uncategorised'}</strong></div><span className="row-value">{item.borrowCount} loans</span></>}/></section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Overdue books</h2><Link to="/admin/borrowings?status=OVERDUE">View all →</Link></div><DataRows rows={data.overdueBooks} empty="No books are overdue." render={item => <><div className="row-main"><strong>{item.book?.title || 'Book record unavailable'}</strong><small>{item.user?.name || item.user?.email || 'Library user'} · due {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}</small></div><span className="row-status overdue">OVERDUE</span></>}/></section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Low inventory</h2><Link to="/admin/books">Manage catalogue →</Link></div><DataRows rows={data.lowInventory} empty="All titles currently have healthy availability." render={book => <><div className="row-main"><strong>{book.title}</strong><small>{book.category} · {book.shelfLocation || 'No shelf location'}</small></div><span className="row-status low-stock">{book.availableCopies}/{book.totalCopies} left</span></>}/></section></div>
    <section className="admin-panel recent-panel"><div className="admin-panel-head"><h2>Recent activity</h2><Link to="/admin/borrowings">All borrowings →</Link></div><DataRows rows={data.recentActivity} empty="No circulation activity recorded." render={item => <><div className="row-main"><strong>{item.book?.title || 'Book record unavailable'}</strong><small>{item.user?.name || item.user?.email || 'Library user'} · {item.borrowedAt ? new Date(item.borrowedAt).toLocaleString() : '—'}</small></div><span className={`row-status ${item.status?.toLowerCase()}`}>{item.status}</span></>}/></section>
  </>}</LoadState></AdminShell>;
}

export function AdminUsers() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState(''); const [role, setRole] = React.useState('');
  const { loading, error, data } = useAdminData('/admin/users', { search, role, page, limit: 50 });
  return <AdminShell title="User management" description="Find readers and review account roles."><div className="admin-filters"><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={e => { setPage(1); setSearch(e.target.value); }}/><select aria-label="Filter by role" value={role} onChange={e => { setPage(1); setRole(e.target.value); }}><option value="">All roles</option><option value="USER">User</option><option value="ADMIN">Admin</option></select></div><LoadState loading={loading} error={error}>{data && <><div className="admin-list-caption">{data.pagination.total} accounts</div><section className="admin-panel"><div className="admin-table-head"><span>NAME</span><span>EMAIL</span><span>ROLE</span><span>JOINED</span></div><DataRows rows={data.users} empty="No users match this search." render={user => <><div className="row-main"><strong>{user.name || 'Unnamed user'}</strong></div><span className="user-email">{user.email}</span><span className={`role-pill ${String(user.role).toLowerCase()}`}>{user.role}</span><span className="user-date">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</span></>}/></section><PageControls pagination={data.pagination} onPage={setPage}/></>}</LoadState></AdminShell>;
}

export function AdminBorrowings() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState(new URLSearchParams(window.location.search).get('status') || '');
  const { loading, error, data } = useAdminData('/admin/borrowings', { status, page, limit: 50 });
  return <AdminShell title="Borrowing overview" description="Review active loans, due dates, and recent returns."><div className="admin-filters"><select aria-label="Filter by borrowing status" value={status} onChange={e => { setPage(1); setStatus(e.target.value); }}><option value="">All statuses</option><option value="BORROWED">Borrowed</option><option value="OVERDUE">Overdue</option><option value="RETURNED">Returned</option></select></div><LoadState loading={loading} error={error}>{data && <><div className="admin-list-caption">{data.pagination.total} borrowings</div><section className="admin-panel"><div className="admin-table-head borrowing-table"><span>BOOK</span><span>READER</span><span>BORROWED</span><span>DUE DATE</span><span>STATUS</span></div><DataRows rows={data.borrowings} empty="No borrowing records found." render={item => <><div className="row-main"><strong>{item.book?.title || 'Book record unavailable'}</strong><small>{item.book?.authors?.join(', ')}</small></div><span className="user-email">{item.user?.name || item.user?.email || 'Unknown user'}{item.user?.name && item.user?.email && <small>{item.user.email}</small>}</span><span className="user-date">{item.borrowedAt ? new Date(item.borrowedAt).toLocaleDateString() : '—'}</span><span className="user-date">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}</span><span className={`row-status ${item.status?.toLowerCase()}`}>{item.status}</span></>}/></section><PageControls pagination={data.pagination} onPage={setPage}/></>}</LoadState></AdminShell>;
}

export function AdminAnalytics() {
  const { loading, error, data } = useAdminData('/admin/analytics');
  return <AdminShell title="Inventory analytics" description="Track demand, circulation trends, and collection utilization."><LoadState loading={loading} error={error}>{data && <>
    <div className="admin-grid analytics-grid"><Bars title="Borrowing trends" rows={data.borrowingTrends}/><Bars title="Overdue trends" rows={data.overdueTrends}/><Bars title="Reservation demand" rows={data.reservationDemand}/></div>
    <div className="admin-grid"><section className="admin-panel"><div className="admin-panel-head"><h2>Most borrowed books</h2></div><DataRows rows={data.mostBorrowedBooks} empty="No borrowing history yet." render={(book, index) => <><span className="row-rank">{String(index + 1).padStart(2, '0')}</span><div className="row-main"><strong>{book.title}</strong><small>{book.category} · {book.authors?.join(', ')}</small></div><span className="row-value">{book.borrowCount}</span></>}/></section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Popular categories</h2></div><DataRows rows={data.popularCategories} empty="No category activity yet." render={item => <><div className="row-main"><strong>{item.category || 'Uncategorised'}</strong></div><span className="row-value">{item.borrowCount} loans</span></>}/></section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Low availability</h2></div><DataRows rows={data.lowAvailability} empty="No titles below the availability threshold." render={book => <><div className="row-main"><strong>{book.title}</strong><small>{book.category}</small></div><span className="row-status low-stock">{book.availableCopies}/{book.totalCopies}</span></>}/></section>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Inactive inventory</h2><span>NO LOANS IN 12 MONTHS</span></div><DataRows rows={data.inactiveInventory} empty="All titles have recent borrowing activity." render={book => <><div className="row-main"><strong>{book.title}</strong><small>{book.category} · {book.shelfLocation || 'No shelf location'}</small></div><span className="row-value">{book.availableCopies}/{book.totalCopies} available</span></>}/></section></div>
  </>}</LoadState></AdminShell>;
}
