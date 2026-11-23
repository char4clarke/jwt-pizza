
import { sleep, check, group, fail } from 'k6';
import http from 'k6/http';

const BASE_URL = 'https://pizza-service.charbar2.click';
const FACTORY_URL = 'https://pizza-factory.cs329.click';

export const options = {
  scenarios: {
    LoginAndOrder: {
      executor: 'constant-vus',
      vus: 3,
      duration: '2m',
      exec: 'loginAndOrder',
    },
  },
};

export function loginAndOrder() {
  let response;
  const vars = {
    token: '',
    pizzaJwt: '',
  };

  group('Login and order pizza', function () {

    // 1. Login
    response = http.put(
      `${BASE_URL}/api/auth`,
      JSON.stringify({
        email: __ENV.PIZZA_EMAIL,
        password: __ENV.PIZZA_PASSWORD,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!check(response, {
      'Login returned 200': (r) => r.status === 200,
    })) {
      fail(`Login failed: ${response.status}`);
    }

    vars.token = response.json('token');

    if (!vars.token) {
      fail('Login response did not contain a token');
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vars.token}`,
    };

    sleep(1);

    // 2. Get pizza menu
    response = http.get(`${BASE_URL}/api/order/menu`, {
      headers,
    });

    if (!check(response, {
      'Menu returned 200': (r) => r.status === 200,
    })) {
      fail(`Menu failed: ${response.status}`);
    }

    const menu = response.json();

    if (!Array.isArray(menu) || menu.length === 0) {
      fail('Pizza menu is empty');
    }

    // 3. Get franchises and stores
    response = http.get(
      `${BASE_URL}/api/franchise?page=0&limit=20&name=*`,
      { headers }
    );

    if (!check(response, {
      'Franchises returned 200': (r) => r.status === 200,
    })) {
      fail(`Franchise request failed: ${response.status}`);
    }

    const franchises = response.json('franchises');

    if (!Array.isArray(franchises) || franchises.length === 0) {
      fail('No franchises available');
    }

    const franchise = franchises.find(
      (f) => Array.isArray(f.stores) && f.stores.length > 0
    );

    if (!franchise) {
      fail('No stores available');
    }

    const store = franchise.stores[0];
    const pizza = menu[0];

    sleep(1);

    // 4. Purchase pizza
    const order = {
      items: [
        {
          menuId: pizza.id,
          description: pizza.title,
          price: pizza.price,
        },
      ],
      storeId: store.id,
      franchiseId: franchise.id,
    };

    response = http.post(
      `${BASE_URL}/api/order`,
      JSON.stringify(order),
      { headers }
    );

    if (!check(response, {
      'Purchase returned 200': (r) => r.status === 200,
    })) {
      fail(`Purchase failed: ${response.status}`);
    }

    // Get the NEW pizza JWT from this purchase
    vars.pizzaJwt = response.json('jwt');

    if (!vars.pizzaJwt) {
      fail('Purchase did not return a pizza JWT');
    }

    sleep(1);

    // 5. Verify pizza JWT
    response = http.post(
      `${FACTORY_URL}/api/order/verify`,
      JSON.stringify({ jwt: vars.pizzaJwt }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!check(response, {
      'Pizza JWT verification returned 200': (r) =>
        r.status === 200,
      'Pizza JWT is valid': (r) =>
        r.status === 200 && r.json('message') === 'valid',
    })) {
      fail(`Pizza verification failed: ${response.status}`);
    }

    sleep(1);
  });
}
