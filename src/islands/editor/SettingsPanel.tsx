/**
 * Right-hand article settings. Step A: status and editor feedback, summary, tags, cover by URL.
 * Step B adds the AI summary, SEO title, slug, category; step C replaces the cover URL with the uploader.
 */
import { AlertTriangle, ImagePlus, Send } from 'lucide-preact';
import { isImageSrc } from '../../lib/media';

export type Settings = { description: string; tags: string; coverImage: string; coverAlt: string };

type Props = {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onEditCover: () => void;
  status: string;
  rejectReason: string | null;
  onSubmit: () => void;
  onSaveDraft: () => void;
  busy: boolean;
  maxTags: number;
  turnstileSiteKey?: string;
};

export const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-page text-muted' },
  submitted: { label: 'In review', tone: 'bg-amber-100 text-amber-900' },
  checking: { label: 'In review', tone: 'bg-amber-100 text-amber-900' },
  pending_review: { label: 'Waiting for an editor', tone: 'bg-amber-100 text-amber-900' },
  published: { label: 'Published', tone: 'bg-green-100 text-green-900' },
  rejected: { label: 'Declined', tone: 'bg-red-100 text-red-900' },
  hidden: { label: 'Hidden after reports', tone: 'bg-red-100 text-red-900' },
  unpublished: { label: 'Unpublished', tone: 'bg-red-100 text-red-900' },
};

export default function SettingsPanel({ value, onChange, onEditCover, status, rejectReason, onSubmit, onSaveDraft, busy, maxTags, turnstileSiteKey }: Props) {
  const len = value.description.trim().length;
  const lenTone = len === 0 ? 'text-muted' : len < 120 || len > 160 ? (len > 160 ? 'text-red-700' : 'text-amber-700') : 'text-green-700';
  const st = STATUS_LABEL[status] ?? STATUS_LABEL.draft;
  const tagCount = value.tags.split(',').map((t) => t.trim()).filter(Boolean).length;

  return (
    <div class="grid gap-5 font-sans text-sm">
      <section class="grid gap-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">Status</h2>
          <span class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
        </div>
        {status === 'rejected' && rejectReason && (
          <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
            <p class="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Editor feedback</p>
            <p class="mt-1">{rejectReason}</p>
            <p class="mt-2 text-xs">Revise the article, then submit it again.</p>
          </div>
        )}
        {status === 'published' && <p class="text-xs text-muted">Edits to a published article go through the checks again when you resubmit.</p>}
      </section>

      <label class="grid gap-1.5">
        <span class="font-semibold">Summary</span>
        <textarea rows={4} maxLength={200} value={value.description} onInput={(e) => onChange({ description: (e.target as HTMLTextAreaElement).value })} class="field" placeholder="Two sentences: what the article covers and why it is useful. Used in search results and cards." />
        <span class={`text-xs ${lenTone}`}>{len}/160 {len > 0 && (len < 120 ? '· a little short' : len > 160 ? '· too long, search engines will cut it' : '· good length')}</span>
      </label>

      <label class="grid gap-1.5">
        <span class="font-semibold">Tags <span class="font-normal text-muted">({tagCount}/{maxTags})</span></span>
        <input value={value.tags} onInput={(e) => onChange({ tags: (e.target as HTMLInputElement).value })} class="field" placeholder="javascript, cloudflare, tutorial" />
        <span class="text-xs text-muted">Comma separated. The first tag is shown on cards.</span>
      </label>

      <section class="grid gap-2">
        <span class="font-semibold">Cover image <span class="font-normal text-muted">(1200 × 630)</span></span>
        {isImageSrc(value.coverImage) ? (
          <>
            <button type="button" onClick={onEditCover} class="group relative overflow-hidden rounded-lg border border-line" aria-label="Change cover image">
              <img src={value.coverImage} alt={value.coverAlt || 'Cover preview'} class="aspect-[1200/630] w-full object-cover" referrerpolicy="no-referrer" />
              <span class="absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">Change</span>
            </button>
            <input value={value.coverAlt} maxLength={200} onInput={(e) => onChange({ coverAlt: (e.target as HTMLInputElement).value })} class="field" placeholder="Describe the image (alt text)" aria-label="Cover alt text" />
            {!value.coverAlt && <span class="text-xs text-amber-700">Add alt text before submitting.</span>}
            <div class="flex gap-3 text-xs">
              <button type="button" class="underline" onClick={onEditCover}>Replace</button>
              <button type="button" class="text-red-700 underline" onClick={() => onChange({ coverImage: '', coverAlt: '' })}>Remove</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={onEditCover} class="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-sm text-muted hover:border-accent hover:text-ink">
            <ImagePlus size={22} /> Add a cover image
            <span class="text-xs">Upload from your device or use a link</span>
          </button>
        )}
      </section>

      {turnstileSiteKey && <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="auto" />}

      <div class="grid gap-2 border-t border-line pt-4">
        <button type="button" disabled={busy} onClick={onSubmit} class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
          <Send size={16} /> {busy ? 'Submitting…' : status === 'published' ? 'Resubmit changes' : 'Submit for review'}
        </button>
        <button type="button" onClick={onSaveDraft} class="rounded-lg border border-line px-4 py-2 hover:bg-page">Save draft now</button>
        <p class="text-xs text-muted">Clean articles usually publish within a minute. Read the <a href="/community-guidelines/" target="_blank" class="underline">guidelines</a>.</p>
      </div>
    </div>
  );
}
