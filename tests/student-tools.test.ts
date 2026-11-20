import { describe, expect, it } from 'vitest';
import { attendance, cgpa, PERCENT_FORMULAS, round2, sgpa, toPercent } from '../src/lib/student-tools';

describe('attendance', () => {
  it('reports the current percentage', () => {
    expect(round2(attendance(30, 40).percent)).toBe(75);
    expect(attendance(0, 0).percent).toBe(0);
  });
  it('counts classes that can be missed while staying at 75%', () => {
    // 45/50 = 90%: missing 10 gives 45/60 = 75%, missing 11 gives 45/61 = 73.8%
    expect(attendance(45, 50).canMiss).toBe(10);
    expect(attendance(30, 40).canMiss).toBe(0); // exactly 75%: safe, nothing to spare
    expect(attendance(30, 40).safe).toBe(true);
  });
  it('counts classes needed to recover', () => {
    // 20/40 = 50%: attending x gives (20+x)/(40+x) >= 0.75 -> x >= 40
    expect(attendance(20, 40).mustAttend).toBe(40);
    expect((20 + 40) / (40 + 40)).toBe(0.75);
    expect(attendance(29, 40).mustAttend).toBe(4); // 33/44 = 75%
  });
  it('handles other targets', () => {
    expect(attendance(17, 20, 85).safe).toBe(true);
    expect(attendance(16, 20, 85).mustAttend).toBe(7); // 23/27 = 85.2%
    expect(attendance(9, 10, 100).mustAttend).toBe(null); // 100% is no longer reachable
  });
  it('plans the rest of the semester', () => {
    // 30/40 now, 20 classes left: total 60, need 45, so 5 of the remaining 20 can be missed
    const r = attendance(30, 40, 75, 20);
    expect(r.plan?.canMissOfRemaining).toBe(5);
    expect(r.plan?.reachable).toBe(true);
    // 10/40 now, 10 left: best case 20/50 = 40%, target unreachable
    const bad = attendance(10, 40, 75, 10);
    expect(bad.plan?.reachable).toBe(false);
    expect(round2(bad.plan!.finalIfAllAttended)).toBe(40);
  });
  it('rejects impossible input', () => {
    expect(() => attendance(41, 40)).toThrow();
    expect(() => attendance(-1, 40)).toThrow();
    expect(() => attendance(10, 20, 0)).toThrow();
  });
});

describe('SGPA and CGPA', () => {
  it('weights grade points by credits', () => {
    // (10x4 + 8x3 + 6x2 + 9x1) / 10 = 85/10 = 8.5
    expect(sgpa([{ points: 10, credits: 4 }, { points: 8, credits: 3 }, { points: 6, credits: 2 }, { points: 9, credits: 1 }])).toBe(8.5);
  });
  it('ignores empty rows and rejects bad points', () => {
    expect(sgpa([{ points: 9, credits: 0 }])).toBe(null);
    expect(() => sgpa([{ points: 11, credits: 3 }])).toThrow();
  });
  it('weights CGPA by semester credits when given', () => {
    // (8 x 20 + 9 x 25) / 45 = 385/45 = 8.555...
    const r = cgpa([{ sgpa: 8, credits: 20 }, { sgpa: 9, credits: 25 }]);
    expect(r?.weighted).toBe(true);
    expect(round2(r!.value)).toBe(8.56);
  });
  it('falls back to a plain average without credits', () => {
    const r = cgpa([{ sgpa: 8 }, { sgpa: 9 }]);
    expect(r).toEqual({ value: 8.5, weighted: false });
  });
});

describe('CGPA to percentage', () => {
  const f = (id: string) => PERCENT_FORMULAS.find((x) => x.id === id)!;
  it('applies the stated formulas', () => {
    expect(toPercent(8.5, f('times10'))).toBe(85);
    expect(round2(toPercent(8.5, f('vtu')))).toBe(77.5);
    expect(round2(toPercent(8, f('times95')))).toBe(76);
    expect(toPercent(7, { custom: 9.3 })).toBeCloseTo(65.1);
  });
  it('keeps results between 0 and 100', () => {
    expect(toPercent(0.5, f('vtu'))).toBe(0);
    expect(toPercent(10, { custom: 11 })).toBe(100);
    expect(() => toPercent(11, f('times10'))).toThrow();
  });
});
