import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = { value: false };
const watchPosition = vi.fn();
const clearWatch = vi.fn();
const getCurrentPosition = vi.fn();

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { watchPosition, clearWatch, getCurrentPosition } }));

const geo = await import('./geolocation');

describe('platform geolocation', () => {
  beforeEach(() => { vi.clearAllMocks(); native.value = false; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('uses the browser API outside the app', () => {
    const browser = { watchPosition: vi.fn(() => 7), clearWatch: vi.fn(), getCurrentPosition: vi.fn() };
    vi.stubGlobal('navigator', { geolocation: browser });
    const onPos = vi.fn();
    const stop = geo.watchPosition(onPos, vi.fn(), { enableHighAccuracy: true });
    const success = browser.watchPosition.mock.calls[0][0] as (p: unknown) => void;
    success({ coords: { latitude: 51.5, longitude: 5.1, accuracy: 4 } });
    expect(onPos).toHaveBeenCalledWith({ latitude: 51.5, longitude: 5.1, accuracy: 4 });
    stop();
    expect(browser.clearWatch).toHaveBeenCalledWith(7);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('uses the native plugin in the app and stops the watch', async () => {
    native.value = true;
    watchPosition.mockResolvedValue('w1');
    const onPos = vi.fn();
    const stop = geo.watchPosition(onPos, vi.fn(), { enableHighAccuracy: true });
    await Promise.resolve();
    const callback = watchPosition.mock.calls[0][1] as (p: unknown, e?: unknown) => void;
    callback({ coords: { latitude: 52, longitude: 4, accuracy: 3 } });
    expect(onPos).toHaveBeenCalledWith({ latitude: 52, longitude: 4, accuracy: 3 });
    stop();
    expect(clearWatch).toHaveBeenCalledWith({ id: 'w1' });
  });

  it('clears a native watch that starts after it was stopped', async () => {
    native.value = true;
    let resolve: (id: string) => void = () => undefined;
    watchPosition.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const stop = geo.watchPosition(vi.fn(), vi.fn(), {});
    stop();
    resolve('late');
    await Promise.resolve();
    await Promise.resolve();
    expect(clearWatch).toHaveBeenCalledWith({ id: 'late' });
  });

  it('reports a refused native permission as PERMISSION_DENIED', async () => {
    native.value = true;
    getCurrentPosition.mockRejectedValue(new Error('Location permission was denied'));
    const onErr = vi.fn();
    geo.getCurrentPosition(vi.fn(), onErr, {});
    await new Promise((r) => setTimeout(r, 0));
    expect(onErr).toHaveBeenCalledWith({ code: 1, message: 'Location permission was denied' });
  });
});
