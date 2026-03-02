import { expect, test } from "@playwright/test";

test("opens app, creates a task, and moves it through all columns", async ({
  page,
}) => {
  const taskTitle = `E2E Task ${Date.now()}`;

  await page.goto("/");
  await expect(page.getByTestId("kanban-board")).toBeVisible();

  await page.getByRole("button", { name: "Quick add" }).click();
  const quickForm = page
    .locator("form")
    .filter({ has: page.getByPlaceholder("Ship onboarding flow") })
    .first();
  await quickForm.getByPlaceholder("Ship onboarding flow").fill(taskTitle);
  await quickForm.locator("select").nth(1).selectOption("col-todo");
  await quickForm.getByRole("button", { name: /^Add$/ }).click();

  const todoColumn = page.getByTestId("column-col-todo");
  const inProgressColumn = page.getByTestId("column-col-in-progress");
  const blockedReviewColumn = page.getByTestId("column-col-blocked-review");
  const doneColumn = page.getByTestId("column-col-done");

  const card = page.locator("article", { hasText: taskTitle }).first();

  await expect(todoColumn).toContainText(taskTitle);
  await card.click();
  await page.keyboard.press("2");
  await expect(inProgressColumn).toContainText(taskTitle);

  await page.keyboard.press("3");
  await expect(blockedReviewColumn).toContainText(taskTitle);

  await page.keyboard.press("4");
  await expect(doneColumn).toContainText(taskTitle);
});
