/**
 * Portfolio builder (D-043): turns a student's details into one self-contained index.html (inline CSS, system
 * fonts, optional photo as a data URL) that can be hosted free on Netlify or Vercel. Pure: runs in the browser and
 * in unit tests. Shares the data model with the resume builder (src/lib/resume.ts) so details can be reused.
 */
import { dateRange, lines, type ResumeData } from './resume';

export type Palette = { bg: string; text: string; muted: string; accent: string; card: string; heroBg: string; heroText: string };
export const PALETTE_FIELDS: { key: keyof Palette; label: string }[] = [
  { key: 'bg', label: 'Page background' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Secondary text' },
  { key: 'accent', label: 'Buttons and links' },
  { key: 'card', label: 'Cards' },
  { key: 'heroBg', label: 'Top banner background' },
  { key: 'heroText', label: 'Top banner text' },
];

type Layout = 'single' | 'sidebar' | 'hero' | 'split' | 'navbar' | 'pro' | 'basic';
type Spec = { id: string; name: string; description: string; layout: Layout; font: 'sans' | 'serif' | 'mono'; projects: 'stack' | 'grid'; heading: 'plain' | 'hash' | 'bar' | 'underline'; radius: number; palette: Palette };

const P = (bg: string, text: string, muted: string, accent: string, card: string, heroBg: string, heroText: string): Palette => ({ bg, text, muted, accent, card, heroBg, heroText });

/** Fourteen templates: a layout, font and heading style plus a default palette the student can change. */
export const PORTFOLIO_TEMPLATES = [
  { id: 'pro', name: 'Professional site', description: 'Like a real developer site: menu, big intro, numbered projects, timeline, contact.', layout: 'pro', font: 'sans', projects: 'grid', heading: 'plain', radius: 16, palette: P('#ffffff', '#0f172a', '#64748b', '#4f46e5', '#f8fafc', '#eef2ff', '#0f172a') },
  { id: 'basic', name: 'Basic', description: 'Plain and simple: just text and links.', layout: 'basic', font: 'sans', projects: 'stack', heading: 'plain', radius: 0, palette: P('#ffffff', '#111111', '#555555', '#1a0dab', '#ffffff', '#ffffff', '#111111') },
  { id: 'minimal', name: 'Minimal', description: 'Clean, light, one column.', layout: 'single', font: 'sans', projects: 'stack', heading: 'plain', radius: 12, palette: P('#ffffff', '#1f2328', '#59636e', '#6a5cb1', '#ffffff', '#ffffff', '#1f2328') },
  { id: 'dark', name: 'Developer dark', description: 'GitHub-style dark, # headings.', layout: 'single', font: 'sans', projects: 'stack', heading: 'hash', radius: 10, palette: P('#0d1117', '#e6edf3', '#8b949e', '#58a6ff', '#161b22', '#0d1117', '#e6edf3') },
  { id: 'sidebar', name: 'Sidebar', description: 'Profile fixed on the left.', layout: 'sidebar', font: 'sans', projects: 'stack', heading: 'bar', radius: 12, palette: P('#ffffff', '#1f2328', '#59636e', '#2563eb', '#f8fafc', '#f1f5f9', '#0f172a') },
  { id: 'cards', name: 'Project cards', description: 'Colour banner, projects in cards.', layout: 'hero', font: 'sans', projects: 'grid', heading: 'plain', radius: 16, palette: P('#f8fafc', '#0f172a', '#475569', '#6a5cb1', '#ffffff', '#6a5cb1', '#ffffff') },
  { id: 'terminal', name: 'Terminal', description: 'Green-on-black, monospace.', layout: 'single', font: 'mono', projects: 'stack', heading: 'hash', radius: 4, palette: P('#0b0f0b', '#c8facc', '#7fae84', '#39d353', '#111811', '#0b0f0b', '#c8facc') },
  { id: 'split', name: 'Split hero', description: 'Big intro beside your photo.', layout: 'split', font: 'sans', projects: 'grid', heading: 'underline', radius: 14, palette: P('#ffffff', '#111827', '#6b7280', '#0f766e', '#f9fafb', '#ecfdf5', '#064e3b') },
  { id: 'navbar', name: 'Top menu', description: 'Sticky menu with section links.', layout: 'navbar', font: 'sans', projects: 'grid', heading: 'bar', radius: 12, palette: P('#ffffff', '#1f2937', '#6b7280', '#1d4ed8', '#f9fafb', '#111827', '#ffffff') },
  { id: 'magazine', name: 'Magazine', description: 'Serif type, editorial feel.', layout: 'single', font: 'serif', projects: 'stack', heading: 'underline', radius: 2, palette: P('#fffdf8', '#1c1917', '#78716c', '#b45309', '#ffffff', '#fffdf8', '#1c1917') },
  { id: 'neon', name: 'Neon', description: 'Dark with a bright accent.', layout: 'hero', font: 'sans', projects: 'grid', heading: 'plain', radius: 18, palette: P('#0a0a12', '#eef0ff', '#9aa0c3', '#ff3cac', '#141428', '#14102a', '#ffffff') },
  { id: 'pastel', name: 'Pastel', description: 'Soft colours, rounded cards.', layout: 'split', font: 'sans', projects: 'grid', heading: 'plain', radius: 22, palette: P('#fdf7ff', '#2e2240', '#6f6383', '#9d4edd', '#ffffff', '#f3e8ff', '#2e2240') },
  { id: 'corporate', name: 'Professional', description: 'Navy banner, crisp and formal.', layout: 'hero', font: 'sans', projects: 'stack', heading: 'bar', radius: 6, palette: P('#ffffff', '#0f172a', '#475569', '#0b3d91', '#f8fafc', '#0b3d91', '#ffffff') },
  { id: 'sunset', name: 'Sunset', description: 'Warm banner, sidebar layout.', layout: 'sidebar', font: 'sans', projects: 'grid', heading: 'underline', radius: 14, palette: P('#fffaf5', '#2b1a12', '#7c5a48', '#e85d04', '#ffffff', '#ffedd5', '#7c2d12') },
] as const satisfies readonly Spec[];

export type PortfolioTemplate = (typeof PORTFOLIO_TEMPLATES)[number]['id'];
export const templateSpec = (id: string): Spec => (PORTFOLIO_TEMPLATES.find((t) => t.id === id) ?? PORTFOLIO_TEMPLATES[0]) as Spec;

export type PortfolioOptions = { template: PortfolioTemplate; colors?: Partial<Palette>; photo?: string; credit?: boolean };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Only web, mail and phone links survive; anything else (javascript:, data:) is dropped. Bare domains get https://. */
export function safeUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (/^mailto:[^\s]+$/i.test(u) || /^tel:[+\d\s()-]+$/i.test(u)) return u;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const safePhoto = (p?: string) => (p && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : '');
export const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/** Template palette with the student's valid colour choices on top. */
export function resolvePalette(template: string, colors?: Partial<Palette>): Palette {
  const base = { ...templateSpec(template).palette } as Palette;
  for (const f of PALETTE_FIELDS) { const c = colors?.[f.key]; if (isHex(c)) base[f.key] = c; }
  return base;
}

/** Relative luminance, to pick readable text on the accent colour (buttons). */
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export const onColour = (hex: string) => (lum(hex) > 0.45 ? '#111111' : '#ffffff');

function linkList(d: ResumeData): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  if (d.email.trim()) out.push({ label: 'Email', href: `mailto:${d.email.trim()}` });
  for (const l of d.links) { const href = safeUrl(l.url); if (href) out.push({ label: l.label.trim() || new URL(href).hostname, href }); }
  return out;
}

type SectionStyle = { grid: boolean; plain?: boolean; numbered?: boolean; timeline?: boolean };

function sections(d: ResumeData, st: SectionStyle): { html: string; ids: [string, string][] } {
  const grid = st.grid;
  const s: string[] = [];
  const ids: [string, string][] = [];
  const add = (id: string, title: string, inner: string) => { ids.push([id, title]); s.push(`<section id="${id}"><h2>${title}</h2>${inner}</section>`); };
  if (d.summary.trim()) add('about', 'About', lines(d.summary).map((p) => `<p>${esc(p)}</p>`).join(''));
  const chips = (t: string) => st.plain
    ? `<p class="muted">${esc(t.split(',').map((x) => x.trim()).filter(Boolean).join(', '))}</p>`
    : `<p class="tech">${t.split(',').map((x) => x.trim()).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</p>`;
  const projects = d.projects.filter((p) => p.name.trim());
  if (projects.length) add('projects', 'Projects', `<div class="${grid ? 'grid' : 'stack'}">${projects.map((p, i) => {
    const href = safeUrl(p.link);
    const num = st.numbered ? `<span class="num">${String(i + 1).padStart(2, '0')}</span>` : '';
    const pts = lines(p.points);
    return `<article class="project">${num}<h3>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</h3>${p.tech.trim() ? chips(p.tech) : ''}${pts.length ? `<ul>${pts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${href && !st.plain ? `<p class="more"><a class="btn" href="${esc(href)}" target="_blank" rel="noopener">View project</a></p>` : ''}</article>`;
  }).join('')}</div>`);
  const skills = d.skills.filter((g) => g.items.trim());
  if (skills.length) add('skills', 'Skills', skills.map((g) => `<div class="skill"><h3>${esc(g.label)}</h3>${chips(g.items)}</div>`).join(''));
  const exp = d.experience.filter((e) => e.role.trim() || e.org.trim());
  if (exp.length) add('experience', 'Experience', (st.timeline ? '<div class="timeline">' : '<div>') + exp.map((e) => `<article class="item"><div class="row"><h3>${esc(e.role)}${e.org.trim() ? ` · ${esc(e.org)}` : ''}</h3><span class="when">${esc(dateRange(e.start, e.end))}</span></div>${lines(e.points).length ? `<ul>${lines(e.points).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</article>`).join('') + '</div>');
  const edu = d.education.filter((e) => e.school.trim());
  if (edu.length) add('education', 'Education', edu.map((e) => `<article class="item"><div class="row"><h3>${esc(e.degree || e.school)}</h3><span class="when">${esc(dateRange(e.start, e.end))}</span></div><p>${esc([e.degree ? e.school : '', e.location, e.score].filter((x) => x.trim()).join(' · '))}</p></article>`).join(''));
  const ach = lines(d.achievements).concat(lines(d.certifications));
  if (ach.length) add('achievements', 'Achievements', `<ul>${ach.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
  return { html: s.join('\n'), ids };
}

const FONTS = { sans: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', serif: 'Georgia,"Iowan Old Style","Times New Roman",serif', mono: 'ui-monospace,"Cascadia Code",Consolas,monospace' };
const HEADING = {
  plain: '',
  hash: 'h2::before{content:"# ";color:var(--a)}',
  bar: 'h2{padding-left:.75rem;border-left:4px solid var(--a)}',
  underline: 'h2{display:inline-block;padding-bottom:.3rem;border-bottom:3px solid var(--a)}',
};

/** The whole portfolio as one HTML file. */
export function buildPortfolioHtml(d: ResumeData, o: PortfolioOptions): string {
  const spec = templateSpec(o.template);
  const c = resolvePalette(spec.id, o.colors);
  const name = d.name.trim() || 'Your Name';
  const photo = safePhoto(o.photo);
  const pic = photo ? `<img class="photo" src="${photo}" alt="Photo of ${esc(name)}" width="128" height="128">` : `<div class="avatar" aria-hidden="true">${esc(initials(name))}</div>`;
  const links = linkList(d);
  const linksHtml = links.length ? `<ul class="links">${links.map((l) => `<li><a href="${esc(l.href)}"${l.href.startsWith('http') ? ' target="_blank" rel="noopener me"' : ''}>${esc(l.label)}</a></li>`).join('')}</ul>` : '';
  const sub = [d.headline.trim(), d.location.trim()].filter(Boolean).map((x) => `<p class="sub">${esc(x)}</p>`).join('');
  const description = (d.summary.trim() || d.headline.trim() || `Portfolio of ${name}`).replace(/\s+/g, ' ').slice(0, 155);
  const credit = o.credit !== false ? `<p>Built with the free <a href="https://trutiai.in/students/portfolio-builder/">TrutiAI portfolio builder</a>.</p>` : '';
  const { html: body, ids } = sections(d, { grid: spec.projects === 'grid', plain: spec.layout === 'basic', numbered: spec.layout === 'pro', timeline: spec.layout === 'pro' });
  const footer = `<footer><p>© ${new Date().getFullYear()} ${esc(name)}</p>${credit}</footer>`;
  const intro = `<h1>${esc(name)}</h1>${sub}${linksHtml}`;

  const vars = `:root{--bg:${c.bg};--fg:${c.text};--muted:${c.muted};--a:${c.accent};--on-a:${onColour(c.accent)};--card:${c.card};--hero:${c.heroBg};--hero-fg:${c.heroText};--line:color-mix(in srgb,${c.text} 14%,transparent);--chip:color-mix(in srgb,${c.accent} 16%,${c.bg});--r:${spec.radius}px}`;
  const base = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 ${FONTS[spec.font]}}
img{max-width:100%}a{color:var(--a)}h1,h2,h3{line-height:1.2;margin:0}h1{font-size:clamp(2rem,6vw,3rem)}h2{font-size:1.4rem;margin:0 0 1.1rem}h3{font-size:1.05rem}
section{margin:0 0 3rem;scroll-margin-top:5rem}p{margin:.4rem 0}ul{margin:.5rem 0;padding-left:1.2rem}li{margin:.2rem 0}.sub{color:var(--muted);font-size:1.1rem}
.tech{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0}.tech span{font-size:.8rem;padding:.15rem .65rem;border-radius:999px;background:var(--chip);color:var(--fg)}
.links{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.1rem 0 0;padding:0;list-style:none}.links a{display:inline-block;padding:.45rem 1rem;border-radius:999px;text-decoration:none;font-size:.9rem;font-weight:600;background:var(--a);color:var(--on-a)}.links a:hover{filter:brightness(1.1)}
.btn{display:inline-block;padding:.35rem .9rem;border-radius:var(--r);background:var(--a);color:var(--on-a);text-decoration:none;font-size:.85rem;font-weight:600}
.photo,.avatar{width:128px;height:128px;border-radius:50%;flex:none}.photo{object-fit:cover;display:block}.avatar{display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:700;background:var(--a);color:var(--on-a)}
.project,.item{margin:0 0 1.5rem}.row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem;align-items:baseline}.when{font-size:.85rem;color:var(--muted)}
.stack .project{padding:0 0 1.5rem;border-bottom:1px solid var(--line)}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.grid .project{margin:0;padding:1.25rem;border:1px solid var(--line);border-radius:var(--r);background:var(--card)}
.item{padding:1rem 1.1rem;border-radius:var(--r);background:var(--card);border:1px solid var(--line)}.skill{margin:0 0 .8rem}.skill h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
footer{font-size:.85rem;color:var(--muted);padding:2rem 0}footer a{color:inherit}
.hero{background:var(--hero);color:var(--hero-fg)}.hero .sub{color:inherit;opacity:.85}
${HEADING[spec.heading]}`;

  let layout: string, css: string;
  switch (spec.layout) {
    case 'sidebar':
      css = `.wrap{max-width:1120px;margin:0 auto;padding:2rem 1.25rem;display:grid;gap:2.5rem}aside{padding:1.75rem;border-radius:var(--r)}aside h1{font-size:1.9rem;margin-top:1rem}aside .links{flex-direction:column;align-items:flex-start}@media(min-width:880px){.wrap{grid-template-columns:300px 1fr}aside{position:sticky;top:2rem;align-self:start}}`;
      layout = `<div class="wrap"><aside class="hero">${pic}${intro}</aside><main>${body}${footer}</main></div>`;
      break;
    case 'hero':
      // Banner is often the accent colour: outline buttons and a ringed avatar stay visible on it.
      css = `.hero .links a{background:transparent;color:var(--hero-fg);border:1.5px solid currentColor}.hero .avatar{background:color-mix(in srgb,var(--hero-fg) 18%,transparent);color:var(--hero-fg);border:3px solid var(--hero-fg)}.hero .photo{border:3px solid var(--hero-fg)}.hero{padding:4.5rem 1.25rem 3.5rem}.hero .in{max-width:1040px;margin:0 auto;display:flex;flex-wrap:wrap;gap:2rem;align-items:center}main{max-width:1040px;margin:0 auto;padding:3rem 1.25rem}`;
      layout = `<header class="hero"><div class="in">${pic}<div>${intro}</div></div></header><main>${body}${footer}</main>`;
      break;
    case 'split':
      css = `.hero{padding:3.5rem 1.25rem}.hero .in{max-width:1080px;margin:0 auto;display:grid;gap:2.5rem;align-items:center}.hero .photo,.hero .avatar{width:220px;height:220px;font-size:4rem;border-radius:var(--r);justify-self:center}@media(min-width:820px){.hero .in{grid-template-columns:1fr 260px}.hero h1{font-size:3.4rem}}main{max-width:1080px;margin:0 auto;padding:3rem 1.25rem}`;
      layout = `<header class="hero"><div class="in"><div>${intro}</div>${pic}</div></header><main>${body}${footer}</main>`;
      break;
    case 'navbar':
      css = `nav{position:sticky;top:0;z-index:5;background:var(--hero);color:var(--hero-fg)}nav .in{max-width:1040px;margin:0 auto;padding:.8rem 1.25rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center}nav strong{margin-right:auto}nav a{color:inherit;text-decoration:none;font-size:.9rem;opacity:.85}nav a:hover{opacity:1}header{max-width:1040px;margin:0 auto;padding:3.5rem 1.25rem 1rem;display:flex;flex-wrap:wrap;gap:2rem;align-items:center}main{max-width:1040px;margin:0 auto;padding:2rem 1.25rem}`;
      layout = `<nav class="hero" aria-label="Sections"><div class="in"><strong>${esc(name)}</strong>${ids.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</div></nav><header>${pic}<div>${intro}</div></header><main>${body}${footer}</main>`;
      break;
    case 'basic':
      css = `main{max-width:720px;margin:0 auto;padding:2.5rem 1.25rem}header{margin:0 0 2rem;padding:0 0 1.5rem;border-bottom:1px solid var(--line)}header h1{font-size:2rem}.links{gap:0}.links li+li::before{content:"·";margin:0 .6rem;color:var(--muted)}.links a{background:none;color:var(--a);padding:0;border-radius:0;font-weight:400;font-size:1rem;text-decoration:underline}h2{font-size:1.2rem;margin:0 0 .6rem}section{margin:0 0 2rem}.item{padding:0;border:0;background:none;margin:0 0 1rem}.stack .project{padding:0 0 1rem;border:0;margin:0 0 1rem}.project h3,.item h3{font-size:1rem}`;
      layout = `<main><header><h1>${esc(name)}</h1>${sub}${linksHtml}</header>${body}${footer}</main>`;
      break;
    case 'pro': {
      const email = d.email.trim();
      const firstName = name.split(/\s+/)[0];
      const contact = `<section id="contact" class="contact"><p class="eyebrow">What’s next?</p><h2>Let’s work together</h2><p class="muted">I’m open to internships and full-time roles. The fastest way to reach me is email.</p>${email ? `<p><a class="btn big" href="mailto:${esc(email)}">Say hello</a></p>` : ''}${linksHtml}</section>`;
      css = `.nav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}.nav .in{max-width:1120px;margin:0 auto;padding:.9rem 1.25rem;display:flex;gap:1.4rem;align-items:center;flex-wrap:wrap}.nav .logo{margin-right:auto;font-weight:800;font-size:1.15rem;color:var(--fg);text-decoration:none}.nav .logo b{color:var(--a)}.nav a{color:var(--muted);text-decoration:none;font-size:.92rem;font-weight:500}.nav a:hover{color:var(--a)}.nav .cta{color:var(--on-a);background:var(--a);padding:.45rem 1rem;border-radius:999px}
.intro{max-width:1120px;margin:0 auto;padding:5rem 1.25rem 4rem;display:grid;gap:3rem;align-items:center}@media(min-width:880px){.intro{grid-template-columns:1.4fr 1fr}}
.eyebrow{color:var(--a);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:.85rem;margin:0 0 .6rem}.intro h1{font-size:clamp(2.4rem,7vw,4.2rem);letter-spacing:-.02em}.intro .tag{font-size:clamp(1.15rem,2.6vw,1.5rem);color:var(--muted);margin:.8rem 0 0}.intro .lead{max-width:38rem;margin:1.2rem 0 0;font-size:1.05rem}.ctas{display:flex;flex-wrap:wrap;gap:.8rem;margin:2rem 0 0}.ghost{display:inline-block;padding:.75rem 1.4rem;border-radius:999px;border:1.5px solid var(--line);color:var(--fg);text-decoration:none;font-weight:600}.ghost:hover{border-color:var(--a);color:var(--a)}.btn.big{padding:.75rem 1.5rem;border-radius:999px;font-size:1rem}
.art{position:relative;justify-self:center}.art::before{content:"";position:absolute;inset:-18px;border-radius:40% 60% 55% 45%/50% 45% 55% 50%;background:var(--hero);z-index:0}.art .photo,.art .avatar{position:relative;z-index:1;width:260px;height:260px;font-size:4.5rem;border-radius:40% 60% 55% 45%/50% 45% 55% 50%}
main{max-width:1120px;margin:0 auto;padding:1rem 1.25rem}main section{padding:3rem 0;border-top:1px solid var(--line)}main h2{font-size:clamp(1.6rem,3.5vw,2.2rem);letter-spacing:-.01em;margin-bottom:1.6rem}
.grid .project{position:relative;padding:1.6rem;transition:transform .15s,box-shadow .15s}.grid .project:hover{transform:translateY(-3px);box-shadow:0 12px 30px -12px color-mix(in srgb,var(--fg) 30%,transparent)}.num{display:block;font-size:2rem;font-weight:800;color:color-mix(in srgb,var(--a) 35%,var(--bg));line-height:1;margin:0 0 .8rem}
.timeline{position:relative;padding-left:1.6rem;border-left:2px solid var(--line)}.timeline .item{position:relative;background:none;border:0;padding:0 0 1.8rem}.timeline .item::before{content:"";position:absolute;left:calc(-1.6rem - 7px);top:.35rem;width:12px;height:12px;border-radius:50%;background:var(--a);box-shadow:0 0 0 4px var(--bg)}
.contact{text-align:center;padding:4rem 0}.contact .links{justify-content:center}.contact .links a{background:transparent;color:var(--fg);border:1.5px solid var(--line)}footer{text-align:center}`;
      layout = `<nav class="nav" aria-label="Main"><div class="in"><a class="logo" href="#top">${esc(firstName)}<b>.</b></a>${ids.filter(([id]) => id !== 'achievements').map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}<a class="cta" href="#contact">Contact</a></div></nav><header class="intro" id="top"><div><p class="eyebrow">Hi, I’m</p><h1>${esc(name)}</h1>${d.headline.trim() ? `<p class="tag">${esc(d.headline.trim())}</p>` : ''}${d.summary.trim() ? `<p class="lead">${esc(lines(d.summary)[0] ?? '')}</p>` : ''}<div class="ctas">${body.includes('id="projects"') ? '<a class="btn big" href="#projects">View my work</a>' : ''}<a class="ghost" href="#contact">Get in touch</a></div></div><div class="art">${pic}</div></header><main>${body}${contact}${footer}</main>`;
      break;
    }
    default:
      css = `main{max-width:780px;margin:0 auto;padding:4rem 1.25rem 2rem}header{margin:0 0 3.5rem;padding:2rem;border-radius:var(--r)}header h1{margin-top:1.2rem}`;
      layout = `<main><header class="hero">${pic}${intro}</header>${body}${footer}</main>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}${d.headline.trim() ? ` · ${esc(d.headline.trim())}` : ''}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="profile">
<meta name="generator" content="TrutiAI portfolio builder (${spec.id})">
<style>${vars}
${base}
${css}</style>
</head>
<body>
${layout}
</body>
</html>
`;
}

// ---------- ZIP (store only, no compression) so the file can be dropped on Netlify as-is ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A minimal ZIP with the given text files (UTF-8). Enough for Netlify Drop and every unzip tool. */
export function makeZip(files: { name: string; text: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
    v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
    local.set(name, 30);
    const c = new Uint8Array(46 + name.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true);
    w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true); w.setUint16(28, name.length, true); w.setUint32(42, offset, true);
    c.set(name, 46);
    parts.push(local, data); central.push(c);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

export const README = (name: string) => `# ${name || 'My'} portfolio

Made with the TrutiAI portfolio builder: https://trutiai.in/students/portfolio-builder/

The whole site is one file, index.html. Open it in a browser to see it.

Launch it free:
- Netlify: go to https://app.netlify.com/drop and drag this folder (or the zip) onto the page.
- Vercel: put these files in a GitHub repository, then import it at https://vercel.com/new (Framework: Other).

To change something later, edit index.html in any text editor, or build it again on TrutiAI and replace the file.
`;
