import { test, expect } from '@playwright/test';
const user = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Test Reader', email: 'test@example.edu', role: 'USER', interests: [] };
const respond = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: 'Temporarily unavailable.', errors: {} }) });
test('session lookup outage is retryable and does not pretend the user logged out', async ({ page }) => {
  let available = false;
  await page.route('**/api/v1/auth/me', route => route.fulfill(available ? respond({ user }) : respond({}, 503)));
  await page.goto('/profile'); await expect(page.getByRole('alert')).toContainText('Could not check your session');
  available = true; await page.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
});
test('failed logout preserves the session and offers a retry', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(respond({ user })));
  let fail = true; await page.route('**/api/v1/auth/logout', route => route.fulfill(respond({}, fail ? 503 : 200)));
  await page.goto('/profile'); await page.getByTitle('Sign out').click(); await expect(page.getByRole('alert')).toContainText('Sign out failed'); await expect(page).toHaveURL(/\/profile$/);
  fail = false; await page.getByTitle('Sign out').click(); await expect(page).toHaveURL(/\/login$/);
});
test('catalogue pagination uses the requested API page', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(respond({ user })));
  await page.route('**/api/v1/categories', route => route.fulfill(respond({ categories: ['Engineering'] })));
  await page.route('**/api/v1/books?**', route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill(respond({ books: [{ _id: '111111111111111111111111', title: `Page ${current} resource`, category: 'Engineering', authors: ['Test Author'], availableCopies: 1 }], pagination: { page: current, total: 25, pages: 2, limit: 24 } }));
  });
  await page.goto('/books'); await expect(page.getByRole('heading', { name: 'Page 1 resource' })).toBeVisible(); await page.getByRole('button', { name: 'Next page' }).click(); await expect(page.getByRole('heading', { name: 'Page 2 resource' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
});
