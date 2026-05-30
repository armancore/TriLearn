import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/departments/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        departments: [
          { id: 'department-1', name: 'BCA', code: 'BCA' }
        ]
      })
    })
  })
})

test('visitor can reach login and student intake screens', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', {
    name: /academic workspace for planning, teaching, communication, and results/i
  })).toBeVisible()

  await page.getByRole('link', { name: /sign in/i }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.locator('#login-password')).toBeVisible()

  await page.goto('/student-intake')
  await expect(page.getByRole('heading', { name: /student intake details/i })).toBeVisible()
  await expect(page.locator('select[name="preferredDepartment"]')).toContainText('BCA')
  await expect(page.getByRole('button', { name: /submit intake form/i })).toBeVisible()
})
