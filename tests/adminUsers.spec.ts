import { test, expect } from 'playwright-test-coverage';

test('admin can view and filter users', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Login' }).click();

  await page.getByRole('textbox', { name: 'Email address' })
    .fill('a@jwt.com');

  await page.getByRole('textbox', { name: 'Password' })
    .fill('admin');

  await page.getByRole('button', { name: 'Login' }).click();

  await expect(
    page.getByRole('link', { name: 'Admin' })
  ).toBeVisible();

  await page.getByRole('link', { name: 'Admin' }).click();

  // Verify users are displayed
  await expect(
    page.getByRole('heading', { name: 'Users' })
  ).toBeVisible();

  const table = page.getByRole('table').last();

  await expect(table.locator('tbody tr')).not.toHaveCount(0);

  // Filter for the seeded admin
  await page.getByRole('textbox', { name: 'Filter users' })
    .fill('常用名字');

  await page.getByRole('button', { name: 'Search' }).click();

  await expect(table).toContainText('a@jwt.com');
});


test('admin can delete a user', async ({ page }) => {
  const email = `delete${Date.now()}@jwt.com`;
  const name = `Delete Test ${Date.now()}`;

  // Register a diner
  await page.goto('/');
  await page.getByRole('link', { name: 'Register' }).click();

  await page.getByRole('textbox', { name: 'Full name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(
    page.getByRole('link', { name: 'Logout' })
  ).toBeVisible();

  // Log out
  await page.getByRole('link', { name: 'Logout' }).click();

  // Log in as admin
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' })
    .fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' })
    .fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(
    page.getByRole('link', { name: 'Admin' })
  ).toBeVisible();

  await page.getByRole('link', { name: 'Admin' }).click();

  // Filter for the test user
  await page.getByRole('textbox', { name: 'Filter users' })
    .fill(name);
  await page.getByRole('button', { name: 'Search' }).click();

  const table = page.getByRole('table').last();
  const row = table.getByRole('row').filter({ hasText: email });

  await expect(row).toBeVisible();

  // Accept the confirmation dialog
  page.once('dialog', dialog => dialog.accept());

  await row.getByRole('button', { name: 'Delete' }).click();

  // User should disappear from the table
  await expect(row).toHaveCount(0);
});
