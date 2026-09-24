import { test, expect } from '@playwright/test';
const password = 'Integration-test-42!';
const base = 'http://127.0.0.1:5005/api/v1';
const sourceText = 'Coordinate frames describe position and orientation. Sensor fusion combines measurements for autonomous motion planning.';
async function login(page, email) {
  await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/profile$/);
}
async function register(page, email) {
  await page.goto('/register'); await page.getByLabel('Name', { exact: true }).fill('Browser Reader'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page).toHaveURL(/\/profile$/);
}
test('real browser + API: auth, CRUD, circulation, queue pickup, sources and admin screens', async ({ browser, page: admin }) => {
  const errors = []; admin.on('pageerror', e => errors.push(e.message));
  await login(admin, 'browser-admin@integration.test');
  await admin.getByRole('link', { name: 'Manage books', exact: true }).click();
  await admin.getByLabel('Title', { exact: true }).fill('Browser Robotics Resource'); await admin.getByLabel(/Authors/).fill('Integration Author'); await admin.getByLabel('ISBN', { exact: true }).fill('BROWSER-001'); await admin.getByLabel('Description', { exact: true }).fill(sourceText); await admin.getByLabel('Category', { exact: true }).fill('Engineering');
  await admin.getByRole('button', { name: /Add to catalogue/ }).click(); await expect(admin.getByText('Book added to the catalogue.')).toBeVisible();
  await admin.getByRole('button', { name: 'Edit Browser Robotics Resource' }).click(); await admin.getByLabel('Shelf location', { exact: true }).fill('R-1'); await admin.getByRole('button', { name: /Save changes/ }).click(); await expect(admin.getByText('Book updated.')).toBeVisible();
  const books = await (await admin.request.get(base + '/books')).json(); const book = books.data.books[0];
  await admin.getByRole('button', { name: `Index ${book.title} for biblio AI` }).click(); await expect(admin.getByRole('status')).toContainText(`${book.title} is ready for biblio AI.`);
  const indexed = await admin.request.put(`${base}/ai/books/${book._id}/chunks`, { data: { sourceId: 'browser-notes', sections: [{ chapter: 'Chapter 1', section: 'Frames', content: sourceText }] } }); expect(indexed.status()).toBe(200);
  const context = await browser.newContext(); const reader = await context.newPage(); reader.on('pageerror', e => errors.push(e.message));
  await register(reader, 'browser-reader@integration.test');
  await reader.goto('/admin'); await expect(reader.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  expect((await reader.request.get(base + '/admin/dashboard')).status()).toBe(403);
  await reader.goto('/books'); await reader.getByLabel('Search books', { exact: true }).fill('Robotics'); await reader.getByLabel('Search books', { exact: true }).press('Enter'); await reader.getByRole('heading', { name: book.title, exact: true }).click(); await reader.getByRole('button', { name: 'Save for later' }).click(); await expect(reader.getByText('Book saved. Find it in Saved books.')).toBeVisible(); await reader.getByRole('button', { name: /Borrow this book/ }).click(); await expect(reader.getByText('Borrow request submitted.')).toBeVisible(); await expect(reader.getByRole('button', { name: /Currently unavailable/ })).toBeDisabled();
  const waitingContext = await browser.newContext(); const waiting = await waitingContext.newPage(); waiting.on('pageerror', e => errors.push(e.message));
  await register(waiting, 'browser-waiting@integration.test'); await waiting.goto(`/books/${book._id}`); await waiting.getByRole('button', { name: /Reserve this book/ }).click(); await expect(waiting.getByText('Reservation placed at position 1.')).toBeVisible();
  await reader.goto('/my-library'); await reader.getByRole('button', { name: 'Return', exact: true }).click(); await expect(reader.getByText('Book returned.', { exact: true })).toBeVisible();
  await waiting.goto('/reservations'); await expect(waiting.getByText('Ready for pickup', { exact: true })).toBeVisible(); await expect(waiting.getByText('Your book is ready', { exact: true })).toBeVisible(); await waiting.getByRole('button', { name: 'Collect reserved copy' }).click(); await expect(waiting.getByText('Book collected. View it in My library.')).toBeVisible();
  await waiting.goto('/my-library'); await waiting.getByRole('button', { name: 'Return', exact: true }).click(); await expect(waiting.getByText('Book returned.', { exact: true })).toBeVisible();
  await reader.goto('/saved-books'); await expect(reader.locator('.circ-book strong')).toHaveText(book.title); await reader.getByRole('button', { name: 'Remove saved book' }).click(); await expect(reader.getByText(/No saved books yet/)).toBeVisible();
  await reader.goto('/ai?mode=search&q=How%20robots%20perceive%20and%20navigate'); await expect(reader.locator('.ai-resource h3')).toHaveText(book.title);
  await reader.getByRole('button', { name: 'Ask biblio AI', exact: true }).click(); await reader.getByLabel('Ask biblio AI', { exact: true }).fill('I know Python and want to learn robotics'); await reader.getByRole('button', { name: 'Send question' }).click(); await expect(reader.locator('.ai-answer .ai-resource')).toHaveAttribute('href', `/books/${book._id}`); await reader.locator('.ai-answer .ai-citation summary').click(); await expect(reader.getByRole('blockquote')).toContainText('Coordinate frames'); await expect(reader.locator('.ai-answer').getByText('Chapter 1 · Frames')).toBeVisible();
  await reader.getByRole('button', { name: 'Learning path', exact: true }).click(); await reader.getByLabel('Your learning goal').fill('Learn robotics'); await reader.getByRole('button', { name: 'Build my learning path' }).click(); await expect(reader.getByText('WEEKS 1–8')).toBeVisible();
  for (const [path, title] of [['/admin', 'Library overview'], ['/admin/analytics', 'Inventory analytics'], ['/admin/users', 'User management'], ['/admin/borrowings', 'Borrowing overview']]) { await admin.goto(path); await expect(admin.getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(admin.locator('.admin-error')).toHaveCount(0); await expect(admin.getByText('Loading admin data…')).toHaveCount(0); }
  await admin.goto('/admin/books'); await admin.getByRole('button', { name: 'Delete Browser Robotics Resource' }).click(); await expect(admin.getByText('Book removed.')).toBeVisible();
  await reader.getByTitle('Sign out', { exact: true }).click(); await expect(reader).toHaveURL(/\/login$/); expect((await reader.request.get(base + '/auth/me')).status()).toBe(401);
  expect(errors).toEqual([]); await context.close(); await waitingContext.close();
});
