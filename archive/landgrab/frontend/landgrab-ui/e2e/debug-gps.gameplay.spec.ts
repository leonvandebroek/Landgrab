import { test, expect } from './fixtures.js';
import { createRoom } from './helpers/room.js';

test.describe('Debug GPS Panel', () => {
  test('debug tools toggle is visible after room creation', async ({ host }) => {
    await createRoom(host.page);

    // In dev mode, the debug tools toggle button should be present
    const debugToggle = host.page.locator('.debug-tools-toggle');
    await expect(debugToggle).toBeVisible({ timeout: 5_000 });
  });

  test('debug GPS panel appears when debug tools are toggled on', async ({ host }) => {
    await createRoom(host.page);

    // Click the debug tools toggle to show the panel
    const debugToggle = host.page.locator('.debug-tools-toggle');
    await expect(debugToggle).toBeVisible({ timeout: 5_000 });
    await debugToggle.click();

    // Debug GPS panel should now be visible
    const debugPanel = host.page.getByTestId('debug-gps-panel');
    await expect(debugPanel).toBeVisible();

    // Panel should contain the GPS toggle and direction step buttons
    await expect(host.page.getByTestId('debug-gps-toggle')).toBeVisible();
    await expect(host.page.getByTestId('debug-gps-step-north')).toBeVisible();
    await expect(host.page.getByTestId('debug-gps-step-south')).toBeVisible();
    await expect(host.page.getByTestId('debug-gps-step-east')).toBeVisible();
    await expect(host.page.getByTestId('debug-gps-step-west')).toBeVisible();
  });

  test('debug tools toggle hides the panel when clicked again', async ({ host }) => {
    await createRoom(host.page);

    const debugToggle = host.page.locator('.debug-tools-toggle');
    await expect(debugToggle).toBeVisible({ timeout: 5_000 });

    // Toggle on
    await debugToggle.click();
    await expect(host.page.getByTestId('debug-gps-panel')).toBeVisible();

    // Toggle off — dispatchEvent targets the element directly, bypassing hit-testing
    await debugToggle.dispatchEvent('click');
    await expect(host.page.getByTestId('debug-gps-panel')).not.toBeVisible();
  });

  test('direction step buttons are disabled before GPS is enabled', async ({ host }) => {
    await createRoom(host.page);

    // Show debug panel
    const debugToggle = host.page.locator('.debug-tools-toggle');
    await debugToggle.click();

    // Step buttons should be disabled since debug GPS location hasn't been activated
    await expect(host.page.getByTestId('debug-gps-step-north')).toBeDisabled();
    await expect(host.page.getByTestId('debug-gps-step-south')).toBeDisabled();
    await expect(host.page.getByTestId('debug-gps-step-east')).toBeDisabled();
    await expect(host.page.getByTestId('debug-gps-step-west')).toBeDisabled();
  });
});
