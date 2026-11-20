import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/db', () => ({ db: () => ({}), colleges: {}, user: {} }));
vi.mock('../src/lib/notify', () => ({ notify: async () => {} }));
const { parseCollegeLines } = await import('../src/lib/ambassadors');

describe('parseCollegeLines', () => {
  it('reads names with optional city and state', () => {
    expect(parseCollegeLines('College of Engineering | Pune | Maharashtra\nNIT Trichy\tTiruchirappalli\tTamil Nadu\nIIT Bombay')).toEqual([
      { name: 'College of Engineering', city: 'Pune', state: 'Maharashtra' },
      { name: 'NIT Trichy', city: 'Tiruchirappalli', state: 'Tamil Nadu' },
      { name: 'IIT Bombay', city: null, state: null },
    ]);
  });
  it('keeps commas in names, tidies spaces, skips blanks and duplicates', () => {
    expect(parseCollegeLines('  Indian Institute of Technology,  Delhi  \n\nindian institute of technology, delhi\nab')).toEqual([
      { name: 'Indian Institute of Technology, Delhi', city: null, state: null },
    ]);
  });
});
