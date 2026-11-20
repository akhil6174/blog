import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { ACCENTS, dateRange, EMPTY_RESUME, lines, normalizeResume, prettyUrl, resumeFileName, SAMPLE_RESUME, TEMPLATES } from '../src/lib/resume';
import { buildResumePdf } from '../src/lib/resume-pdf';

describe('resume helpers', () => {
  it('splits bullet lines and strips typed bullet marks', () => {
    expect(lines('- one\n\n• two\n  * three  ')).toEqual(['one', 'two', 'three']);
  });
  it('formats dates and URLs', () => {
    expect(dateRange('Jan 2026', 'Present')).toBe('Jan 2026 – Present');
    expect(dateRange('', '2027')).toBe('2027');
    expect(prettyUrl('https://www.github.com/me/')).toBe('github.com/me');
  });
  it('makes safe file names', () => {
    expect(resumeFileName('Asha Verma')).toBe('Asha_Verma_Resume.pdf');
    expect(resumeFileName('')).toBe('Resume.pdf');
  });
  it('restores saved data and fills missing fields', () => {
    const r = normalizeResume({ name: 'A', education: [{ school: 'X' }], junk: 1 });
    expect(r.name).toBe('A');
    expect(r.education[0]).toEqual({ school: 'X', degree: '', location: '', start: '', end: '', score: '' });
    expect(r.projects).toEqual([]);
  });
});

describe('resume PDF', () => {
  for (const t of TEMPLATES) {
    it(`builds a one-page PDF from the example (${t.name})`, async () => {
      const { bytes, pages } = await buildResumePdf(SAMPLE_RESUME, t.id);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(pages).toBe(1);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe('Your Name – Resume');
    });
  }
  it('has ten templates and builds every one with each accent and with experience first', async () => {
    expect(TEMPLATES.length).toBe(10);
    for (const t of TEMPLATES) for (const a of ACCENTS) {
      const { pages } = await buildResumePdf(SAMPLE_RESUME, t.id, { accent: a.hex, experienceFirst: a.id === 'navy' });
      expect(pages).toBe(1);
    }
  });
  it('handles an empty form', async () => {
    const { pages } = await buildResumePdf(EMPTY_RESUME, 'classic');
    expect(pages).toBe(1);
  });
  it('adds pages when content is long, and survives characters the fonts cannot show', async () => {
    const long = { ...SAMPLE_RESUME, name: 'राहुल Kumar ₹', projects: Array.from({ length: 12 }, (_, i) => ({ ...SAMPLE_RESUME.projects[0], name: `Project ${i + 1}`, link: 'https://example.com/' + 'a'.repeat(150) })) };
    const { pages, bytes } = await buildResumePdf(long, 'modern');
    expect(pages).toBeGreaterThan(1);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages);
  });
  it('makes links clickable', async () => {
    const { bytes } = await buildResumePdf(SAMPLE_RESUME, 'classic');
    const page = (await PDFDocument.load(bytes)).getPage(0);
    const annots = page.node.Annots();
    const uris = (annots?.asArray() ?? []).map((ref) => String(page.doc.context.lookup(ref, PDFDict).lookup(PDFName.of('A'), PDFDict).get(PDFName.of('URI'))));
    expect(uris.some((u) => u.includes('https://github.com/yourname'))).toBe(true);
    expect(uris.some((u) => u.includes('mailto:yourname@email.com'))).toBe(true);
  });
});
