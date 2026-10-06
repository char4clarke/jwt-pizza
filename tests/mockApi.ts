import type { Page } from '@playwright/test';
import type { Franchise, Order, User } from '../src/service/pizzaService';
import { Role } from '../src/service/pizzaService';

export const diner: User = { id: 'u1', name: 'Alex Baker', email: 'alex@example.com', roles: [{ role: Role.Diner }] };
export const owner: User = { ...diner, roles: [{ role: Role.Franchisee, objectId: 'f1' }] };
export const admin: User = { ...diner, roles: [{ role: Role.Admin }] };
export const menu = [
  { id: 'p1', title: 'Margherita', description: 'Tomato and basil', image: '/pizza-hero.jpg', price: 2 },
  { id: 'p2', title: 'Pepperoni', description: 'Classic pepperoni', image: '/pizza-hero.jpg', price: 3 },
];
export const pastOrder: Order = { id: 'order-1', franchiseId: 'f1', storeId: 's1', date: '2026-10-01', items: [{ menuId: 'p1', description: 'Margherita', price: 2 }] };

export async function initialize(page: Page, options: { user?: User; loginError?: boolean; registerError?: boolean; expired?: boolean; orders?: Order[] } = {}) {
  const state = {
    user: options.user || diner,
    franchises: [{ id: 'f1', name: 'Mountain Pizza', admins: [{ email: 'alex@example.com', name: 'Alex Baker' }], stores: [{ id: 's1', name: 'Provo', totalRevenue: 42 }] }] as Franchise[],
    orders: options.orders || [] as Order[],
    calls: [] as { method: string; path: string; body: any; authorization?: string }[],
    paymentError: false,
    verifyError: false,
  };
  if (options.user || options.expired) {
    await page.addInitScript(() => localStorage.setItem('token', 'test-token'));
  }
  // Registered after the guard: Playwright checks the newest matching route first.
  // Unknown method/path combinations fall back to the guard and fail the test.
  await page.route('http://localhost:3000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : null;
    state.calls.push({ method, path: path + url.search, body, authorization: request.headers().authorization });
    let json: any;
    let status = 200;
    if (path === '/api/auth' && ['PUT', 'POST'].includes(method)) {
      if ((method === 'PUT' && options.loginError) || (method === 'POST' && options.registerError)) {
        status = 401; json = { message: method === 'PUT' ? 'Invalid credentials' : 'Email already registered' };
      } else {
        state.user = { ...state.user, ...(method === 'POST' ? { name: body.name, email: body.email } : {}) };
        json = { user: state.user, token: 'test-token' };
      }
    } else if (path === '/api/auth' && method === 'DELETE') json = {};
    else if (path === '/api/user/me' && method === 'GET') {
      status = options.expired ? 401 : 200;
      json = options.expired ? { message: 'Session expired' } : state.user;
    } else if (path === '/api/order/menu' && method === 'GET') json = menu;
    else if (path === '/api/order' && method === 'GET') json = { id: 'history', dinerId: 'u1', orders: state.orders };
    else if (path === '/api/order' && method === 'POST') {
      if (state.paymentError) { status = 500; json = { message: 'Payment declined' }; }
      else {
        const order = { ...body, id: 'order-2', date: '2026-10-06' };
        state.orders.push(order);
        json = { order, jwt: 'signed-pizza-jwt' };
      }
    } else if (path === '/api/franchise' && method === 'GET') {
      const filter = (url.searchParams.get('name') || '*').replaceAll('*', '').toLowerCase();
      const matches = state.franchises.filter(f => f.name.toLowerCase().includes(filter));
      const pageNumber = Number(url.searchParams.get('page') || 0);
      const limit = Number(url.searchParams.get('limit') || 10);
      json = { franchises: matches.slice(pageNumber * limit, (pageNumber + 1) * limit), more: matches.length > (pageNumber + 1) * limit };
    } else if (path === '/api/franchise' && method === 'POST') {
      json = { ...body, id: `f${state.franchises.length + 1}` }; state.franchises.push(json);
    } else if (path === '/api/franchise/u1' && method === 'GET') json = state.franchises;
    else if (/^\/api\/franchise\/[^/]+$/.test(path) && method === 'DELETE') {
      state.franchises = state.franchises.filter(f => f.id !== path.split('/')[3]); json = {};
    } else if (/^\/api\/franchise\/[^/]+\/store$/.test(path) && method === 'POST') {
      json = { ...body, id: 's2', totalRevenue: 0 };
      state.franchises.find(f => f.id === path.split('/')[3])!.stores.push(json);
    } else if (/^\/api\/franchise\/[^/]+\/store\/[^/]+$/.test(path) && method === 'DELETE') {
      const franchise = state.franchises.find(f => f.id === path.split('/')[3])!;
      franchise.stores = franchise.stores.filter(s => s.id !== path.split('/')[5]); json = {};
    } else if (path === '/api/docs' && method === 'GET') json = docs;
    else { await route.fallback(); return; }
    await route.fulfill({ status, json });
  });
  await page.route('https://pizza-factory.cs329.click/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/docs' && request.method() === 'GET') await route.fulfill({ json: docs });
    else if (path === '/api/order/verify' && request.method() === 'POST') {
      state.calls.push({ method: 'POST', path, body: request.postDataJSON() });
      await route.fulfill({ status: state.verifyError ? 400 : 200, json: state.verifyError ? { message: 'invalid' } : { message: 'valid', payload: { orderId: 'order-2' } } });
    } else await route.fallback();
  });
  // Remote decorative photos should not make UI tests depend on an external service.
  await page.route('https://images.unsplash.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"/>' }));
  return state;
}

const docs = { endpoints: [{ requiresAuth: true, method: 'POST', path: '/api/order', description: 'Place a pizza order', example: '{ "items": [] }', response: { id: 'order-2' } }] };
