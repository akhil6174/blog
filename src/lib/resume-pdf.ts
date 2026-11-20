/**
 * Builds a resume PDF in the browser with pdf-lib (D-039). Single-column layouts with real, selectable text and
 * clickable links, so applicant tracking systems (ATS) can read them. Uses the PDF standard fonts (Times,
 * Helvetica), which need no font files; characters those fonts cannot show are replaced (₹ becomes "Rs.").
 */
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { dateRange, lines, prettyUrl, type ResumeData, type TemplateId } from './resume';

type Style = {
  regular: StandardFonts; bold: StandardFonts; italic: StandardFonts;
  margin: number; nameSize: number; body: number; heading: number; lineGap: number; sectionGap: number;
  center: boolean; accent: RGB; headingColor: RGB; uppercaseHeadings: boolean; rule: 'full' | 'none';
};

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.32, 0.32, 0.36);
const PURPLE = rgb(106 / 255, 92 / 255, 177 / 255);

const STYLES: Record<TemplateId, Style> = {
  classic: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic, margin: 46, nameSize: 22, body: 10.8, heading: 11.5, lineGap: 2.6, sectionGap: 9, center: true, accent: INK, headingColor: INK, uppercaseHeadings: true, rule: 'full' },
  modern: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique, margin: 44, nameSize: 22, body: 9.8, heading: 10.5, lineGap: 2.8, sectionGap: 9, center: false, accent: PURPLE, headingColor: PURPLE, uppercaseHeadings: true, rule: 'full' },
  compact: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique, margin: 34, nameSize: 18, body: 9, heading: 9.6, lineGap: 1.9, sectionGap: 6, center: true, accent: INK, headingColor: INK, uppercaseHeadings: true, rule: 'full' },
};

const A4: [number, number] = [595.28, 841.89];

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

class Writer {
  page!: PDFPage;
  y = 0;
  pages = 0;
  readonly width: number;
  private safe = new Map<string, string>();
  constructor(private doc: PDFDocument, readonly s: Style, readonly f: Fonts) {
    this.width = A4[0] - s.margin * 2;
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - this.s.margin;
    this.pages++;
  }
  ensure(h: number) {
    if (this.y - h < this.s.margin) this.newPage();
  }
  /** Replace characters the standard fonts cannot encode. */
  clean(text: string, font: PDFFont): string {
    const key = `${font.name}\u0000${text}`;
    const hit = this.safe.get(key);
    if (hit !== undefined) return hit;
    let out = '';
    for (const ch of text.replace(/₹\s?/g, 'Rs. ').replace(/[​­]/g, '').replace(/\t/g, ' ')) {
      try { font.encodeText(ch); out += ch; } catch { out += ch === '→' ? '->' : '?'; }
    }
    this.safe.set(key, out);
    return out;
  }
  w(text: string, font: PDFFont, size: number) {
    return font.widthOfTextAtSize(this.clean(text, font), size);
  }
  draw(text: string, x: number, font: PDFFont, size: number, color: RGB = INK) {
    if (!text) return;
    this.page.drawText(this.clean(text, font), { x, y: this.y - size, size, font, color });
  }
  wrap(text: string, font: PDFFont, size: number, max: number): string[] {
    const out: string[] = [];
    for (const para of text.split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (this.w(next, font, size) <= max || !line) line = next;
        else { out.push(line); line = word; }
        // A single word longer than the line (a long URL): hard-break it.
        while (this.w(line, font, size) > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && this.w(line.slice(0, cut), font, size) > max) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      if (line) out.push(line);
    }
    return out;
  }
  link(url: string, x: number, size: number, textWidth: number) {
    try {
      const ctx = this.doc.context;
      const annot = ctx.register(ctx.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [x, this.y - size - 1, x + textWidth, this.y + 1], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      }));
      const annots = this.page.node.Annots();
      if (annots) annots.push(annot);
      else this.page.node.set(PDFName.of('Annots'), ctx.obj([annot]));
    } catch { /* a link that cannot be added stays plain text */ }
  }
  /** Left text and right text on one line (right text: dates or location). */
  row(left: string, leftFont: PDFFont, right: string, rightFont: PDFFont, size: number, color: RGB = INK) {
    const rightW = right ? this.w(right, rightFont, size) : 0;
    const leftLines = this.wrap(left, leftFont, size, this.width - rightW - (right ? 12 : 0));
    leftLines.forEach((l, i) => {
      this.ensure(size + this.s.lineGap);
      this.draw(l, this.s.margin, leftFont, size, color);
      if (i === 0 && right) this.draw(right, this.s.margin + this.width - rightW, rightFont, size, MUTED);
      this.y -= size + this.s.lineGap;
    });
  }
  bullets(text: string) {
    const size = this.s.body;
    const indent = 12;
    for (const item of lines(text)) {
      const wrapped = this.wrap(item, this.f.regular, size, this.width - indent);
      wrapped.forEach((l, i) => {
        this.ensure(size + this.s.lineGap);
        if (i === 0) this.draw('•', this.s.margin + 3, this.f.regular, size);
        this.draw(l, this.s.margin + indent, this.f.regular, size);
        this.y -= size + this.s.lineGap;
      });
    }
  }
  heading(title: string) {
    const s = this.s;
    const label = s.uppercaseHeadings ? title.toUpperCase() : title;
    this.ensure(s.heading + s.sectionGap + s.body * 3); // never leave a heading alone at the bottom of a page
    this.y -= s.sectionGap;
    this.draw(label, s.margin, this.f.bold, s.heading, s.headingColor);
    this.y -= s.heading + 2.5;
    if (s.rule === 'full') {
      this.page.drawLine({ start: { x: s.margin, y: this.y }, end: { x: s.margin + this.width, y: this.y }, thickness: 0.6, color: s.accent === INK ? MUTED : s.accent });
      this.y -= 5;
    }
  }
}

export type ResumePdf = { bytes: Uint8Array; pages: number };

export async function buildResumePdf(data: ResumeData, template: TemplateId = 'classic'): Promise<ResumePdf> {
  const s = STYLES[template] ?? STYLES.classic;
  const doc = await PDFDocument.create();
  const name = data.name.trim() || 'Your Name';
  doc.setTitle(`${name} – Resume`);
  doc.setAuthor(name);
  doc.setCreator('TrutiAI resume builder (trutiai.in/students/resume-builder/)');
  doc.setProducer('TrutiAI');
  const f: Fonts = { regular: await doc.embedFont(s.regular), bold: await doc.embedFont(s.bold), italic: await doc.embedFont(s.italic) };
  const W = new Writer(doc, s, f);

  // ---- Header ----
  const centerX = (text: string, font: PDFFont, size: number) => (s.center ? s.margin + (W.width - W.w(text, font, size)) / 2 : s.margin);
  W.draw(name, centerX(name, f.bold, s.nameSize), f.bold, s.nameSize, template === 'modern' ? PURPLE : INK);
  W.y -= s.nameSize + 4;
  if (data.headline.trim()) {
    const h = data.headline.trim();
    W.draw(h, centerX(h, f.italic, s.body + 0.5), f.italic, s.body + 0.5, MUTED);
    W.y -= s.body + 0.5 + 3;
  }
  // Contact items, wrapped onto as many lines as needed; links are clickable.
  type Item = { text: string; url?: string };
  const items: Item[] = [];
  if (data.phone.trim()) items.push({ text: data.phone.trim() });
  if (data.email.trim()) items.push({ text: data.email.trim(), url: `mailto:${data.email.trim()}` });
  if (data.location.trim()) items.push({ text: data.location.trim() });
  for (const l of data.links) if (l.url.trim()) items.push({ text: prettyUrl(l.url), url: /^https?:\/\//i.test(l.url.trim()) ? l.url.trim() : `https://${l.url.trim()}` });
  const size = s.body - 0.3;
  const sep = '  |  ';
  const sepW = W.w(sep, f.regular, size);
  const rows: Item[][] = [[]];
  let rowW = 0;
  for (const it of items) {
    const iw = W.w(it.text, f.regular, size);
    if (rows[rows.length - 1].length && rowW + sepW + iw > W.width) { rows.push([]); rowW = 0; }
    rowW += (rows[rows.length - 1].length ? sepW : 0) + iw;
    rows[rows.length - 1].push(it);
  }
  for (const row of rows.filter((r) => r.length)) {
    const total = row.reduce((n, it, i) => n + W.w(it.text, f.regular, size) + (i ? sepW : 0), 0);
    let x = s.center ? s.margin + (W.width - total) / 2 : s.margin;
    row.forEach((it, i) => {
      if (i) { W.draw(sep, x, f.regular, size, MUTED); x += sepW; }
      const iw = W.w(it.text, f.regular, size);
      W.draw(it.text, x, f.regular, size, it.url && template === 'modern' ? PURPLE : INK);
      if (it.url) W.link(it.url, x, size, iw);
      x += iw;
    });
    W.y -= size + s.lineGap + 1;
  }

  // ---- Sections (fresher-friendly order) ----
  if (data.summary.trim()) {
    W.heading('Summary');
    for (const l of W.wrap(data.summary.trim(), f.regular, s.body, W.width)) { W.ensure(s.body + s.lineGap); W.draw(l, s.margin, f.regular, s.body); W.y -= s.body + s.lineGap; }
  }

  const edu = data.education.filter((e) => e.school.trim() || e.degree.trim());
  if (edu.length) {
    W.heading('Education');
    edu.forEach((e, i) => {
      if (i) W.y -= 3;
      W.row(e.school.trim() || e.degree.trim(), f.bold, dateRange(e.start, e.end), f.regular, s.body);
      const second = [e.school.trim() ? e.degree.trim() : '', e.score.trim()].filter(Boolean).join(' · ');
      if (second || e.location.trim()) W.row(second, f.italic, e.location.trim(), f.italic, s.body);
    });
  }

  const skills = data.skills.filter((g) => g.items.trim());
  if (skills.length) {
    W.heading('Technical skills');
    for (const g of skills) {
      const label = g.label.trim() ? `${g.label.trim()}: ` : '';
      const lw = W.w(label, f.bold, s.body);
      const wrapped = W.wrap(g.items.trim(), f.regular, s.body, W.width - lw);
      wrapped.forEach((l, i) => {
        W.ensure(s.body + s.lineGap);
        if (i === 0 && label) W.draw(label, s.margin, f.bold, s.body);
        W.draw(l, s.margin + lw, f.regular, s.body);
        W.y -= s.body + s.lineGap;
      });
    }
  }

  const projects = data.projects.filter((p) => p.name.trim());
  if (projects.length) {
    W.heading('Projects');
    projects.forEach((p, i) => {
      if (i) W.y -= 3;
      const title = p.tech.trim() ? `${p.name.trim()} | ${p.tech.trim()}` : p.name.trim();
      W.row(title, f.bold, dateRange(p.start, p.end), f.regular, s.body);
      if (p.link.trim()) {
        const url = /^https?:\/\//i.test(p.link.trim()) ? p.link.trim() : `https://${p.link.trim()}`;
        const shown = prettyUrl(url);
        W.ensure(s.body + s.lineGap);
        W.draw(shown, s.margin, f.italic, s.body - 0.5, template === 'modern' ? PURPLE : MUTED);
        W.link(url, s.margin, s.body - 0.5, W.w(shown, f.italic, s.body - 0.5));
        W.y -= s.body + s.lineGap - 0.5;
      }
      W.bullets(p.points);
    });
  }

  const exp = data.experience.filter((e) => e.role.trim() || e.org.trim());
  if (exp.length) {
    W.heading('Experience');
    exp.forEach((e, i) => {
      if (i) W.y -= 3;
      W.row(e.role.trim() || e.org.trim(), f.bold, dateRange(e.start, e.end), f.regular, s.body);
      if (e.role.trim() && (e.org.trim() || e.location.trim())) W.row(e.org.trim(), f.italic, e.location.trim(), f.italic, s.body);
      W.bullets(e.points);
    });
  }

  if (lines(data.achievements).length) { W.heading('Achievements'); W.bullets(data.achievements); }
  if (lines(data.certifications).length) { W.heading('Certifications'); W.bullets(data.certifications); }

  return { bytes: await doc.save(), pages: W.pages };
}
