import { describe, it, expect } from 'vitest';
import { lensesFor, zoomSteps } from '../lenses';

const dev = (deviceId: string, label: string) => ({ deviceId, label, kind: 'videoinput' });

describe('lensesFor', () => {
  it('names iPhone lenses and skips the virtual multi-camera devices', () => {
    const iphone = [
      dev('f', 'Front Camera'),
      dev('t', 'Back Triple Camera'),
      dev('dw', 'Back Dual Wide Camera'),
      dev('u', 'Back Ultra Wide Camera'),
      dev('w', 'Back Camera'),
      dev('tele', 'Back Telephoto Camera'),
    ];
    expect(lensesFor(iphone, 'environment').map((l) => `${l.deviceId}:${l.chip}`)).toEqual(['u:0.5×', 'w:1×', 'tele:zoom']);
    // only one front camera: nothing to choose
    expect(lensesFor(iphone, 'user')).toEqual([]);
  });

  it('numbers Android lenses in system order, main camera first', () => {
    const samsung = [
      dev('a', 'camera2 2, facing back'),
      dev('b', 'camera2 1, facing front'),
      dev('c', 'camera2 0, facing back'),
      dev('d', 'camera2 3, facing back'),
    ];
    expect(lensesFor(samsung, 'environment').map((l) => `${l.deviceId}:${l.chip}`)).toEqual(['c:1×', 'a:lens 2', 'd:lens 3']);
  });

  it('offers nothing before permission (empty labels) or with a single lens', () => {
    expect(lensesFor([dev('x', ''), dev('y', '')], 'environment')).toEqual([]);
    expect(lensesFor([dev('x', 'camera2 0, facing back'), dev('y', 'camera2 1, facing front')], 'environment')).toEqual([]);
  });

  it('treats unlabelled-facing webcams as one group', () => {
    const laptop = [dev('i', 'FaceTime HD Camera'), dev('e', 'Logitech BRIO')];
    expect(lensesFor(laptop, 'user')).toHaveLength(2);
  });
});

describe('zoomSteps', () => {
  it('offers ultra-wide and optical-ish steps within the range', () => {
    expect(zoomSteps({ min: 0.6, max: 10 })).toEqual([0.6, 1, 2, 3, 5]);
    expect(zoomSteps({ min: 1, max: 4 })).toEqual([1, 2, 3]);
    expect(zoomSteps({ min: 1, max: 1.5 })).toEqual([]);
    expect(zoomSteps(undefined)).toEqual([]);
  });
});
