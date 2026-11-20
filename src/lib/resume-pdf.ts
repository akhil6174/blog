/**
 * Builds a resume PDF in the browser with pdf-lib (D-039). Single-column layouts with real, selectable text and
 * clickable links, so applicant tracking systems (ATS) can read them. Ten templates are combinations of the style
 * options below, with a student-chosen accent colour and section order. Uses the PDF standard fonts (Times,
 * Helvetica, Courier), which need no font files; characters those fonts cannot show are replaced (₹ becomes "Rs.").
 */
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { dateRange, lines, prettyUrl, type ResumeData, type ResumeOptions, type TemplateId } from './resume';

type Family = 'times' | 'helvetica' | 'courier';
type Style = {
  body: Family; headingFamily: Family;
  margin: number; nameSize: number; bodySize: number; heading: number; lineGap: number; sectionGap: number;
  center: boolean;
  /** How section headings look. */
  headingStyle: 'rule' | 'none' | 'bar' | 'band' | 'short' | 'centered';
  uppercaseHeadings: boolean;
  /** Line(s) under the name and contact block. */
  headerRule: 'none' | 'single' | 'double';
  nameUpper: boolean;
  /** Which parts take the accent colour. */
  colour: { name: boolean; headings: boolean; links: boolean; rules: boolean };
  /** Heading text in a code-comment style, for the Developer template. */
  headingPrefix?: string;
};

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.32, 0.32, 0.36);
const NONE = { name: false, headings: false, links: false, rules: false };
const ALL = { name: true, headings: true, links: true, rules: true };

const FONT: Record<Family, { regular: StandardFonts; bold: StandardFonts; italic: StandardFonts }> = {
  times: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic },
  helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique },
  courier: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique },
};

const base = { margin: 44, nameSize: 22, bodySize: 10, heading: 10.8, lineGap: 2.7, sectionGap: 9, center: false, headingStyle: 'rule', uppercaseHeadings: true, headerRule: 'none', nameUpper: false, colour: NONE } as const;

const STYLES: Record<TemplateId, Style> = {
  classic: { ...base, body: 'times', headingFamily: 'times', margin: 46, bodySize: 10.8, heading: 11.5, lineGap: 2.6, center: true },
  modern: { ...base, body: 'helvetica', headingFamily: 'helvetica', bodySize: 9.8, heading: 10.5, lineGap: 2.8, colour: ALL },
  compact: { ...base, body: 'helvetica', headingFamily: 'helvetica', margin: 34, nameSize: 18, bodySize: 9, heading: 9.6, lineGap: 1.9, sectionGap: 6, center: true },
  executive: { ...base, body: 'times', headingFamily: 'times', margin: 48, nameSize: 21, bodySize: 10.8, heading: 11, center: true, nameUpper: true, headerRule: 'double', colour: { name: false, headings: true, links: false, rules: true } },
  minimal: { ...base, body: 'helvetica', headingFamily: 'helvetica', margin: 52, nameSize: 24, bodySize: 9.8, heading: 10.5, lineGap: 3.2, sectionGap: 13, headingStyle: 'none', uppercaseHeadings: false },
  developer: { ...base, body: 'helvetica', headingFamily: 'courier', bodySize: 9.8, heading: 10.8, headingStyle: 'none', uppercaseHeadings: false, headingPrefix: '// ', headerRule: 'single', colour: { name: false, headings: true, links: true, rules: true } },
  engineer: { ...base, body: 'helvetica', headingFamily: 'helvetica', bodySize: 9.8, heading: 10.8, headingStyle: 'bar', colour: { name: true, headings: false, links: true, rules: true } },
  academic: { ...base, body: 'times', headingFamily: 'times', margin: 50, nameSize: 20, bodySize: 11, heading: 11.5, lineGap: 2.8, headingStyle: 'short', uppercaseHeadings: false },
  elegant: { ...base, body: 'times', headingFamily: 'times', margin: 48, nameSize: 24, bodySize: 10.6, heading: 10.6, center: true, headingStyle: 'centered', colour: { name: true, headings: false, links: false, rules: true } },
  bold: { ...base, body: 'helvetica', headingFamily: 'helvetica', nameSize: 26, bodySize: 9.8, heading: 10.8, sectionGap: 10, headingStyle: 'band', colour: { name: true, headings: true, links: true, rules: false } },
};

/** "#6a5cb1" -> pdf-lib colour; falls back to purple. */
function hexColour(hex: string | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const n = m ? parseInt(m[1], 16) : 0x6a5cb1;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
/** A very light tint of a colour, for the Bold template's heading band. */
function tint(c: RGB, amount = 0.9): RGB {
  return rgb(c.red + (1 - c.red) * amount, c.green + (1 - c.green) * amount, c.blue + (1 - c.blue) * amount);
}

const A4: [number, number] = [595.28, 841.89];

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; heading: PDFFont };

class Writer {
  page!: PDFPage;
  y = 0;
  pages = 0;
  readonly width: number;
  private safe = new Map<string, string>();
  constructor(private doc: PDFDocument, readonly s: Style, readonly f: Fonts, readonly accent: RGB) {
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
    const size = this.s.bodySize;
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
    const label = `${s.headingPrefix ?? ''}${s.uppercaseHeadings ? title.toUpperCase() : title}`;
    const font = this.f.heading;
    const colour = s.colour.headings ? this.accent : INK;
    const ruleColour = s.colour.rules ? this.accent : MUTED;
    this.ensure(s.heading + s.sectionGap + s.bodySize * 3); // never leave a heading alone at the bottom of a page
    this.y -= s.sectionGap;
    const x0 = s.margin;
    switch (s.headingStyle) {
      case 'band': {
        const h = s.heading + 7;
        this.page.drawRectangle({ x: x0 - 4, y: this.y - h + 2, width: this.width + 8, height: h, color: tint(this.accent, 0.88) });
        this.y -= 2.5;
        this.draw(label, x0 + 2, font, s.heading, colour);
        this.y -= s.heading + 6;
        break;
      }
      case 'bar': {
        this.page.drawRectangle({ x: x0, y: this.y - s.heading - 1, width: 3, height: s.heading + 2, color: this.accent });
        this.draw(label, x0 + 9, font, s.heading, colour);
        this.y -= s.heading + 6;
        break;
      }
      case 'centered': {
        const w = this.w(label, font, s.heading);
        const mid = x0 + this.width / 2;
        this.draw(label, mid - w / 2, font, s.heading, colour);
        const lineY = this.y - s.heading / 2 + 1;
        this.page.drawLine({ start: { x: x0, y: lineY }, end: { x: mid - w / 2 - 8, y: lineY }, thickness: 0.6, color: ruleColour });
        this.page.drawLine({ start: { x: mid + w / 2 + 8, y: lineY }, end: { x: x0 + this.width, y: lineY }, thickness: 0.6, color: ruleColour });
        this.y -= s.heading + 6;
        break;
      }
      case 'short': {
        this.draw(label, x0, font, s.heading, colour);
        this.y -= s.heading + 2.5;
        this.page.drawLine({ start: { x: x0, y: this.y }, end: { x: x0 + 36, y: this.y }, thickness: 1.2, color: ruleColour });
        this.y -= 6;
        break;
      }
      case 'none': {
        this.draw(label, x0, font, s.heading, colour);
        this.y -= s.heading + 5;
        break;
      }
      default: {
        this.draw(label, x0, font, s.heading, colour);
        this.y -= s.heading + 2.5;
        this.page.drawLine({ start: { x: x0, y: this.y }, end: { x: x0 + this.width, y: this.y }, thickness: 0.6, color: ruleColour });
        this.y -= 5;
      }
    }
  }
}

export type ResumePdf = { bytes: Uint8Array; pages: number };

export async function buildResumePdf(data: ResumeData, template: TemplateId = 'classic', opts: ResumeOptions = {}): Promise<ResumePdf> {
  const s = STYLES[template] ?? STYLES.classic;
  const accent = hexColour(opts.accent);
  const doc = await PDFDocument.create();
  const name = data.name.trim() || 'Your Name';
  doc.setTitle(`${name} – Resume`);
  doc.setAuthor(name);
  doc.setCreator('TrutiAI resume builder (trutiai.in/students/resume-builder/)');
  doc.setProducer('TrutiAI');
  const fam = FONT[s.body];
  const f: Fonts = { regular: await doc.embedFont(fam.regular), bold: await doc.embedFont(fam.bold), italic: await doc.embedFont(fam.italic), heading: await doc.embedFont(FONT[s.headingFamily].bold) };
  const W = new Writer(doc, s, f, accent);
  const linkColour = s.colour.links ? accent : INK;
  const body = s.bodySize;

  // ---- Header ----
  const centerX = (text: string, font: PDFFont, size: number) => (s.center ? s.margin + (W.width - W.w(text, font, size)) / 2 : s.margin);
  const shownName = s.nameUpper ? name.toUpperCase() : name;
  W.draw(shownName, centerX(shownName, f.bold, s.nameSize), f.bold, s.nameSize, s.colour.name ? accent : INK);
  W.y -= s.nameSize + 4;
  if (data.headline.trim()) {
    const h = data.headline.trim();
    W.draw(h, centerX(h, f.italic, body + 0.5), f.italic, body + 0.5, MUTED);
    W.y -= body + 0.5 + 3;
  }
  // Contact items, wrapped onto as many lines as needed; links are clickable.
  type Item = { text: string; url?: string };
  const items: Item[] = [];
  if (data.phone.trim()) items.push({ text: data.phone.trim() });
  if (data.email.trim()) items.push({ text: data.email.trim(), url: `mailto:${data.email.trim()}` });
  if (data.location.trim()) items.push({ text: data.location.trim() });
  for (const l of data.links) if (l.url.trim()) items.push({ text: prettyUrl(l.url), url: /^https?:\/\//i.test(l.url.trim()) ? l.url.trim() : `https://${l.url.trim()}` });
  const size = body - 0.3;
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
      W.draw(it.text, x, f.regular, size, it.url ? linkColour : INK);
      if (it.url) W.link(it.url, x, size, iw);
      x += iw;
    });
    W.y -= size + s.lineGap + 1;
  }
  if (s.headerRule !== 'none') {
    const c = s.colour.rules ? accent : MUTED;
    W.y -= 3;
    W.page.drawLine({ start: { x: s.margin, y: W.y }, end: { x: s.margin + W.width, y: W.y }, thickness: s.headerRule === 'double' ? 1.2 : 0.8, color: c });
    if (s.headerRule === 'double') { W.y -= 2.5; W.page.drawLine({ start: { x: s.margin, y: W.y }, end: { x: s.margin + W.width, y: W.y }, thickness: 0.5, color: c }); }
    W.y -= 2;
  }

  const para = (text: string) => { for (const l of W.wrap(text, f.regular, body, W.width)) { W.ensure(body + s.lineGap); W.draw(l, s.margin, f.regular, body); W.y -= body + s.lineGap; } };

  const sections: Record<string, () => void> = {
    education: () => {
      const edu = data.education.filter((e) => e.school.trim() || e.degree.trim());
      if (!edu.length) return;
      W.heading('Education');
      edu.forEach((e, i) => {
        if (i) W.y -= 3;
        W.row(e.school.trim() || e.degree.trim(), f.bold, dateRange(e.start, e.end), f.regular, body);
        const second = [e.school.trim() ? e.degree.trim() : '', e.score.trim()].filter(Boolean).join(' · ');
        if (second || e.location.trim()) W.row(second, f.italic, e.location.trim(), f.italic, body);
      });
    },
    skills: () => {
      const skills = data.skills.filter((g) => g.items.trim());
      if (!skills.length) return;
      W.heading('Technical skills');
      for (const g of skills) {
        const label = g.label.trim() ? `${g.label.trim()}: ` : '';
        const lw = W.w(label, f.bold, body);
        W.wrap(g.items.trim(), f.regular, body, W.width - lw).forEach((l, i) => {
          W.ensure(body + s.lineGap);
          if (i === 0 && label) W.draw(label, s.margin, f.bold, body);
          W.draw(l, s.margin + lw, f.regular, body);
          W.y -= body + s.lineGap;
        });
      }
    },
    projects: () => {
      const projects = data.projects.filter((p) => p.name.trim());
      if (!projects.length) return;
      W.heading('Projects');
      projects.forEach((p, i) => {
        if (i) W.y -= 3;
        const title = p.tech.trim() ? `${p.name.trim()} | ${p.tech.trim()}` : p.name.trim();
        W.row(title, f.bold, dateRange(p.start, p.end), f.regular, body);
        if (p.link.trim()) {
          const url = /^https?:\/\//i.test(p.link.trim()) ? p.link.trim() : `https://${p.link.trim()}`;
          const shown = prettyUrl(url);
          W.ensure(body + s.lineGap);
          W.draw(shown, s.margin, f.italic, body - 0.5, s.colour.links ? accent : MUTED);
          W.link(url, s.margin, body - 0.5, W.w(shown, f.italic, body - 0.5));
          W.y -= body + s.lineGap - 0.5;
        }
        W.bullets(p.points);
      });
    },
    experience: () => {
      const exp = data.experience.filter((e) => e.role.trim() || e.org.trim());
      if (!exp.length) return;
      W.heading('Experience');
      exp.forEach((e, i) => {
        if (i) W.y -= 3;
        W.row(e.role.trim() || e.org.trim(), f.bold, dateRange(e.start, e.end), f.regular, body);
        if (e.role.trim() && (e.org.trim() || e.location.trim())) W.row(e.org.trim(), f.italic, e.location.trim(), f.italic, body);
        W.bullets(e.points);
      });
    },
  };

  if (data.summary.trim()) { W.heading('Summary'); para(data.summary.trim()); }
  // Freshers lead with education and projects; students with internships can put experience first.
  const order = opts.experienceFirst ? ['experience', 'projects', 'skills', 'education'] : ['education', 'skills', 'projects', 'experience'];
  for (const key of order) sections[key]();
  if (lines(data.achievements).length) { W.heading('Achievements'); W.bullets(data.achievements); }
  if (lines(data.certifications).length) { W.heading('Certifications'); W.bullets(data.certifications); }

  return { bytes: await doc.save(), pages: W.pages };
}
