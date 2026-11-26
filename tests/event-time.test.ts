import { describe, expect, it } from 'vitest';
import { eventBadge, eventWhen, fromIstInput, isUpcoming, toIstInput } from '../src/lib/event-time';
import { categoryName, CATEGORIES, isValidCategory, MAIN_CATEGORIES } from '../src/lib/site';

describe('event times (India time)', () => {
  it('converts the admin input to UTC and back', () => {
    const d = fromIstInput('2026-12-05T10:00')!;
    expect(d.toISOString()).toBe('2026-12-05T04:30:00.000Z');
    expect(toIstInput(d)).toBe('2026-12-05T10:00');
    expect(fromIstInput('5 Dec')).toBeNull();
  });
  it('formats one-day and multi-day events', () => {
    expect(eventWhen(fromIstInput('2026-12-05T10:00')!, fromIstInput('2026-12-05T13:00')!)).toMatch(/5 Dec,? 2026 · 10:00 am – 1:00 pm IST$/);
    expect(eventWhen(fromIstInput('2026-12-05T10:00')!, fromIstInput('2026-12-06T18:00')!)).toMatch(/6 Dec,? 2026, 6:00 pm IST$/);
  });
  it('knows upcoming, live and past', () => {
    const now = fromIstInput('2026-12-05T12:00')!;
    expect(isUpcoming(fromIstInput('2026-12-05T10:00')!, fromIstInput('2026-12-05T13:00')!, now)).toBe(true);
    expect(eventBadge(fromIstInput('2026-12-05T10:00')!, fromIstInput('2026-12-05T13:00')!, now)).toBe('Live now');
    expect(isUpcoming(fromIstInput('2026-12-05T09:00')!, null, now)).toBe(true); // same day, no end time
    expect(isUpcoming(fromIstInput('2026-12-04T09:00')!, null, now)).toBe(false);
    expect(eventBadge(fromIstInput('2026-12-06T09:00')!, null, now)).toBe('Tomorrow');
    expect(eventBadge(fromIstInput('2026-12-10T09:00')!, null, now)).toBe('In 5 days');
  });
});

describe('categories', () => {
  it('keeps the 5 main topics first and adds more', () => {
    expect(MAIN_CATEGORIES).toHaveLength(5);
    expect(CATEGORIES.slice(0, 5)).toEqual(MAIN_CATEGORIES);
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(CATEGORIES.length);
  });
  it('accepts a writer’s own category', () => {
    expect(isValidCategory('machine-learning')).toBe(true);
    expect(isValidCategory('c:Robotics')).toBe(true);
    expect(categoryName('c:Robotics')).toBe('Robotics');
    expect(isValidCategory('c:')).toBe(false);
    expect(isValidCategory('c:<script>')).toBe(false);
    expect(isValidCategory('c:' + 'x'.repeat(31))).toBe(false);
    expect(isValidCategory('made-up')).toBe(false);
  });
});
