import { test, expect } from './fixtures.js';
import { createRoom, joinRoom, getRoomCode } from './helpers/room.js';

test.describe('Multiplayer Room Lifecycle', () => {
  test('host can create a room and see room code', async ({ host }) => {
    const roomCode = await createRoom(host.page);
    expect(roomCode).toHaveLength(6);
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('guest can join a room created by host', async ({ host, guest }) => {
    const roomCode = await createRoom(host.page);
    await joinRoom(guest.page, roomCode);

    // Guest should land in the guest wizard view after joining
    await expect(guest.page.getByTestId('setup-wizard')).toBeVisible({ timeout: 10_000 });
  });

  test('host can navigate setup wizard steps', async ({ host }) => {
    await createRoom(host.page);

    // Wizard should be visible with step content
    await expect(host.page.getByTestId('setup-wizard')).toBeVisible();
    await expect(host.page.getByTestId('wizard-step-content')).toBeVisible();

    // Step 0 (Location) — Next button is disabled until location is set
    const nextBtn = host.page.getByTestId('wizard-next-btn');
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toBeDisabled();

    // Return-to-lobby button is visible on step 0 (instead of Back)
    await expect(host.page.getByTestId('wizard-return-lobby-btn')).toBeVisible();
  });
});

test.describe('Multiplayer Game Session', () => {
  test('host and guest can both be in a room', async ({ host, guest }) => {
    const roomCode = await createRoom(host.page);
    await joinRoom(guest.page, roomCode);

    // Host should still see the wizard
    await expect(host.page.getByTestId('setup-wizard')).toBeVisible();

    // Both should be connected to the same room
    const hostRoomCode = await getRoomCode(host.page);
    expect(hostRoomCode).toBe(roomCode);
  });

  test('room code is displayed consistently for host and guest', async ({ host, guest }) => {
    const roomCode = await createRoom(host.page);
    await joinRoom(guest.page, roomCode);

    // Wait for guest wizard to load
    await expect(guest.page.getByTestId('setup-wizard')).toBeVisible({ timeout: 10_000 });

    const hostDisplayedCode = await getRoomCode(host.page);
    const guestDisplayedCode = await getRoomCode(guest.page);
    expect(hostDisplayedCode).toBe(roomCode);
    expect(guestDisplayedCode).toBe(roomCode);
  });
});

test.describe('Multiplayer with Three Players', () => {
  test('third player can join an existing room', async ({ host, guest, createPlayerSession }) => {
    const roomCode = await createRoom(host.page);
    await joinRoom(guest.page, roomCode);

    const player3 = await createPlayerSession('player3');
    await joinRoom(player3.page, roomCode);

    // All three players should see the wizard
    await expect(host.page.getByTestId('setup-wizard')).toBeVisible();
    await expect(guest.page.getByTestId('setup-wizard')).toBeVisible({ timeout: 10_000 });
    await expect(player3.page.getByTestId('setup-wizard')).toBeVisible({ timeout: 10_000 });
  });
});
