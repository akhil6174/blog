/**
 * Resume builder (D-039): a form on the left, the real PDF preview on the right, three templates, one-click
 * download. Everything happens in the browser; the resume is saved only in this browser (localStorage).
 * The PDF code (pdf-lib) is loaded on first preview, so the page itself stays light.
 */
import { track } from '../../lib/usage';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  ACCENTS, EMPTY_RESUME, normalizeResume, resumeFileName, SAMPLE_RESUME, TEMPLATES,
  type Education, type Experience, type Project, type ResumeData, type SkillGroup, type TemplateId,
} from '../../lib/resume';

const KEY = 'trutiai-resume-v1';
const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none';
// The PDF fonts cover Latin letters only (English and most European languages).
const NON_LATIN = /[^\u0000-ɏ‐-‧‰-›€₹™]/;

function Text({ label, value, onInput, placeholder, type = 'text', id }: { label: string; value: string; onInput: (v: string) => void; placeholder?: string; type?: string; id?: string }) {
  return (
    <label class="grid gap-1 text-sm">
      <span class="font-semibold">{label}</span>
      <input class={field} type={type} value={value} placeholder={placeholder} data-testid={id} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
    </label>
  );
}
function Area({ label, hint, value, onInput, rows = 3, id }: { label: string; hint?: string; value: string; onInput: (v: string) => void; rows?: number; id?: string }) {
  return (
    <label class="grid gap-1 text-sm">
      <span class="font-semibold">{label}{hint && <span class="font-normal text-muted"> · {hint}</span>}</span>
      <textarea class={field} rows={rows} value={value} data-testid={id} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
    </label>
  );
}
function Section({ title, hint, children, open = false }: { title: string; hint?: string; children: ComponentChildren; open?: boolean }) {
  return (
    <details open={open} class="group rounded-xl border border-line bg-surface">
      <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">
        <span>{title}{hint && <span class="ml-2 text-xs font-normal text-muted">{hint}</span>}</span>
        <span class="text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div class="grid gap-3 border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}
function Repeat<T>({ items, render, onChange, blank, addLabel, max = 10 }: { items: T[]; render: (item: T, set: (patch: Partial<T>) => void, i: number) => ComponentChildren; onChange: (items: T[]) => void; blank: T; addLabel: string; max?: number }) {
  return (
    <>
      {items.map((it, i) => (
        <div class="grid gap-3 rounded-lg border border-line bg-tint p-3">
          {render(it, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
          <div class="flex gap-2 text-xs">
            {i > 0 && <button type="button" class="rounded border border-line bg-surface px-2 py-1" onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}>Move up</button>}
            <button type="button" class="rounded border border-line bg-surface px-2 py-1 text-red-700" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </div>
      ))}
      {items.length < max && <button type="button" class="justify-self-start rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:border-accent" onClick={() => onChange([...items, { ...blank }])}>+ {addLabel}</button>}
    </>
  );
}

export default function ResumeBuilder() {
  const [data, setData] = useState<ResumeData>(SAMPLE_RESUME);
  const [template, setTemplate] = useState<TemplateId>('classic');
  const [accent, setAccent] = useState(ACCENTS[0].hex);
  const [experienceFirst, setExperienceFirst] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; pages: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [inline, setInline] = useState(true);
  const lastUrl = useRef<string | null>(null);
  const loaded = useRef(false);

  // Restore the saved resume; decide whether this browser can show PDFs inline (most phones cannot).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved?.data) setData(normalizeResume(saved.data));
      if (saved?.template && TEMPLATES.some((t) => t.id === saved.template)) setTemplate(saved.template);
      if (saved?.accent && ACCENTS.some((a) => a.hex === saved.accent)) setAccent(saved.accent);
      if (typeof saved?.experienceFirst === 'boolean') setExperienceFirst(saved.experienceFirst);
    } catch { /* storage unavailable */ }
    const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
    setInline(nav.pdfViewerEnabled !== false && !/Android|iPhone|iPad/i.test(navigator.userAgent));
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify({ data, template, accent, experienceFirst })); } catch { /* ignore */ }
  }, [data, template, accent, experienceFirst]);

  // Rebuild the PDF shortly after typing stops.
  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const { buildResumePdf } = await import('../../lib/resume-pdf');
        const out = await buildResumePdf(data, template, { accent, experienceFirst });
        const url = URL.createObjectURL(new Blob([out.bytes], { type: 'application/pdf' }));
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        setPdf({ url, pages: out.pages });
        setErr('');
      } catch (e) {
        setErr(`Could not build the PDF: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [data, template, accent, experienceFirst]);

  const set = <K extends keyof ResumeData>(k: K, v: ResumeData[K]) => setData((d) => ({ ...d, [k]: v }));
  const nonLatin = useMemo(() => NON_LATIN.test(JSON.stringify(data)), [data]);

  const download = () => {
    track('resume-builder', 'download');
    if (!pdf) return;
    const a = document.createElement('a');
    a.href = pdf.url;
    a.download = resumeFileName(data.name);
    document.body.append(a);
    a.click();
    a.remove();
  };

  return (
    <div class="grid gap-6 font-sans lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-tool="resume">
      <div class="grid content-start gap-4">
        <fieldset class="grid gap-2">
          <legend class="mb-2 text-sm font-semibold">Template <span class="font-normal text-muted">({TEMPLATES.length} designs, all ATS-friendly)</span></legend>
          <div class="grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.map((t) => (
              <label class={`cursor-pointer rounded-xl border bg-surface p-3 ${template === t.id ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:border-accent'}`}>
                <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} class="sr-only" data-testid={`tpl-${t.id}`} />
                <span class="block font-semibold">{t.name}</span>
                <span class="mt-1 block text-xs leading-snug text-muted">{t.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div class="grid gap-3 rounded-xl border border-line bg-surface p-3 text-sm sm:grid-cols-2">
          <div>
            <p class="font-semibold">Colour</p>
            {TEMPLATES.find((t) => t.id === template)?.colour ? (
              <div class="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
                {ACCENTS.map((a) => (
                  <button type="button" role="radio" aria-checked={accent === a.hex} title={a.name} aria-label={a.name} data-testid={`accent-${a.id}`} onClick={() => setAccent(a.hex)} class={`h-7 w-7 rounded-full ring-offset-2 ${accent === a.hex ? 'ring-2 ring-ink' : ''}`} style={{ background: a.hex }} />
                ))}
              </div>
            ) : (
              <p class="mt-1 text-xs text-muted">This template is black and white. Pick Modern, Executive, Developer, Engineer, Elegant or Bold to choose a colour.</p>
            )}
          </div>
          <label class="flex items-start gap-2">
            <input type="checkbox" checked={experienceFirst} onChange={(e) => setExperienceFirst((e.target as HTMLInputElement).checked)} class="mt-1 accent-[var(--color-accent)]" data-testid="experience-first" />
            <span><span class="font-semibold">Experience before projects</span><span class="block text-xs text-muted">Turn on if you have internships or work experience. Freshers usually lead with education and projects.</span></span>
          </label>
        </div>

        <div class="flex flex-wrap gap-2 text-sm">
          <button type="button" class="rounded-full border border-line px-3 py-1.5 hover:border-accent" onClick={() => { if (confirm('Replace everything with the example resume?')) setData(SAMPLE_RESUME); }}>Load example</button>
          <button type="button" class="rounded-full border border-line px-3 py-1.5 hover:border-accent" data-testid="clear" onClick={() => { if (confirm('Clear the form and start a blank resume?')) setData(EMPTY_RESUME); }}>Start blank</button>
          <span class="self-center text-xs text-muted">Saved in this browser only. Nothing is uploaded.</span>
        </div>

        <Section title="Your details" open>
          <Text label="Full name" value={data.name} onInput={(v) => set('name', v)} id="r-name" />
          <Text label="Headline" value={data.headline} onInput={(v) => set('headline', v)} placeholder="Final-year CSE student · Full-stack developer" id="r-headline" />
          <div class="grid gap-3 sm:grid-cols-2">
            <Text label="Email" type="email" value={data.email} onInput={(v) => set('email', v)} id="r-email" />
            <Text label="Phone" type="tel" value={data.phone} onInput={(v) => set('phone', v)} />
          </div>
          <Text label="City" value={data.location} onInput={(v) => set('location', v)} />
          <p class="text-sm font-semibold">Links</p>
          <Repeat items={data.links} onChange={(v) => set('links', v)} blank={{ label: 'Portfolio', url: '' }} addLabel="Add link" max={5} render={(l, s) => (
            <div class="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <input class={field} value={l.label} aria-label="Link name" onInput={(e) => s({ label: (e.target as HTMLInputElement).value })} />
              <input class={field} value={l.url} placeholder="https://github.com/you" aria-label={`${l.label} address`} onInput={(e) => s({ url: (e.target as HTMLInputElement).value })} />
            </div>
          )} />
        </Section>

        <Section title="Summary" hint="optional, 2–3 lines">
          <Area label="Summary" value={data.summary} onInput={(v) => set('summary', v)} />
          <p class="text-xs text-muted">Freshers can usually skip this. If you add one, say what you build and what role you want, not generic adjectives.</p>
        </Section>

        <Section title="Education">
          <Repeat<Education> items={data.education} onChange={(v) => set('education', v)} blank={EMPTY_RESUME.education[0]} addLabel="Add education" max={5} render={(e, s) => (
            <>
              <Text label="College or school" value={e.school} onInput={(v) => s({ school: v })} />
              <Text label="Degree" value={e.degree} onInput={(v) => s({ degree: v })} placeholder="B.Tech in Computer Science and Engineering" />
              <div class="grid gap-3 sm:grid-cols-3">
                <Text label="CGPA or %" value={e.score} onInput={(v) => s({ score: v })} placeholder="CGPA 8.4 / 10" />
                <Text label="From" value={e.start} onInput={(v) => s({ start: v })} placeholder="2023" />
                <Text label="To" value={e.end} onInput={(v) => s({ end: v })} placeholder="2027" />
              </div>
              <Text label="City" value={e.location} onInput={(v) => s({ location: v })} />
            </>
          )} />
        </Section>

        <Section title="Technical skills">
          <Repeat<SkillGroup> items={data.skills} onChange={(v) => set('skills', v)} blank={{ label: '', items: '' }} addLabel="Add skill group" max={6} render={(g, s) => (
            <div class="grid gap-2 sm:grid-cols-[9rem_1fr]">
              <input class={field} value={g.label} placeholder="Languages" aria-label="Skill group" onInput={(e) => s({ label: (e.target as HTMLInputElement).value })} />
              <input class={field} value={g.items} placeholder="Python, Java, SQL" aria-label={`${g.label || 'Skill'} list`} onInput={(e) => s({ items: (e.target as HTMLInputElement).value })} />
            </div>
          )} />
        </Section>

        <Section title="Projects" hint="your strongest section as a fresher">
          <Repeat<Project> items={data.projects} onChange={(v) => set('projects', v)} blank={EMPTY_RESUME.projects[0]} addLabel="Add project" max={8} render={(p, s, i) => (
            <>
              <Text label="Project name" value={p.name} onInput={(v) => s({ name: v })} id={`r-project-${i}`} />
              <Text label="Tech used" value={p.tech} onInput={(v) => s({ tech: v })} placeholder="React, FastAPI, PostgreSQL" />
              <Text label="Link (GitHub or live demo)" value={p.link} onInput={(v) => s({ link: v })} />
              <div class="grid gap-3 sm:grid-cols-2">
                <Text label="From" value={p.start} onInput={(v) => s({ start: v })} placeholder="Jan 2026" />
                <Text label="To" value={p.end} onInput={(v) => s({ end: v })} placeholder="Mar 2026" />
              </div>
              <Area label="What you did" hint="one point per line" rows={4} value={p.points} onInput={(v) => s({ points: v })} />
            </>
          )} />
          <p class="text-xs text-muted">Start each point with a verb and add a number where you can: "Cut page load from 4 s to 1.2 s", "Used by 300 students".</p>
        </Section>

        <Section title="Experience and internships">
          <Repeat<Experience> items={data.experience} onChange={(v) => set('experience', v)} blank={{ role: '', org: '', location: '', start: '', end: '', points: '' }} addLabel="Add experience" max={6} render={(e, s) => (
            <>
              <div class="grid gap-3 sm:grid-cols-2">
                <Text label="Role" value={e.role} onInput={(v) => s({ role: v })} placeholder="Software Engineering Intern" />
                <Text label="Company" value={e.org} onInput={(v) => s({ org: v })} />
              </div>
              <div class="grid gap-3 sm:grid-cols-3">
                <Text label="City or Remote" value={e.location} onInput={(v) => s({ location: v })} />
                <Text label="From" value={e.start} onInput={(v) => s({ start: v })} placeholder="Jun 2026" />
                <Text label="To" value={e.end} onInput={(v) => s({ end: v })} placeholder="Present" />
              </div>
              <Area label="What you did" hint="one point per line" rows={3} value={e.points} onInput={(v) => s({ points: v })} />
            </>
          )} />
        </Section>

        <Section title="Achievements and certifications">
          <Area label="Achievements" hint="one per line" value={data.achievements} onInput={(v) => set('achievements', v)} />
          <Area label="Certifications" hint="one per line" value={data.certifications} onInput={(v) => set('certifications', v)} />
        </Section>
      </div>

      <div class="lg:sticky lg:top-20 lg:self-start">
        <div class="rounded-2xl border border-line bg-tint p-4">
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!pdf || busy} onClick={download} class="rounded-full bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-strong disabled:opacity-60" data-testid="download">Download PDF</button>
            {!inline && pdf && <a href={pdf.url} target="_blank" rel="noopener" class="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold">Open preview</a>}
            <span class="text-sm text-muted" role="status" data-testid="pdf-status">
              {busy ? 'Updating…' : pdf ? `${pdf.pages} ${pdf.pages === 1 ? 'page' : 'pages'}` : ''}
            </span>
          </div>
          {pdf && pdf.pages > 1 && <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="too-long">Your resume is {pdf.pages} pages. For internships and fresher roles, one page is best: shorten bullet points, or try the Compact template.</p>}
          {nonLatin && <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="non-latin">Some characters (for example Hindi or emoji) cannot be shown in the PDF and will appear as "?". Please write your resume in English letters.</p>}
          {err && <p class="mt-3 text-sm text-red-700">{err}</p>}
          {inline ? (
            pdf ? <iframe title="Resume preview" src={`${pdf.url}#toolbar=0&navpanes=0&view=FitH`} class="mt-4 aspect-[1/1.414] w-full rounded-lg border border-line bg-white" data-testid="preview" /> : <div class="mt-4 aspect-[1/1.414] w-full animate-pulse rounded-lg bg-surface" />
          ) : (
            <p class="mt-4 text-sm text-muted">Your phone shows PDFs in a separate viewer: tap <strong>Open preview</strong> to see it, or <strong>Download PDF</strong> to save it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
