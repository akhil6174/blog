/**
 * Portfolio builder (D-043): fill in details (or reuse the resume builder's), pick one of 12 templates, change any
 * of its colours (background, text, buttons, cards, top banner), see the
 * real site in a live preview, and download a ZIP (index.html + README) ready for Netlify Drop or Vercel.
 * Everything runs in the browser and is saved only in this browser. Generator: src/lib/portfolio.ts.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { buildPortfolioHtml, isHex, makeZip, PALETTE_FIELDS, type Palette, PORTFOLIO_TEMPLATES, type PortfolioTemplate, README, resolvePalette } from '../../lib/portfolio';
import { normalizeResume, SAMPLE_RESUME, type ResumeData } from '../../lib/resume';

const KEY = 'trutiai-portfolio-v1';
const RESUME_KEY = 'trutiai-resume-v1';
const input = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm';
const fileBase = (n: string) => (n.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my') + '-portfolio';

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Field({ label, value, onInput, area, placeholder, hint }: { label: string; value: string; onInput: (v: string) => void; area?: number; placeholder?: string; hint?: string }) {
  return (
    <label class="grid gap-1 text-sm">
      <span class="font-semibold">{label}{hint && <span class="font-normal text-muted"> · {hint}</span>}</span>
      {area
        ? <textarea rows={area} class={input} value={value} placeholder={placeholder} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
        : <input class={input} value={value} placeholder={placeholder} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />}
    </label>
  );
}

export default function PortfolioBuilder() {
  const [d, setD] = useState<ResumeData>(SAMPLE_RESUME);
  const [template, setTemplate] = useState<PortfolioTemplate>('minimal');
  const [colors, setColors] = useState<Partial<Palette>>({});
  const [photo, setPhoto] = useState('');
  const [credit, setCredit] = useState(true);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (s) {
        setD(normalizeResume(s.data));
        if (PORTFOLIO_TEMPLATES.some((t) => t.id === s.template)) setTemplate(s.template);
        if (s.colors && typeof s.colors === 'object') setColors(Object.fromEntries(Object.entries(s.colors).filter(([k, v]) => PALETTE_FIELDS.some((f) => f.key === k) && isHex(v))));
        if (typeof s.photo === 'string') setPhoto(s.photo);
        if (s.credit === false) setCredit(false);
      }
    } catch { /* keep the example */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify({ data: d, template, colors, photo, credit })); } catch { setMsg('Your browser could not save this draft (storage full?). Download it to keep it.'); }
  }, [d, template, colors, photo, credit, loaded]);

  const html = useMemo(() => buildPortfolioHtml(d, { template, colors, photo, credit }), [d, template, colors, photo, credit]);
  const palette = resolvePalette(template, colors);
  const set = <K extends keyof ResumeData>(k: K, v: ResumeData[K]) => setD((x) => ({ ...x, [k]: v }));
  const setItem = <K extends 'links' | 'projects' | 'experience' | 'education' | 'skills'>(k: K, i: number, patch: Partial<ResumeData[K][number]>) =>
    setD((x) => ({ ...x, [k]: (x[k] as ResumeData[K][number][]).map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const add = <K extends 'links' | 'projects' | 'experience' | 'education' | 'skills'>(k: K, blank: ResumeData[K][number]) => setD((x) => ({ ...x, [k]: [...(x[k] as unknown[]), blank] }));
  const remove = (k: 'links' | 'projects' | 'experience' | 'education' | 'skills', i: number) => setD((x) => ({ ...x, [k]: (x[k] as unknown[]).filter((_, j) => j !== i) }));

  function useResume() {
    try {
      const r = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
      if (!r?.data) { setMsg('No saved resume in this browser yet. Make one in the resume builder, or fill in the form below.'); return; }
      setD(normalizeResume(r.data));
      setMsg('Filled in from your resume. Add a short "About" and check your project links.');
    } catch { setMsg('Could not read your saved resume.'); }
  }

  async function pickPhoto(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const side = Math.min(bmp.width, bmp.height);
      const c = document.createElement('canvas'); c.width = c.height = 320;
      c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
      setPhoto(c.toDataURL('image/jpeg', 0.85));
      setMsg('');
    } catch { setMsg('That image could not be read. Try a JPG or PNG.'); }
  }

  const base = fileBase(d.name);
  const zip = () => download(`${base}.zip`, makeZip([{ name: 'index.html', text: html }, { name: 'README.md', text: README(d.name) }]), 'application/zip');

  return (
    <div class="grid gap-6 font-sans lg:grid-cols-[minmax(0,26rem)_1fr]">
      <div class="grid content-start gap-5">
        <div class="rounded-2xl border border-line bg-surface p-4">
          <p class="text-sm font-semibold">Template</p>
          <div class="mt-2 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Template">
            {PORTFOLIO_TEMPLATES.map((t) => (
              <button type="button" role="radio" aria-checked={template === t.id} onClick={() => { setTemplate(t.id); setColors({}); }} class={`rounded-lg border p-2 text-left text-xs ${template === t.id ? 'border-accent bg-tint' : 'border-line hover:border-accent'}`} data-template={t.id}>
                <span class="mb-1 flex gap-1" aria-hidden="true">{[t.palette.heroBg, t.palette.bg, t.palette.accent, t.palette.text].map((c) => <span class="h-3 w-3 rounded-full border border-line" style={{ background: c }} />)}</span><span class="block text-sm font-semibold text-ink">{t.name}</span><span class="text-muted">{t.description}</span>
              </button>
            ))}
          </div>
          <details class="mt-3" data-testid="colours">
            <summary class="cursor-pointer text-sm font-semibold">Customize colours</summary>
            <div class="mt-2 grid grid-cols-2 gap-2">
              {PALETTE_FIELDS.map((f) => (
                <label class="flex items-center gap-2 text-xs">
                  <input type="color" value={palette[f.key]} onInput={(e) => setColors((c) => ({ ...c, [f.key]: (e.target as HTMLInputElement).value }))} class="h-8 w-10 shrink-0 cursor-pointer rounded border border-line bg-surface" data-colour={f.key} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
            <button type="button" class="mt-2 text-xs text-muted underline" onClick={() => setColors({})}>Reset to the template’s colours</button>
          </details>
          <button type="button" onClick={useResume} class="mt-4 w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-accent" data-testid="use-resume">Use my details from the resume builder</button>
          <p class="mt-2 min-h-5 text-xs text-accent" role="status">{msg}</p>
        </div>

        <details open class="rounded-2xl border border-line bg-surface p-4">
          <summary class="cursor-pointer font-semibold">Profile</summary>
          <div class="mt-3 grid gap-3">
            <div class="flex items-center gap-3">
              {photo ? <img src={photo} alt="" width={56} height={56} class="h-14 w-14 rounded-full object-cover" /> : <span class="flex h-14 w-14 items-center justify-center rounded-full bg-tint text-xs text-muted">Photo</span>}
              <label class="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent">Add photo<input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" onChange={pickPhoto} data-testid="photo" /></label>
              {photo && <button type="button" class="text-sm text-red-700 underline" onClick={() => setPhoto('')}>Remove</button>}
            </div>
            <Field label="Name" value={d.name} onInput={(v) => set('name', v)} />
            <Field label="Headline" value={d.headline} onInput={(v) => set('headline', v)} placeholder="Final-year CSE student · Full-stack developer" />
            <Field label="Location" value={d.location} onInput={(v) => set('location', v)} />
            <Field label="Email" value={d.email} onInput={(v) => set('email', v)} />
            <Field label="About you" area={4} value={d.summary} onInput={(v) => set('summary', v)} hint="2–4 sentences" placeholder="What you build, what you are learning, and what kind of role you want." />
          </div>
        </details>

        <details open class="rounded-2xl border border-line bg-surface p-4">
          <summary class="cursor-pointer font-semibold">Links</summary>
          <div class="mt-3 grid gap-2">
            {d.links.map((l, i) => (
              <div class="grid grid-cols-[7rem_1fr_auto] gap-2">
                <input class={input} value={l.label} aria-label="Link name" onInput={(e) => setItem('links', i, { label: (e.target as HTMLInputElement).value })} />
                <input class={input} value={l.url} aria-label="Link address" placeholder="github.com/you" onInput={(e) => setItem('links', i, { url: (e.target as HTMLInputElement).value })} />
                <button type="button" class="px-2 text-muted hover:text-red-700" aria-label="Remove link" onClick={() => remove('links', i)}>×</button>
              </div>
            ))}
            <button type="button" class="justify-self-start text-sm font-semibold text-accent" onClick={() => add('links', { label: '', url: '' })}>+ Add link</button>
          </div>
        </details>

        <details open class="rounded-2xl border border-line bg-surface p-4">
          <summary class="cursor-pointer font-semibold">Projects</summary>
          <div class="mt-3 grid gap-4">
            {d.projects.map((p, i) => (
              <div class="grid gap-2 rounded-lg border border-line p-3">
                <Field label="Project name" value={p.name} onInput={(v) => setItem('projects', i, { name: v })} />
                <Field label="Tech" value={p.tech} onInput={(v) => setItem('projects', i, { tech: v })} hint="comma-separated" />
                <Field label="Link" value={p.link} onInput={(v) => setItem('projects', i, { link: v })} placeholder="Live site or GitHub repo" />
                <Field label="What it does" area={3} value={p.points} onInput={(v) => setItem('projects', i, { points: v })} hint="one point per line" />
                <button type="button" class="justify-self-start text-xs text-red-700 underline" onClick={() => remove('projects', i)}>Remove project</button>
              </div>
            ))}
            <button type="button" class="justify-self-start text-sm font-semibold text-accent" onClick={() => add('projects', { name: '', tech: '', link: '', start: '', end: '', points: '' })}>+ Add project</button>
          </div>
        </details>

        <details class="rounded-2xl border border-line bg-surface p-4">
          <summary class="cursor-pointer font-semibold">Skills</summary>
          <div class="mt-3 grid gap-2">
            {d.skills.map((g, i) => (
              <div class="grid grid-cols-[7rem_1fr_auto] gap-2">
                <input class={input} value={g.label} aria-label="Skill group" onInput={(e) => setItem('skills', i, { label: (e.target as HTMLInputElement).value })} />
                <input class={input} value={g.items} aria-label="Skills" placeholder="Python, React, SQL" onInput={(e) => setItem('skills', i, { items: (e.target as HTMLInputElement).value })} />
                <button type="button" class="px-2 text-muted hover:text-red-700" aria-label="Remove skill group" onClick={() => remove('skills', i)}>×</button>
              </div>
            ))}
            <button type="button" class="justify-self-start text-sm font-semibold text-accent" onClick={() => add('skills', { label: '', items: '' })}>+ Add skill group</button>
          </div>
        </details>

        <details class="rounded-2xl border border-line bg-surface p-4">
          <summary class="cursor-pointer font-semibold">Experience</summary>
          <div class="mt-3 grid gap-4">
            {d.experience.map((e, i) => (
              <div class="grid gap-2 rounded-lg border border-line p-3">
                <Field label="Role" value={e.role} onInput={(v) => setItem('experience', i, { role: v })} />
                <Field label="Company or club" value={e.org} onInput={(v) => setItem('experience', i, { org: v })} />
                <div class="grid grid-cols-2 gap-2"><Field label="From" value={e.start} onInput={(v) => setItem('experience', i, { start: v })} placeholder="Jun 2025" /><Field label="To" value={e.end} onInput={(v) => setItem('experience', i, { end: v })} placeholder="Present" /></div>
                <Field label="What you did" area={3} value={e.points} onInput={(v) => setItem('experience', i, { points: v })} hint="one point per line" />
                <button type="button" class="justify-self-start text-xs text-red-700 underline" onClick={() => remove('experience', i)}>Remove</button>
              </div>
            ))}
            <button type="button" class="justify-self-start text-sm font-semibold text-accent" onClick={() => add('experience', { role: '', org: '', location: '', start: '', end: '', points: '' })}>+ Add experience</button>
          </div>
        </details>

        <details class="rounded-2xl border border-line bg-surface p-4">
          <summary class="cursor-pointer font-semibold">Education and achievements</summary>
          <div class="mt-3 grid gap-4">
            {d.education.map((e, i) => (
              <div class="grid gap-2 rounded-lg border border-line p-3">
                <Field label="College or school" value={e.school} onInput={(v) => setItem('education', i, { school: v })} />
                <Field label="Degree" value={e.degree} onInput={(v) => setItem('education', i, { degree: v })} />
                <div class="grid grid-cols-3 gap-2"><Field label="From" value={e.start} onInput={(v) => setItem('education', i, { start: v })} /><Field label="To" value={e.end} onInput={(v) => setItem('education', i, { end: v })} /><Field label="CGPA" value={e.score} onInput={(v) => setItem('education', i, { score: v })} /></div>
                <button type="button" class="justify-self-start text-xs text-red-700 underline" onClick={() => remove('education', i)}>Remove</button>
              </div>
            ))}
            <button type="button" class="justify-self-start text-sm font-semibold text-accent" onClick={() => add('education', { school: '', degree: '', location: '', start: '', end: '', score: '' })}>+ Add education</button>
            <Field label="Achievements" area={3} value={d.achievements} onInput={(v) => set('achievements', v)} hint="one per line" />
          </div>
        </details>
      </div>

      <div class="grid content-start gap-3 lg:sticky lg:top-20 lg:self-start">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" onClick={zip} class="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-strong" data-testid="download-zip">Download for Netlify / Vercel (.zip)</button>
          <button type="button" onClick={() => download('index.html', html, 'text/html')} class="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent" data-testid="download-html">Just index.html</button>
          <a href="#launch" class="text-sm font-semibold text-accent underline">How to put it online ↓</a>
        </div>
        <label class="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={credit} onChange={() => setCredit(!credit)} /> Show a small "Built with TrutiAI" line in the footer</label>
        <div class="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div class="flex items-center gap-1.5 border-b border-line px-3 py-2" aria-hidden="true"><span class="h-2.5 w-2.5 rounded-full bg-line" /><span class="h-2.5 w-2.5 rounded-full bg-line" /><span class="h-2.5 w-2.5 rounded-full bg-line" /><span class="ml-2 text-xs text-muted">{base}.netlify.app</span></div>
          <iframe title="Live preview of your portfolio" srcdoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" class="h-[75vh] w-full bg-white" data-testid="preview" />
        </div>
      </div>
    </div>
  );
}
