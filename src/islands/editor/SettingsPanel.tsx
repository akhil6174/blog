/**
 * Right-hand article settings (step B): status and feedback, AI summary, search preview, SEO title, URL slug,
 * category, tags, cover, featured (admin), submit.
 */
import { AlertTriangle, ImagePlus, Lock, RefreshCw, Send, Sparkles } from 'lucide-preact';
import { isImageSrc } from '../../lib/media';
import { CATEGORIES } from '../../lib/site';
import { SEO_TITLE_MAX, SUMMARY_IDEAL_MAX, SUMMARY_MIN } from '../../lib/fingerprint';
import { slugTyping } from '../../lib/slug';
import { DIFFICULTIES } from '../../lib/tech-labels';

export const TECH_KEYS = ['difficulty', 'stack', 'versions', 'testedOn', 'repoUrl', 'lastVerified'] as const;
export type TechFields = Record<(typeof TECH_KEYS)[number], string>;
export const emptyTech = (t?: Partial<TechFields> | null): TechFields => Object.fromEntries(TECH_KEYS.map((k) => [k, t?.[k] ?? ''])) as TechFields;

export type Settings = {
  description: string;
  tags: string;
  coverImage: string;
  coverAlt: string;
  seoTitle: string;
  category: string;
  slug: string;
  summarySource: '' | 'ai' | 'user';
  summaryBasis: string;
  featured: boolean;
  tech: TechFields;
};

type Props = {
  value: Settings;
  title: string;
  effectiveSlug: string;
  slugLocked: boolean;
  slugError: string | null;
  onChange: (patch: Partial<Settings>) => void;
  onSlugInput: (v: string) => void;
  onEditCover: () => void;
  onGenerate: () => void;
  aiBusy: boolean;
  aiError: string;
  summaryStale: boolean;
  isAdmin: boolean;
  status: string;
  rejectReason: string | null;
  onSubmit: () => void;
  onSaveDraft: () => void;
  busy: boolean;
  maxTags: number;
  host: string;
  turnstileSiteKey?: string;
  /** Replaces the submit block (editorial publishing controls for the admin). */
  actionsSlot?: preact.ComponentChildren;
};

export const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-page text-muted' },
  submitted: { label: 'In review', tone: 'bg-amber-100 text-amber-900' },
  checking: { label: 'In review', tone: 'bg-amber-100 text-amber-900' },
  pending_review: { label: 'Waiting for an editor', tone: 'bg-amber-100 text-amber-900' },
  changes_requested: { label: 'Changes requested', tone: 'bg-amber-100 text-amber-900' },
  trashed: { label: 'In the trash', tone: 'bg-red-100 text-red-900' },
  scheduled: { label: 'Scheduled', tone: 'bg-blue-100 text-blue-900' },
  published: { label: 'Published', tone: 'bg-green-100 text-green-900' },
  rejected: { label: 'Declined', tone: 'bg-red-100 text-red-900' },
  hidden: { label: 'Hidden after reports', tone: 'bg-red-100 text-red-900' },
  unpublished: { label: 'Unpublished', tone: 'bg-red-100 text-red-900' },
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);

export default function SettingsPanel(p: Props) {
  const v = p.value;
  const len = v.description.trim().length;
  const lenTone = len === 0 ? 'text-muted' : len > SUMMARY_IDEAL_MAX ? 'text-red-700' : len < SUMMARY_MIN ? 'text-amber-700' : 'text-green-700';
  const lenHint = len === 0 ? '' : len > SUMMARY_IDEAL_MAX ? 'too long: search engines will cut it' : len < SUMMARY_MIN ? 'a little short: aim for 120 to 160' : 'good length';
  const seoLen = v.seoTitle.trim().length;
  const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.draft;
  const tagCount = v.tags.split(',').map((t) => t.trim()).filter(Boolean).length;
  const shownTitle = v.seoTitle.trim() || p.title.trim() || 'Your article title';
  const setTech = (k: keyof TechFields, val: string) => p.onChange({ tech: { ...v.tech, [k]: val } });

  return (
    <div class="grid min-w-0 grid-cols-1 gap-5 font-sans text-sm">
      <section class="grid min-w-0 grid-cols-1 gap-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">Status</h2>
          <span class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
        </div>
        {p.status === 'changes_requested' && p.rejectReason && (
          <div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <p class="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> The editor asked for changes</p>
            <p class="mt-1">{p.rejectReason}</p>
            <p class="mt-2 text-xs">Make the changes, then submit again.</p>
          </div>
        )}
        {p.status === 'rejected' && p.rejectReason && (
          <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
            <p class="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Editor feedback</p>
            <p class="mt-1">{p.rejectReason}</p>
            <p class="mt-2 text-xs">Revise the article, then submit it again.</p>
          </div>
        )}
        {p.status === 'published' && <p class="text-xs text-muted">Edits to a published article go through the checks again when you resubmit.</p>}
      </section>

      {/* Summary */}
      <section class="grid min-w-0 grid-cols-1 gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <label for="summary" class="font-semibold">Summary</label>
          <button type="button" onClick={p.onGenerate} disabled={p.aiBusy} class="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-accent disabled:opacity-60">
            {p.aiBusy ? <RefreshCw size={13} class="animate-spin" /> : len ? <RefreshCw size={13} /> : <Sparkles size={13} />}
            {p.aiBusy ? 'Writing…' : len ? 'Regenerate' : 'Generate with AI'}
          </button>
        </div>
        <textarea id="summary" rows={4} maxLength={160} value={v.description} onInput={(e) => {
          const t = (e.target as HTMLTextAreaElement).value;
          p.onChange({ description: t, summarySource: t.trim() ? 'user' : '' });
        }} class="field" placeholder="Generated from your article once it has 300 words, or write two sentences yourself. Shown in search results and on cards." />
        <div class="flex items-center justify-between text-xs">
          <span class={lenTone}>{len}/160 {lenHint && `· ${lenHint}`}</span>
          {v.summarySource && <span class="text-muted">{v.summarySource === 'ai' ? 'AI written' : 'Written by you'}</span>}
        </div>
        {p.aiError && <p class="text-xs text-red-700" role="alert">{p.aiError}</p>}
        {p.summaryStale && (
          <div class="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900" role="status">
            Your article changed a lot since this summary was written.
            <button type="button" class="ml-1 font-semibold underline" onClick={p.onGenerate}>Refresh it</button>
          </div>
        )}
      </section>

      {/* Search preview */}
      <section class="grid min-w-0 grid-cols-1 gap-1 rounded-lg border border-line bg-page p-3" aria-label="Search result preview">
        <p class="text-[11px] uppercase tracking-wide text-muted">Search preview</p>
        <p class="truncate text-xs text-muted">{p.host} › p › {p.effectiveSlug || 'your-article'}</p>
        <p class="break-words text-base leading-snug text-[#1a0dab]" style="font-family: arial, sans-serif">{clip(shownTitle, 60)}</p>
        <p class="break-words text-xs leading-relaxed text-muted" style="font-family: arial, sans-serif">{v.description.trim() ? clip(v.description.trim(), 160) : 'Your summary appears here.'}</p>
      </section>

      {/* SEO title */}
      <label class="grid min-w-0 grid-cols-1 gap-1.5">
        <span class="font-semibold">SEO title <span class="font-normal text-muted">(optional)</span></span>
        <input aria-label="SEO title" value={v.seoTitle} maxLength={70} onInput={(e) => p.onChange({ seoTitle: (e.target as HTMLInputElement).value })} class="field" placeholder={p.title || 'Defaults to the article title'} />
        <span class={`text-xs ${seoLen === 0 ? 'text-muted' : seoLen > SEO_TITLE_MAX ? 'text-amber-700' : 'text-green-700'}`}>
          {seoLen === 0 ? 'Leave empty to use the article title. Up to 60 characters shows in full on Google.' : `${seoLen}/${SEO_TITLE_MAX}${seoLen > SEO_TITLE_MAX ? ' · may be cut in search results' : ''}`}
        </span>
      </label>

      {/* Slug */}
      <label class="grid min-w-0 grid-cols-1 gap-1.5">
        <span class="flex items-center gap-1.5 font-semibold">Article URL {p.slugLocked && <Lock size={13} class="text-muted" />}</span>
        <div class={`flex items-center rounded-lg border border-line ${p.slugLocked ? 'bg-page' : 'bg-surface'}`}>
          <span class="shrink-0 pl-2.5 text-xs text-muted">{p.host}/p/</span>
          <input value={p.effectiveSlug} readOnly={p.slugLocked} onInput={(e) => p.onSlugInput(slugTyping((e.target as HTMLInputElement).value))} class="w-full min-w-0 bg-transparent px-1 py-2 text-sm outline-none" aria-label="URL slug" spellcheck={false} />
        </div>
        <span class="text-xs text-muted">{p.slugLocked ? 'Locked after publishing so links never break.' : 'Follows the title until you edit it. Short and descriptive works best.'}</span>
        {p.slugError && <span class="text-xs text-red-700" role="alert">{p.slugError}</span>}
      </label>

      {/* Category */}
      <label class="grid min-w-0 grid-cols-1 gap-1.5">
        <span class="font-semibold">Category</span>
        <select aria-label="Category" value={v.category} onChange={(e) => p.onChange({ category: (e.target as HTMLSelectElement).value })} class="field">
          <option value="">Choose a category</option>
          {CATEGORIES.map((c) => <option value={c.slug}>{c.name}</option>)}
        </select>
      </label>

      <label class="grid min-w-0 grid-cols-1 gap-1.5">
        <span class="font-semibold">Tags <span class="font-normal text-muted">({tagCount}/{p.maxTags})</span></span>
        <input value={v.tags} onInput={(e) => p.onChange({ tags: (e.target as HTMLInputElement).value })} class="field" placeholder="javascript, cloudflare, tutorial" />
        <span class="text-xs text-muted">Comma separated, more specific than the category.</span>
      </label>

      <section class="grid min-w-0 grid-cols-1 gap-2">
        <span class="font-semibold">Cover image <span class="font-normal text-muted">(1200 × 630)</span></span>
        {isImageSrc(v.coverImage) ? (
          <>
            <button type="button" onClick={p.onEditCover} class="group relative overflow-hidden rounded-lg border border-line" aria-label="Change cover image">
              <img src={v.coverImage} alt={v.coverAlt || 'Cover preview'} class="aspect-[1200/630] w-full object-cover" referrerpolicy="no-referrer" />
              <span class="absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">Change</span>
            </button>
            <input value={v.coverAlt} maxLength={200} onInput={(e) => p.onChange({ coverAlt: (e.target as HTMLInputElement).value })} class="field" placeholder="Describe the image (alt text)" aria-label="Cover alt text" />
            {!v.coverAlt && <span class="text-xs text-amber-700">Add alt text before submitting.</span>}
            <div class="flex gap-3 text-xs">
              <button type="button" class="underline" onClick={p.onEditCover}>Replace</button>
              <button type="button" class="text-red-700 underline" onClick={() => p.onChange({ coverImage: '', coverAlt: '' })}>Remove</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={p.onEditCover} class="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-sm text-muted hover:border-accent hover:text-ink">
            <ImagePlus size={22} /> Add a cover image
            <span class="text-xs">Upload from your device or use a link</span>
          </button>
        )}
      </section>


      {/* Technical details (optional) */}
      <details class="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-line p-3" open={TECH_KEYS.some((k) => v.tech[k])}>
        <summary class="cursor-pointer font-semibold">Technical details <span class="font-normal text-muted">(optional)</span></summary>
        <p class="mt-1 text-xs text-muted">Shown in a box above the article. Helps readers check the steps match their setup.</p>
        <div class="mt-2 grid min-w-0 grid-cols-1 gap-2">
          <label class="grid min-w-0 grid-cols-1 gap-1"><span class="text-xs font-semibold">Difficulty</span>
            <select aria-label="Difficulty" value={v.tech.difficulty} onChange={(e) => setTech('difficulty', (e.target as HTMLSelectElement).value)} class="field">
              <option value="">Not set</option>
              {DIFFICULTIES.map((d) => <option value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label class="grid min-w-0 grid-cols-1 gap-1"><span class="text-xs font-semibold">Languages and frameworks</span>
            <input aria-label="Languages and frameworks" maxLength={120} value={v.tech.stack} onInput={(e) => setTech('stack', (e.target as HTMLInputElement).value)} class="field" placeholder="TypeScript, Astro, Cloudflare Workers" /></label>
          <label class="grid min-w-0 grid-cols-1 gap-1"><span class="text-xs font-semibold">Versions used</span>
            <input aria-label="Versions used" maxLength={160} value={v.tech.versions} onInput={(e) => setTech('versions', (e.target as HTMLInputElement).value)} class="field" placeholder="Node 22, Astro 7.4, Wrangler 4" /></label>
          <label class="grid min-w-0 grid-cols-1 gap-1"><span class="text-xs font-semibold">Tested on</span>
            <input aria-label="Tested on" maxLength={160} value={v.tech.testedOn} onInput={(e) => setTech('testedOn', (e.target as HTMLInputElement).value)} class="field" placeholder="Windows 11, Chrome 140" /></label>
          <label class="grid min-w-0 grid-cols-1 gap-1"><span class="text-xs font-semibold">Code repository</span>
            <input aria-label="Code repository" type="url" maxLength={300} value={v.tech.repoUrl} onInput={(e) => setTech('repoUrl', (e.target as HTMLInputElement).value)} class="field" placeholder="https://github.com/you/example" />
            {v.tech.repoUrl && !/^https:\/\/\S+$/.test(v.tech.repoUrl.trim()) && <span class="text-xs text-amber-700">Use a full https:// link, or it will not be shown.</span>}
          </label>
          <div class="grid min-w-0 grid-cols-1 gap-1"><span class="text-xs font-semibold">Last verified</span>
            <div class="flex min-w-0 gap-2">
              <input aria-label="Last verified" type="date" value={v.tech.lastVerified} onInput={(e) => setTech('lastVerified', (e.target as HTMLInputElement).value)} class="field min-w-0 flex-1" />
              <button type="button" class="shrink-0 rounded-md border border-line px-2 text-xs font-semibold hover:border-accent" onClick={() => setTech('lastVerified', new Date().toISOString().slice(0, 10))}>Today</button>
            </div>
            <span class="text-xs text-muted">The day you last checked the steps still work.</span>
          </div>
        </div>
      </details>

      {p.isAdmin && (
        <label class="flex items-start gap-2 rounded-lg border border-line p-3">
          <input type="checkbox" aria-label="Featured" checked={v.featured} onChange={(e) => p.onChange({ featured: (e.target as HTMLInputElement).checked })} class="mt-0.5 accent-[var(--color-accent)]" />
          <span><span class="font-semibold">Featured</span><br /><span class="text-xs text-muted">Pin at the top of the community page. Only admins see this.</span></span>
        </label>
      )}

      {p.actionsSlot ?? (
        <>
      {p.turnstileSiteKey && <div class="cf-turnstile" data-sitekey={p.turnstileSiteKey} data-theme="auto" />}

      <div class="grid min-w-0 grid-cols-1 gap-2 border-t border-line pt-4">
        <button type="button" disabled={p.busy} onClick={p.onSubmit} class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
          <Send size={16} /> {p.busy ? 'Submitting…' : p.status === 'published' ? 'Resubmit changes' : 'Submit for review'}
        </button>
        <button type="button" onClick={p.onSaveDraft} class="rounded-lg border border-line px-4 py-2 hover:bg-page">Save draft now</button>
        <p class="text-xs text-muted">Clean articles usually publish within a minute. Read the <a href="/community-guidelines/" target="_blank" class="underline">guidelines</a>.</p>
      </div>
        </>
      )}
    </div>
  );
}
