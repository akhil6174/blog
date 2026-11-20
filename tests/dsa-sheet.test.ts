import { describe, expect, it } from 'vitest';
import { badges, COMPANIES, istDay, PROBLEMS, streaks, summarize, TOPICS, weeklySolves } from '../src/lib/dsa-sheet';

const DAY = 86_400_000;
// 20 Nov 2026, 12:00 India time (a Friday).
const NOW = Date.UTC(2026, 10, 20, 6, 30);

describe('DSA sheet data', () => {
  it('has unique ids, valid links and every topic easy-to-hard', () => {
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(150);
    for (const p of PROBLEMS) expect(p.url).toBe(`https://leetcode.com/problems/${p.id}/`);
    const rank = { Easy: 0, Medium: 1, Hard: 2 };
    for (const t of TOPICS) {
      const r = PROBLEMS.filter((p) => p.topic === t).map((p) => rank[p.difficulty]);
      expect(r).toEqual([...r].sort((a, b) => a - b));
    }
    expect(new Set(COMPANIES).size).toBe(COMPANIES.length);
  });
});

describe('progress maths', () => {
  it('summarises by topic and difficulty', () => {
    const s = summarize(new Set(['two-sum', 'trapping-rain-water', 'not-a-problem']));
    expect(s.done).toBe(2);
    expect(s.byDifficulty.find((d) => d.difficulty === 'Hard')!.done).toBe(1);
    expect(s.byTopic.find((t) => t.topic === 'Arrays')!.done).toBe(1);
  });

  it('counts streaks in India time, current only if today or yesterday', () => {
    const days = [0, 1, 2, 5, 6].map((d) => NOW - (6 - d) * DAY);
    expect(streaks(days, NOW)).toEqual({ best: 3, current: 2 });
    expect(streaks([NOW - 3 * DAY], NOW).current).toBe(0);
    // 23:50 and 00:10 India time are two different days.
    const late = Date.UTC(2026, 10, 19, 18, 20), early = Date.UTC(2026, 10, 19, 18, 40);
    expect(istDay(early) - istDay(late)).toBe(1);
  });

  it('awards badges from progress only', () => {
    const none = badges([], NOW);
    expect(none.some((b) => b.earned)).toBe(false);
    const arrays = PROBLEMS.filter((p) => p.topic === 'Arrays').map((p, i) => ({ id: p.id, solvedAt: NOW - i * DAY, revise: false }));
    const got = badges(arrays, NOW).filter((b) => b.earned).map((b) => b.id);
    expect(got).toContain('first');
    expect(got).toContain('topic-arrays');
    expect(got).toContain('streak-7');
    expect(got).not.toContain('solved-25');
  });

  it('groups solves into 12 Monday-based weeks, current week last', () => {
    const w = weeklySolves([NOW, NOW - DAY, NOW - 7 * DAY, NOW - 200 * DAY], 12, NOW);
    expect(w).toHaveLength(12);
    expect(w[11].value).toBe(2); // Thu and Fri this week
    expect(w[10].value).toBe(1);
    expect(w[11].label).toBe('16 Nov'); // Monday 16 Nov 2026
    expect(w.reduce((s, x) => s + x.value, 0)).toBe(3);
  });
});
