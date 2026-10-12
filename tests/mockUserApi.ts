
import type { Page } from '@playwright/test';

type TestUser = {
  id: number;
  name: string;
  email: string;
  password: string;
  roles: { role: string }[];
};

export async function mockUserApi(page: Page) {
  // Use real backend locally, mocks in GitHub Actions.
  if (!process.env.CI) return;

  const users: TestUser[] = [
    {
      id: 1,
      name: '常用名字',
      email: 'a@jwt.com',
      password: 'admin',
      roles: [{ role: 'admin' }],
    },
  ];

  let nextId = 2;
  let currentUserId: number | null = null;

  const publicUser = (user: TestUser) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
  });

  await page.route('http://localhost:3000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postData()
      ? request.postDataJSON()
      : {};

    let status = 200;
    let json: any = {};

    // Register
    if (path === '/api/auth' && method === 'POST') {
      if (users.some(u => u.email === body.email)) {
        status = 400;
        json = { message: 'duplicate email' };
      } else {
        const user: TestUser = {
          id: nextId++,
          name: body.name,
          email: body.email,
          password: body.password,
          roles: [{ role: 'diner' }],
        };

        users.push(user);
        currentUserId = user.id;
        json = { user: publicUser(user), token: 'mock-token' };
      }
    }

    // Login
    else if (path === '/api/auth' && method === 'PUT') {
      const user = users.find(
        u => u.email === body.email &&
             u.password === body.password
      );

      if (!user) {
        status = 404;
        json = { message: 'unknown user' };
      } else {
        currentUserId = user.id;
        json = { user: publicUser(user), token: 'mock-token' };
      }
    }

    // Logout
    else if (path === '/api/auth' && method === 'DELETE') {
      currentUserId = null;
      json = { message: 'logout successful' };
    }

    // Get current user
    else if (path === '/api/user/me' && method === 'GET') {
      const user = users.find(u => u.id === currentUserId);
      status = user ? 200 : 401;
      json = user
        ? publicUser(user)
        : { message: 'unauthorized' };
    }

    // Update user
    else if (/^\/api\/user\/\d+$/.test(path) && method === 'PUT') {
      const id = Number(path.split('/')[3]);
      const user = users.find(u => u.id === id);

      if (!user) {
        status = 404;
        json = { message: 'user not found' };
      } else {
        user.name = body.name ?? user.name;
        user.email = body.email ?? user.email;
        if (body.password) user.password = body.password;

        json = {
          user: publicUser(user),
          token: 'mock-token',
        };
      }
    }

    // List and filter users
    else if (path === '/api/user' && method === 'GET') {
      const filter = (url.searchParams.get('name') || '*')
        .replaceAll('*', '')
        .toLowerCase();

      const pageNumber = Number(url.searchParams.get('page') || 1);
      const limit = Number(url.searchParams.get('limit') || 10);

      const matches = users.filter(u =>
        u.name.toLowerCase().includes(filter)
      );

      const start = (pageNumber - 1) * limit;

      json = {
        users: matches.slice(start, start + limit).map(publicUser),
        more: matches.length > start + limit,
      };
    }

    // Delete user
    else if (/^\/api\/user\/\d+$/.test(path) && method === 'DELETE') {
      const id = Number(path.split('/')[3]);
      const index = users.findIndex(u => u.id === id);

      if (index === -1) {
        status = 404;
        json = { message: 'user not found' };
      } else {
        users.splice(index, 1);
        json = { message: 'user deleted' };
      }
    }

    // Other requests needed by the dashboards
    else if (path === '/api/order' && method === 'GET') {
      json = { orders: [] };
    }

    else if (path === '/api/franchise' && method === 'GET') {
      json = { franchises: [], more: false };
    }

    else {
      throw new Error(`Unexpected API request: ${method} ${path}`);
    }

    await route.fulfill({ status, json });
  });
}
