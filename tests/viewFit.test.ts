import { describe, expect, it } from 'vitest';
import { bowlData, cinemaData } from '../src/booking/venues';
import {
  BASE_VERTICAL_FOV,
  MAX_VERTICAL_FOV,
  fitVerticalFov,
  horizontalFov,
  subjectHalfAngle,
} from '../src/engine/common/viewFit';

const PHONES = [390 / 844, 360 / 800, 412 / 915, 320 / 568];

describe('fit-to-screen camera', () => {
  it('horizontalFov: 60° vertical at 16:9 is 91.5° across', () => {
    expect(horizontalFov(60, 16 / 9)).toBeCloseTo(91.49, 1);
  });

  it('subjectHalfAngle: centred eye 7 m from a 14 m screen is 45°', () => {
    expect(subjectHalfAngle({ x: 0, z: 7 }, { x: 0, z: 0 }, [{ x: -7, z: 0 }, { x: 7, z: 0 }])).toBeCloseTo(45, 9);
  });

  it('desktop and landscape keep the 60° decision for every seat', () => {
    const { layout } = cinemaData();
    const screen = [{ x: -7, z: 0 }, { x: 7, z: 0 }];
    for (const s of layout.seats) {
      for (const a of [16 / 9, 16 / 10, 21 / 9]) {
        expect(fitVerticalFov(a, subjectHalfAngle(s.eye, layout.screen.centre, screen))).toBe(BASE_VERTICAL_FOV);
      }
    }
  });

  it('every cinema seat fits the whole screen on upright phones', () => {
    const { layout } = cinemaData();
    const w = layout.screen.width / 2;
    const screen = [{ x: -w, z: 0 }, { x: w, z: 0 }];
    for (const s of layout.seats) {
      const half = subjectHalfAngle(s.eye, layout.screen.centre, screen);
      for (const a of PHONES) {
        const v = fitVerticalFov(a, half);
        expect(v).toBeLessThanOrEqual(MAX_VERTICAL_FOV);
        expect(horizontalFov(v, a) / 2, `${s.id} at aspect ${a}`).toBeGreaterThanOrEqual(half);
      }
    }
  });

  it('never exceeds the vertical cap, even for a whole pitch from the front row', () => {
    const { layout } = bowlData('stadium');
    const s = layout.seats
      .filter((x) => x.rowIndex === 0 && x.segment === 0)
      .reduce((a, b) => (Math.abs(a.eye.x) < Math.abs(b.eye.x) ? a : b));
    const half = subjectHalfAngle(s.eye, { x: 0, z: 0 }, layout.boundary);
    expect(half).toBeGreaterThan(60);
    expect(fitVerticalFov(390 / 844, half)).toBeLessThanOrEqual(MAX_VERTICAL_FOV);
  });
});
