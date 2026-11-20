import { describe, expect, it } from 'vitest';
import { normalizeGithub, normalizeLinkedin } from '../src/lib/profile';
import { lastMonths, monthKey } from '../src/lib/months';

describe('profile links', () => {
  it('accepts GitHub usernames and links', () => {
    for (const v of ['octocat', '@octocat', 'github.com/octocat', 'https://github.com/octocat/', 'https://www.github.com/octocat']) expect(normalizeGithub(v)).toBe('https://github.com/octocat');
    expect(normalizeGithub('')).toBe(null);
    expect(normalizeGithub('https://evil.com/octocat')).toHaveProperty('error');
  });
  it('accepts LinkedIn profile links', () => {
    for (const v of ['asha-verma', 'in/asha-verma', 'linkedin.com/in/asha-verma', 'https://in.linkedin.com/in/asha-verma/?utm=1', 'https://www.linkedin.com/in/asha-verma']) expect(normalizeLinkedin(v)).toBe('https://www.linkedin.com/in/asha-verma');
    expect(normalizeLinkedin('https://linkedin.com/company/x')).toHaveProperty('error');
  });
});

describe('dashboard months', () => {
  it('uses India time and lists the last 12 months oldest first', () => {
    expect(monthKey(new Date('2026-11-30T20:00:00Z'))).toBe('2026-12'); // 1:30 am on 1 Dec in India
    const m = lastMonths(12, new Date('2026-03-10T00:00:00Z'));
    expect(m.length).toBe(12);
    expect(m[0]).toBe('2025-04');
    expect(m[11]).toBe('2026-03');
  });
});
