import { describe, expect, it } from 'vitest';
import { saveOutcome } from '../save-media';

describe('saveOutcome', () => {
  it('points Android saves at the Gallery Download album', () => {
    const o = saveOutcome('downloaded', 'photo', 'android');
    expect(o.ok).toBe(true);
    expect(o.title).toBe('saved to your Gallery');
    expect(o.detail).toMatch(/Download/);
  });
  it('points iPhone share-sheet saves at Photos › Recents', () => {
    const o = saveOutcome('shared', 'video', 'ios');
    expect(o.title).toBe('done');
    expect(o.detail).toMatch(/Save Video/);
  });
  it('tells iPhone guests who cancelled which option to pick', () => {
    expect(saveOutcome('cancelled', 'photo', 'ios').detail).toMatch(/Save Image/);
  });
  it('explains in-app browsers and failures without claiming success', () => {
    expect(saveOutcome('in-app', 'photo', 'android').ok).toBe(false);
    expect(saveOutcome('failed', 'photo', 'other').ok).toBe(false);
  });
});
