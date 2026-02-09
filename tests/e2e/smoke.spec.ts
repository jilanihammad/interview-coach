import { expect, test } from "@playwright/test";

test("setup page renders required and optional interview controls", async ({ page }) => {
  await page.goto("/setup");

  await expect(page.getByText("Setup interview session")).toBeVisible();
  await expect(page.getByLabel("Job description")).toBeVisible();
  await expect(page.getByLabel("Custom interview questions (optional)")).toBeVisible();
  await expect(page.getByLabel("Interviewer personality (optional)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start interview" })).toBeVisible();
});
