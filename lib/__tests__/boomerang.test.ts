import { describe, it, expect } from 'vitest';
import { cyclesFor, pingPong } from '../boomerang';

describe('pingPong', () => {
  it('plays forward then back without repeating the turning frames', () => {
    expect(pingPong(4)).toEqual([0, 1, 2, 3, 2, 1]);
    expect(pingPong(2)).toEqual([0, 1]);
    expect(pingPong(1)).toEqual([0]);
  });
});

describe('cyclesFor', () => {
  it('loops short bursts more so every clip lasts a few seconds', () => {
    // 1 s burst = 10 stills -> 18-frame cycle = 0.9 s at 20 fps -> 5 cycles
    expect(cyclesFor(10)).toBe(5);
    // 2 s -> 38 frames = 1.9 s -> 3 cycles
    expect(cyclesFor(20)).toBe(3);
    // 3 s -> 58 frames = 2.9 s -> 2 cycles
    expect(cyclesFor(30)).toBe(2);
  });
});
