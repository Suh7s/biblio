import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../src/models/User.js';
import BookChunk from '../../src/models/BookChunk.js';
import Borrow from '../../src/models/Borrow.js';
import Reservation from '../../src/models/Reservation.js';
import Notification from '../../src/models/Notification.js';
import Fine from '../../src/models/Fine.js';
import { expireReservations } from '../../src/services/circulation.js';
import { serverConfig } from '../../src/config/server.js';
import { startFixture, Client, password, bookInput, excerpt } from './fixture.js';
let fixture, admin, user, second, third, book, loan;
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.success, status < 400); if (status >= 400) assert.equal(typeof r.body.errors, 'object'); return r.body.data; };
async function account(email, role = 'USER') {
  const client = new Client(fixture.base);
  const data = ok(await client.post('/auth/register', { name: 'Integration User', email, password }), 201);
  assert.equal(data.user.role, 'USER'); assert.equal(data.user.password, undefined);
  if (role === 'ADMIN') await User.updateOne({ email }, { $set: { role } });
  ok(await client.post('/auth/login', { email, password })); client.id = data.user._id; return client;
}
async function newBook(suffix) { return ok(await admin.post('/books', { ...bookInput, isbn: `INTEGRATION-${suffix}` }), 201).book; }
async function inventory(id, available) { const b = ok(await user.get(`/books/${id}`)).book; assert.equal(b.availableCopies, available); assert.ok(b.availableCopies >= 0 && b.availableCopies <= b.totalCopies); }
before(async () => { fixture = await startFixture(); admin = await account('admin@integration.test', 'ADMIN'); user = await account('user@integration.test'); second = await account('second@integration.test'); third = await account('third@integration.test'); }, { timeout: 180000 });
after(async () => { await fixture?.close(); });
test('live and readiness health endpoints report service and database state safely', async () => {
  const origin = fixture.base.replace(/\/api\/v1$/, '');
  const live = await fetch(`${origin}/health/live`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  const ready = await fetch(`${origin}/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ok' });
});
test('Flow 1: registration, login, authenticated request, logout and replay rejection over HTTP', async () => {
  const client = await account('logout@integration.test'); ok(await client.get('/users/me')); const cookie = client.cookie;
  ok(await client.post('/auth/logout')); ok(await client.get('/auth/me'), 401); client.cookie = cookie; ok(await client.get('/auth/me'), 401);
  const login = await client.post('/auth/login', { email: 'logout@integration.test', password }); ok(login); assert.match(login.headers.get('set-cookie'), /HttpOnly/); ok(await client.get('/auth/me'));
});
test('Flow 2: admin login, create, update and delete a book', async () => {
  const b = await newBook('CRUD'); assert.equal(b.circulationVersion, undefined);
  assert.equal(ok(await admin.patch(`/books/${b._id}`, { title: 'Updated title' })).book.title, 'Updated title');
  ok(await admin.delete(`/books/${b._id}`)); ok(await user.get(`/books/${b._id}`), 404); book = await newBook('MAIN');
});
test('Flow 3: user searches, views, borrows and inventory decreases', async () => {
  assert.ok(ok(await user.get('/books?search=Robotics')).books.some(b => b._id === book._id)); await inventory(book._id, 1);
  loan = ok(await user.post(`/borrow/${book._id}`), 201).borrow; await inventory(book._id, 0);
  ok(await user.post(`/borrow/${book._id}`), 409); ok(await user.post(`/reservations/${book._id}`), 409);
  ok(await admin.patch(`/books/${book._id}`, { availableCopies: 1 }), 409); ok(await admin.delete(`/books/${book._id}`), 409);
});
test('Flow 4: owner returns, inventory increases and duplicate return is rejected', async () => {
  ok(await second.patch(`/borrow/${loan._id}/return`), 404); ok(await user.patch(`/borrow/${loan._id}/return`)); await inventory(book._id, 1);
  ok(await user.patch(`/borrow/${loan._id}/return`), 409); await inventory(book._id, 1);
});
test('Flow 5: USER cannot use ADMIN routes or impersonate administrator', async () => {
  for (const path of ['/admin/dashboard', '/admin/analytics', '/admin/users', '/admin/borrowings', '/admin/reservations']) ok(await user.get(path), 403);
  ok(await user.post('/books', bookInput), 403); ok(await user.patch('/users/me', { role: 'ADMIN' }), 400);
  ok(await user.post('/auth/register', { name: 'Escalation', email: 'bad@integration.test', password, role: 'ADMIN' }), 400);
  const client = new Client(fixture.base); client.cookie = `token=${jwt.sign({ id: user.id, role: 'ADMIN' }, process.env.JWT_SECRET)}`; ok(await client.get('/admin/dashboard'), 403);
});
test('Flow 6: source import, real BookChunks and vector ranking join current catalogue over HTTP', async () => {
  const body = { sourceId: 'notes', sections: [{ chapter: 'Chapter 1', section: 'Frames', content: excerpt }] };
  ok(await user.call('PUT', `/ai/books/${book._id}/chunks`, body), 403); ok(await admin.call('PUT', `/ai/books/${book._id}/chunks`, body));
  assert.equal(await BookChunk.countDocuments({ book: book._id }), 1);
  const results = ok(await user.get('/ai/search?q=How%20do%20robots%20perceive%20and%20navigate%3F')).results;
  assert.equal(results[0].book._id, book._id); assert.equal(results[0].book.availableCopies, 1); assert.ok(results[0].relevance >= 0.65); assert.ok(results[0].reason.includes('excerpt'));
  assert.equal(ok(await user.get('/ai/search?q=pastry%20baking')).results.length, 0);
});
test('Flow 7: RAG retrieves chunks, generates grounded answer and sources; rejects hallucinated citations', async () => {
  const data = ok(await user.post('/ai/ask', { query: 'I know Python and want to learn robotics' }));
  assert.equal(data.insufficientContext, false); assert.equal(data.books[0]._id, book._id); assert.equal(data.sources[0].chapter, 'Chapter 1'); assert.equal(data.sources[0].section, 'Frames'); assert.equal(data.sources[0].bookId, book._id); assert.ok(data.answer.includes(book.title));
  const requests = fixture.control.calls.filter(c => c.url.endsWith('/responses')); assert.ok(requests.at(-1).body.input[0].content.includes('Never invent books'));
  const insufficient = ok(await user.post('/ai/ask', { query: 'Teach me pastry baking' })); assert.equal(insufficient.insufficientContext, true); assert.deepEqual(insufficient.books, []); assert.equal(fixture.control.calls.filter(c => c.url.endsWith('/responses')).length, requests.length);
  fixture.control.invalidSelection = true; try { ok(await user.post('/ai/ask', { query: 'Learn robotics' }), 502); } finally { fixture.control.invalidSelection = false; }
  const path = ok(await user.post('/ai/learning-path', { goal: 'Learn robotics', durationWeeks: 8, background: 'Python and calculus' })); assert.equal(path.steps[0].book._id, book._id); assert.equal(path.steps[0].startWeek, 1); assert.equal(path.steps.at(-1).endWeek, 8);
  ok(await user.patch('/users/me', { interests: ['robotics'] })); const recommended = ok(await user.get('/ai/recommendations')); for (const s of ['interests', 'borrowing-history', 'search-history']) assert.ok(recommended.signalsUsed.includes(s));
});
test('Flow 8: queue, return notification, owner-only pickup and fulfillment', async () => {
  const borrowed = ok(await user.post(`/borrow/${book._id}`), 201).borrow;
  const reserved = ok(await second.post(`/reservations/${book._id}`), 201).reservation; assert.equal(reserved.position, 1);
  const next = ok(await third.post(`/reservations/${book._id}`), 201).reservation; assert.equal(next.position, 2);
  ok(await second.post(`/reservations/${book._id}`), 409); ok(await user.patch(`/borrow/${borrowed._id}/renew`), 409);
  ok(await user.patch(`/borrow/${borrowed._id}/return`)); await inventory(book._id, 0);
  const ready = ok(await second.get('/reservations/my')).reservations.find(r => r._id === reserved._id); assert.equal(ready.status, 'READY'); assert.ok(ready.expiresAt);
  assert.equal(ok(await third.get('/reservations/my')).reservations.find(r => r._id === next._id).position, 1);
  const notice = ok(await second.get('/notifications')).notifications.find(n => n.type === 'RESERVATION_READY'); assert.ok(notice);
  ok(await third.patch(`/notifications/${notice._id}/read`), 404); ok(await second.patch(`/notifications/${notice._id}/read`)); ok(await third.post(`/borrow/${book._id}`), 409);
  const pickup = ok(await second.post(`/borrow/${book._id}`), 201).borrow; assert.equal(ok(await second.get('/reservations/my')).reservations.find(r => r._id === reserved._id).status, 'FULFILLED');
  ok(await second.patch(`/borrow/${pickup._id}/return`)); assert.equal(ok(await third.delete(`/reservations/${next._id}`)).reservation.status, 'CANCELLED'); await inventory(book._id, 1);
});
test('Flow 9: admin dashboard, analytics, users, borrowings and reservations', async () => {
  const dashboard = ok(await admin.get('/admin/dashboard?lowAvailability=0')); assert.ok(dashboard.totalBooks >= 1); assert.ok(dashboard.totalUsers >= 5);
  assert.equal(ok(await admin.get('/admin/analytics')).borrowingTrends.length, 12);
  const users = ok(await admin.get('/admin/users')).users; assert.ok(users.every(u => !u.password && u.tokenVersion === undefined));
  assert.ok(ok(await admin.get('/admin/borrowings')).borrowings.length >= 1); ok(await admin.get('/admin/reservations'));
});
test('Concurrency: last copy and simultaneous returns preserve inventory', async () => {
  const b = await newBook('RACE'); const requests = await Promise.all([user.post(`/borrow/${b._id}`), second.post(`/borrow/${b._id}`)]);
  assert.deepEqual(requests.map(r => r.status).sort(), [201, 409]); await inventory(b._id, 0);
  const winner = requests[0].status === 201 ? user : second; const loan = requests.find(r => r.status === 201).body.data.borrow;
  const returns = await Promise.all([winner.patch(`/borrow/${loan._id}/return`), winner.patch(`/borrow/${loan._id}/return`)]); assert.deepEqual(returns.map(r => r.status).sort(), [200, 409]); await inventory(b._id, 1); assert.equal(await Borrow.countDocuments({ book: b._id }), 1);
});
test('Concurrency: unique queue positions, expiry promotes exactly one next hold', async () => {
  const b = await newBook('QUEUE'); const loan = ok(await user.post(`/borrow/${b._id}`), 201).borrow;
  const entries = await Promise.all([second.post(`/reservations/${b._id}`), third.post(`/reservations/${b._id}`)]); entries.forEach(r => ok(r, 201)); assert.deepEqual(entries.map(r => r.body.data.reservation.position).sort(), [1, 2]);
  ok(await user.patch(`/borrow/${loan._id}/return`)); const hold = await Reservation.findOne({ book: b._id, status: 'READY' }); await Reservation.updateOne({ _id: hold._id }, { expiresAt: new Date(Date.now() - 1000) });
  await Promise.all([expireReservations(), expireReservations()]); assert.equal(await Reservation.countDocuments({ book: b._id, status: 'READY' }), 1); assert.equal(await Reservation.countDocuments({ book: b._id, status: 'EXPIRED' }), 1); assert.equal(await Notification.countDocuments({ type: 'RESERVATION_EXPIRED', 'metadata.reservationId': hold._id }), 1); await inventory(b._id, 0);
});
test('Transaction rollback: notification failure leaves no partial borrow, fine or stock changes', async () => {
  const b = await newBook('ROLLBACK'); const stub = mock.method(Notification, 'create', async () => { throw new Error('Injected failure must not leak'); });
  try { const r = await user.post(`/borrow/${b._id}`); ok(r, 500); assert.equal(r.body.message, 'Internal server error.'); } finally { stub.mock.restore(); }
  await inventory(b._id, 1); assert.equal(await Borrow.countDocuments({ book: b._id }), 0);
  const loan = ok(await user.post(`/borrow/${b._id}`), 201).borrow; await Borrow.updateOne({ _id: loan._id }, { dueDate: new Date(Date.now() - 86400000) });
  const stub2 = mock.method(Notification, 'create', async () => { throw new Error('Injected failure'); }); try { ok(await user.patch(`/borrow/${loan._id}/return`), 500); } finally { stub2.mock.restore(); }
  await inventory(b._id, 0); assert.equal(await Fine.countDocuments({ borrow: loan._id }), 0); assert.equal((await Borrow.findById(loan._id)).status, 'BORROWED');
  assert.ok(ok(await admin.get('/admin/borrowings?status=OVERDUE')).borrowings.some(l => l._id === loan._id && l.status === 'OVERDUE'));
  const returned = ok(await user.patch(`/borrow/${loan._id}/return`)); assert.ok(returned.fine.amount >= 1); await inventory(b._id, 1); assert.equal(ok(await user.get('/fines/my')).totalUnpaid, returned.fine.amount);
});
test('Auth: legacy logout, deleted accounts and demoted roles take effect immediately', async () => {
  const c = await account('legacy@integration.test'); await User.updateOne({ _id: c.id }, { $unset: { tokenVersion: 1 } }); c.cookie = `token=${jwt.sign({ id: c.id, role: 'ADMIN' }, process.env.JWT_SECRET)}`; const old = c.cookie; ok(await c.post('/auth/logout')); c.cookie = old; ok(await c.get('/auth/me'), 401);
  const d = await account('demote@integration.test', 'ADMIN'); ok(await d.get('/admin/dashboard')); await User.updateOne({ _id: d.id }, { role: 'USER' }); ok(await d.get('/admin/dashboard'), 403); await User.deleteOne({ _id: d.id }); ok(await d.get('/auth/me'), 401);
  d.cookie = `token=${jwt.sign({ id: 'invalid' }, process.env.JWT_SECRET)}`; ok(await d.get('/auth/me'), 401);
});
test('Validation, 404 routing, origin protection and consistent error envelopes', async () => {
  const anon = new Client(fixture.base); ok(await anon.get('/no-such-route'), 404); ok(await anon.get('/books'), 401);
  for (const path of ['/books?category[$ne]=x', '/books?search[]=a', '/books?limit=100000', '/admin/users?role=ROOT', '/admin/borrowings?status=UNKNOWN', '/admin/analytics?lowAvailability=no']) ok(await admin.get(path), 400);
  ok(await user.patch('/notifications/not-an-id/read'), 400); ok(await admin.post('/books', { ...bookInput, isbn: 'BAD-COUNT', totalCopies: 1.5 }), 400); ok(await admin.post('/books', { ...bookInput, isbn: book.isbn }), 409);
  ok(await anon.post('/auth/register', { name: 'Long password', email: 'long@integration.test', password: 'x'.repeat(73) }), 400);
  ok(await user.call('POST', '/auth/logout', undefined, { origin: 'https://evil.example' }), 403); ok(await user.get('/auth/me'));
  const malformed = await fetch(fixture.base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }); assert.equal(malformed.status, 400); assert.equal((await malformed.json()).message, 'Request body must be valid JSON.');
  assert.throws(() => serverConfig({ MONGODB_URI: 'mongodb://localhost/db', JWT_SECRET: 'short' }));
});
test('Catalogue updates exclude stale embeddings; deleting a book removes chunks', async () => {
  const b = await newBook('INDEX'); ok(await admin.post(`/ai/books/${b._id}/index`)); ok(await admin.patch(`/books/${b._id}`, { description: 'Revised library description; index must be refreshed.' })); assert.ok(!ok(await user.get('/ai/search?q=robotics')).results.some(r => r.book._id === b._id));
  ok(await admin.post(`/ai/books/${b._id}/index`)); ok(await admin.delete(`/books/${b._id}`)); assert.equal(await BookChunk.countDocuments({ book: b._id }), 0);
});
test('Concurrency: hold cancellation versus collection releases a copy exactly once', async () => {
  const b = await newBook('CANCEL'); const first = ok(await user.post(`/borrow/${b._id}`), 201).borrow;
  const hold = ok(await second.post(`/reservations/${b._id}`), 201).reservation; ok(await user.patch(`/borrow/${first._id}/return`));
  const [cancelled, collected] = await Promise.all([second.delete(`/reservations/${hold._id}`), second.post(`/borrow/${b._id}`)]);
  assert.equal(collected.status, 201, JSON.stringify(collected.body)); assert.ok([200, 409].includes(cancelled.status));
  await inventory(b._id, 0); assert.equal(await Borrow.countDocuments({ book: b._id, status: 'BORROWED' }), 1); assert.equal(await Reservation.countDocuments({ book: b._id, status: 'READY' }), 0);
});
test('Concurrency: admin deletion versus borrowing never creates dangling active loans', async () => {
  const b = await newBook('DELETE-RACE');
  const [deleted, borrowed] = await Promise.all([admin.delete(`/books/${b._id}`), user.post(`/borrow/${b._id}`)]);
  assert.ok((deleted.status === 200 && borrowed.status === 404) || (deleted.status === 409 && borrowed.status === 201), JSON.stringify([deleted, borrowed]));
});
test('Auth throttling and oversized payloads use shared error envelopes', async () => {
  const c = new Client(fixture.base); let response;
  for (let i = 0; i < 31; i++) { response = await c.post('/auth/login', { email: 'invalid' }); if (response.status === 429) break; }
  ok(response, 429);
  const large = await c.post('/auth/register', { large: 'x'.repeat(1024 * 1024 + 10) }); ok(large, 413);
});
test('Saved-book contract: idempotent, private and visible to recommendation signals', async () => {
  const b = await newBook('SAVED');
  const results = await Promise.all([user.call('PUT', `/users/me/saved-books/${b._id}`), user.call('PUT', `/users/me/saved-books/${b._id}`)]); results.forEach(r => ok(r));
  const saved = ok(await user.get('/users/me/saved-books')).savedBooks; assert.equal(saved.filter(s => s.book._id === b._id).length, 1);
  assert.equal(ok(await second.get('/users/me/saved-books')).savedBooks.length, 0);
  ok(await second.delete(`/users/me/saved-books/${b._id}`)); assert.equal(ok(await user.get('/users/me/saved-books')).savedBooks.length, 1);
  assert.ok(ok(await user.get('/ai/recommendations')).signalsUsed.includes('saved-books'));
  ok(await admin.delete(`/books/${b._id}`)); assert.equal(ok(await user.get('/users/me/saved-books')).savedBooks.length, 0);
});
