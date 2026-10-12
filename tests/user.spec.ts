import { test, expect } from "playwright-test-coverage";
import { mockUserApi } from "./mockUserApi";

test("updateUser persists after logout", async ({ page }) => {
  const email = `user${Date.now()}@jwt.com`;

  await mockUserApi(page);

  // 1. Register a new user
  await page.goto("/");
  await page.getByRole("link", { name: "Register" }).click();

  await page.getByRole("textbox", { name: "Full name" }).fill("pizza diner");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("diner");
  await page.getByRole("button", { name: "Register" }).click();

  // 2. Wait for registration to succeed
  await expect(page.getByRole("link", { name: "pd" })).toBeVisible();

  // Click the user profile link to open the diner dashboard
  await page.getByRole("link", { name: "pd" }).click();

  await expect(page.getByRole("main")).toContainText("pizza diner");

  // 3. Open the Edit user dialog
  await page.getByRole("button", { name: "Edit" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // 4. Change the user's name
  await dialog.getByLabel("name:").fill("pizza dinerx");
  await dialog.getByRole("button", { name: "Update" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("main")).toContainText("pizza dinerx");

  // 5. Log out
  await page.getByRole("link", { name: "Logout" }).click();

  // 6. Log back in using the original credentials
  await page.getByRole("link", { name: "Login" }).click();

  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("diner");
  await page.getByRole("button", { name: "Login" }).click();

  // 7. Verify that login succeeds
  await expect(page.getByRole("link", { name: "pd" })).toBeVisible();

  // Navigate back to the diner dashboard
  await page.getByRole("link", { name: "pd" }).click();

  // 8. Confirm the updated name persisted in the backend
  await expect(page.getByRole("main")).toContainText("pizza dinerx");
});

test("updateUser changes email and password", async ({ page }) => {
  const email = `user${Date.now()}@jwt.com`;
  const newEmail = `updated${Date.now()}@jwt.com`;
  const oldPassword = "diner";
  const newPassword = "newDiner123";

  await mockUserApi(page);

  await page.goto("/");
  await page.getByRole("link", { name: "Register" }).click();

  await page.getByRole("textbox", { name: "Full name" }).fill("pizza diner");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(oldPassword);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("link", { name: "pd" })).toBeVisible();
  await page.getByRole("link", { name: "pd" }).click();

  // Update credentials
  await page.getByRole("button", { name: "Edit" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("email:").fill(newEmail);
  await dialog.getByLabel("password:").fill(newPassword);
  await dialog.getByRole("button", { name: "Update" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("main")).toContainText(newEmail);

  // Logout
  await page.getByRole("link", { name: "Logout" }).click();

  // Login with new credentials
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(newEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(newPassword);
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("link", { name: "pd" })).toBeVisible();
  await page.getByRole("link", { name: "pd" }).click();

  await expect(page.getByRole("main")).toContainText(newEmail);
});
