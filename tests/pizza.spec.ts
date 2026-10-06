import type { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { initialize, diner, owner, admin, pastOrder } from './mockApi';

async function login(page: Page) {
  await page.getByPlaceholder('Email address').fill('alex@example.com');
  await page.getByPlaceholder('Password').fill('pizza-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

async function selectPizzas(page: Page, multiple = true) {
  await page.getByRole('combobox').selectOption({ label: 'Provo' });
  await page.getByRole('button', { name: /Margherita/ }).click();
  if (multiple) await page.getByRole('button', { name: /Pepperoni/ }).click();
  await expect(page.getByText(`Selected pizzas: ${multiple ? 2 : 1}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Checkout' }).click();
}

test('home page and public navigation', async ({ page }) => {
  await initialize(page);
  await page.goto('/');
  await expect(page).toHaveTitle('JWT Pizza');
  await expect(page.getByRole('heading', { name: "The web's best pizza" })).toBeVisible();
  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The secret sauce' })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mama Rucci, my my' })).toBeVisible();
  await page.locator('header').getByRole('link', { name: 'Franchise', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'So you want a piece of the pie?' })).toBeVisible();
  await expect(page.getByRole('link', { name: '800-555-5555' })).toHaveAttribute('href', 'tel:800-555-5555');
  await page.getByRole('link', { name: 'login', exact: true }).last().click();
  await expect(page).toHaveURL(/franchise-dashboard\/login$/);
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'Oops' })).toBeVisible();
});

test('login sends credentials, restores session on reload, and logout clears it', async ({ page }) => {
  const api = await initialize(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await login(page);
  await expect(page.getByRole('link', { name: 'AB', exact: true })).toBeVisible();
  expect(api.calls.find(c => c.method === 'PUT')?.body).toEqual({ email: 'alex@example.com', password: 'pizza-password' });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  expect(api.calls.some(c => c.method === 'DELETE' && c.path === '/api/auth')).toBe(true);
});

test('failed login displays the backend error without authenticating', async ({ page }) => {
  await initialize(page, { loginError: true });
  await page.goto('/login');
  await login(page);
  await expect(page.getByText(/Invalid credentials/)).toBeVisible();
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  await page.getByText('Register', { exact: true }).last().click();
  await expect(page).toHaveURL('/register');
});

for (const failure of [false, true]) {
  test(`registration ${failure ? 'reports a duplicate email' : 'creates an authenticated account'}`, async ({ page }) => {
    const api = await initialize(page, { registerError: failure });
    await page.goto('/register');
    await page.getByPlaceholder('Full name').fill('Robin');
    await page.getByPlaceholder('Email address').fill('robin@example.com');
    await page.getByPlaceholder('Password').fill('pizza-password');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect.poll(() => api.calls.find(c => c.method === 'POST')?.body).toEqual({ name: 'Robin', email: 'robin@example.com', password: 'pizza-password' });
    if (failure) {
      await expect(page.getByText(/Email already registered/)).toBeVisible();
      await page.getByText('Login', { exact: true }).last().click();
      await expect(page).toHaveURL('/login');
    } else {
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('link', { name: 'R', exact: true })).toBeVisible();
    }
  });
}

test('expired session is removed and checkout requires login', async ({ page }) => {
  await initialize(page, { expired: true });
  await page.goto('/payment');
  await expect(page).toHaveURL('/payment/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
});

test('guest orders two pizzas, logs in at checkout, pays and verifies delivery', async ({ page }) => {
  const api = await initialize(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Order now' }).click();
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeDisabled();
  await selectPizzas(page);
  await expect(page).toHaveURL('/payment/login');
  await login(page);
  await expect(page).toHaveURL('/payment');
  await expect(page.getByText('Send me those 2 pizzas right now!')).toBeVisible();
  await expect(page.getByRole('cell', { name: '5 ₿', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByRole('heading', { name: 'Here is your JWT Pizza!' })).toBeVisible();
  const order = api.calls.find(c => c.method === 'POST' && c.path === '/api/order');
  expect(order?.body).toEqual({ storeId: 's1', franchiseId: 'f1', items: [
    { menuId: 'p1', description: 'Margherita', price: 2 }, { menuId: 'p2', description: 'Pepperoni', price: 3 },
  ] });
  expect(order?.authorization).toBe('Bearer test-token');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  const modal = page.locator('#hs-jwt-modal');
  await expect(modal).toHaveClass(/opened/);
  await expect(modal.getByRole('heading', { name: 'JWT Pizza - valid' })).toBeVisible();
  await expect(modal.locator('pre')).toContainText('order-2');
  expect(api.calls.find(c => c.path === '/api/order/verify')?.body).toEqual({ jwt: 'signed-pizza-jwt' });
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();
  api.verifyError = true;
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(modal).toHaveClass(/opened/);
  await expect(modal.locator('pre')).toContainText('invalid JWT');
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();
  await page.getByRole('button', { name: 'Order more' }).click();
  await expect(page).toHaveURL('/menu');
});

test('payment failure preserves the order and cancel allows checkout again', async ({ page }) => {
  const api = await initialize(page, { user: diner });
  api.paymentError = true;
  await page.goto('/menu');
  await selectPizzas(page, false);
  await expect(page.getByText('Send me that pizza right now!')).toBeVisible();
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByText(/Payment declined/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveValue('s1');
  await expect(page.getByText('Selected pizzas: 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Checkout' }).click();
  api.paymentError = false;
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page).toHaveURL('/delivery');
});

for (const populated of [false, true]) {
  test(`diner dashboard shows ${populated ? 'order history and franchise role' : 'empty history and an order link'}`, async ({ page }) => {
    await initialize(page, { user: populated ? owner : diner, orders: populated ? [pastOrder] : [] });
    await page.goto('/');
    await page.getByRole('link', { name: 'AB', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your pizza kitchen' })).toBeVisible();
    await expect(page.getByText('alex@example.com', { exact: true })).toBeVisible();
    if (populated) {
      await expect(page.getByRole('row').filter({ hasText: 'order-1' })).toContainText('2 ₿');
      await expect(page.getByText('Franchisee on f1')).toBeVisible();
    } else {
      await page.getByRole('link', { name: 'Buy one' }).click();
      await expect(page).toHaveURL('/menu');
    }
  });
}

test('franchisee creates a store, cancels a closure, then closes the store', async ({ page }) => {
  const api = await initialize(page, { user: owner });
  await page.goto('/franchise-dashboard');
  await expect(page.getByRole('heading', { name: 'Mountain Pizza' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Provo' })).toContainText('42 ₿');
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByPlaceholder('store name').fill('Orem');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Orem' });
  await expect(row).toBeVisible();
  expect(api.calls.find(c => c.method === 'POST' && c.path.endsWith('/store'))?.body).toEqual({ id: '', name: 'Orem' });
  await row.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/cannot be restored/)).toContainText('Orem');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/franchise-dashboard');
  await expect(row).toHaveCount(0);
  expect(api.calls.some(c => c.method === 'DELETE' && c.path === '/api/franchise/f1/store/s2')).toBe(true);
});

test('admin paginates and filters franchises, creates one, and confirms closures', async ({ page }) => {
  const api = await initialize(page, { user: admin });
  api.franchises.push(...[2, 3, 4].map(id => ({ id: `f${id}`, name: `Franchise ${id}`, stores: [] })));
  await page.goto('/');
  await expect(page.locator('header').getByRole('link', { name: 'Franchise', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Mama Ricci's kitchen" })).toBeVisible();
  await expect(page.getByRole('button', { name: '«' })).toBeDisabled();
  await page.getByRole('button', { name: '»' }).click();
  await expect(page.getByRole('cell', { name: 'Franchise 4', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '»' })).toBeDisabled();
  await page.getByRole('button', { name: '«' }).click();
  await expect(page.getByRole('cell', { name: 'Mountain Pizza', exact: true })).toBeVisible();
  await page.getByPlaceholder('Filter franchises').fill('Mountain');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Franchise 2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByPlaceholder('franchise name').fill('Valley Pizza');
  await page.getByPlaceholder('franchisee admin email').fill('valley@example.com');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL('/admin-dashboard');
  expect(api.calls.find(c => c.method === 'POST' && c.path === '/api/franchise')?.body).toMatchObject({ name: 'Valley Pizza', admins: [{ email: 'valley@example.com' }] });
  const store = page.getByRole('row').filter({ hasText: 'Provo' });
  await store.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/admin-dashboard');
  await expect(store).toHaveCount(0);
  const franchise = page.getByRole('row').filter({ hasText: 'Mountain Pizza' });
  await franchise.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/cannot be restored/)).toContainText('Mountain Pizza');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(franchise).toBeVisible();
  await franchise.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/admin-dashboard');
  await expect(franchise).toHaveCount(0);
});

for (const api of ['service', 'factory']) {
  test(`${api} API documentation displays requests and responses`, async ({ page }) => {
    await initialize(page);
    await page.goto(`/docs/${api}`);
    await expect(page.getByRole('heading', { name: 'JWT Pizza API', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /POST.*\/api\/order/ })).toBeVisible();
    await expect(page.getByText('Place a pizza order')).toBeVisible();
    await expect(page.locator('pre')).toContainText('order-2');
  });
}
