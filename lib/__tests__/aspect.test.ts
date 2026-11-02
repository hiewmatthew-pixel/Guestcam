import { describe, it, expect } from 'vitest';
import { aspectLabel, aspectRatio, cropRect, nextAspect } from '../aspect';

describe('aspect ratios', () => {
  it('flip for a landscape camera frame', () => {
    expect(aspectRatio('3:4', true)).toBeCloseTo(0.75);
    expect(aspectRatio('3:4', false)).toBeCloseTo(4 / 3);
    expect(aspectRatio('full', true)).toBeNull();
    expect(aspectLabel('9:16', false)).toBe('16:9');
    expect(aspectLabel('1:1', false)).toBe('1:1');
  });

  it('cycles through every shape', () => {
    expect(['3:4', '4:5', '1:1', '9:16', 'full', '3:4'].slice(1)).toEqual(
      ['3:4', '4:5', '1:1', '9:16', 'full'].map((k) => nextAspect(k as never)),
    );
  });

  it('crops the centre of the frame', () => {
    // upright phone frame 1080x1920 -> 3:4 keeps full width
    expect(cropRect(1080, 1920, 3 / 4)).toEqual({ x: 0, y: 240, w: 1080, h: 1440 });
    // square from a landscape 1920x1080 frame keeps full height
    expect(cropRect(1920, 1080, 1)).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    expect(cropRect(1280, 720, null)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
});
