import { test as base, expect } from 'playwright-test-coverage';

const test = base.extend({
  page: async ({ page }, use) => {
    const violations: { method: string; url: string; body: string | null }[] = [];
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      if (url.startsWith('http://localhost:3000') || url.startsWith('https://pizza-factory.cs329.click')) {
        violations.push({ method: request.method(), url, body: request.postData() });
        await route.abort();
        return;
      }
      await route.continue();
    });
    await use(page);
    expect(violations, 'Unexpected backend request(s), including http://localhost:3000').toEqual([]);
  },
});

export { test, expect };
