/**
 * Medium-style editor island (Tiptap on Preact via preact/compat).
 * - Autosaves the draft every 10 s of inactivity to POST /api/posts (status stays "draft").
 * - "Submit for review" validates and sends the same payload with submit=true.
 * - Images: by URL only until R2 is enabled in Phase 3b (D-013).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common);

type InitialPost = {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  tags?: string[];
  coverImage?: string | null;
  coverAlt?: string | null;
  bodyJson?: unknown;
  status?: string;
  rejectReason?: string | null;
};

type Props = { initial?: InitialPost; minWords: number; maxTags: number; turnstileSiteKey?: string };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function Editor({ initial = {}, minWords, maxTags, turnstileSiteKey }: Props) {
  const [id, setId] = useState<string | undefined>(initial.id);
  const [title, setTitle] = useState(initial.title ?? '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [tags, setTags] = useState<string>((initial.tags ?? []).join(', '));
  const [coverImage, setCoverImage] = useState(initial.coverImage ?? '');
  const [coverAlt, setCoverAlt] = useState(initial.coverAlt ?? '');
  const [save, setSave] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>(initial.status === 'rejected' && initial.rejectReason ? `Previous submission was declined: ${initial.rejectReason}` : '');
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [2, 3, 4] } }),
      CodeBlockLowlight.configure({ lowlight }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ allowBase64: false }),
      Youtube.configure({ nocookie: true, width: 680, height: 383 }),
      Placeholder.configure({ placeholder: 'Tell your story. Use ## for headings, ``` for code, and paste links as you go.' }),
      CharacterCount,
    ],
    content: (initial.bodyJson as object | undefined) ?? '',
    editorProps: { attributes: { class: 'prose prose-article min-h-[50vh] outline-none', 'aria-label': 'Article body' } },
    onUpdate: () => scheduleSave(),
  });

  const words = editor?.storage.characterCount.words() ?? 0;

  function payload(submit: boolean) {
    return {
      id,
      title: title.trim(),
      subtitle: subtitle.trim(),
      description: description.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, maxTags),
      coverImage: coverImage.trim() || null,
      coverAlt: coverAlt.trim() || null,
      bodyJson: editor?.getJSON() ?? { type: 'doc', content: [] },
      submit,
      turnstileToken: submit ? (document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? '') : '',
    };
  }

  async function persist(submit = false) {
    if (!editor) return;
    setSave('saving');
    try {
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(submit)) });
      const data = (await res.json()) as { id?: string; error?: string; status?: string; redirect?: string };
      if (!res.ok) {
        setSave('error');
        setMessage(data.error ?? 'Could not save.');
        return;
      }
      if (data.id) setId(data.id);
      dirty.current = false;
      setSave('saved');
      if (submit && data.redirect) location.href = data.redirect;
    } catch {
      setSave('error');
      setMessage('Network error while saving. Your text is still in the editor.');
    }
  }

  function scheduleSave() {
    dirty.current = true;
    setSave('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(false), 10_000);
  }

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  function ask(label: string, def = ''): string | null {
    return window.prompt(label, def);
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (busy) return;
    const problems: string[] = [];
    if (title.trim().length < 10) problems.push('Title needs at least 10 characters.');
    if (description.trim().length < 50 || description.trim().length > 160) problems.push('Summary must be 50 to 160 characters (it becomes the search snippet).');
    if (tags.split(',').map((t) => t.trim()).filter(Boolean).length < 1) problems.push('Add at least one tag.');
    if (words < minWords) problems.push(`Write at least ${minWords} words (currently ${words}).`);
    if (coverImage && !coverAlt) problems.push('Describe the cover image for screen readers (alt text).');
    if (problems.length) {
      setMessage(problems.join(' '));
      return;
    }
    setBusy(true);
    setMessage('');
    await persist(true);
    setBusy(false);
  }

  const B = (p: { on: () => void; active?: boolean; label: string; title: string }) => (
    <button
      type="button"
      onClick={p.on}
      title={p.title}
      aria-pressed={p.active ? 'true' : 'false'}
      class={`rounded px-2 py-1 text-sm hover:bg-page ${p.active ? 'bg-page font-semibold' : ''}`}
    >
      {p.label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} class="font-sans">
      <input
        class="w-full border-0 bg-transparent font-sans text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-muted md:text-4xl"
        placeholder="Title"
        value={title}
        maxLength={90}
        onInput={(e) => { setTitle((e.target as HTMLInputElement).value); scheduleSave(); }}
        required
      />
      <input
        class="mt-2 w-full border-0 bg-transparent font-serif text-xl text-muted outline-none placeholder:text-muted"
        placeholder="Subtitle (optional)"
        value={subtitle}
        maxLength={140}
        onInput={(e) => { setSubtitle((e.target as HTMLInputElement).value); scheduleSave(); }}
      />

      {editor && (
        <div class="sticky top-16 z-30 mt-6 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1" role="toolbar" aria-label="Formatting">
          <B label="H2" title="Heading" active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <B label="H3" title="Subheading" active={editor.isActive('heading', { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <B label="B" title="Bold" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()} />
          <B label="I" title="Italic" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()} />
          <B label="• List" title="Bullet list" active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()} />
          <B label="1. List" title="Numbered list" active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()} />
          <B label="“ Quote" title="Quote" active={editor.isActive('blockquote')} on={() => editor.chain().focus().toggleBlockquote().run()} />
          <B label="</> Code" title="Code block" active={editor.isActive('codeBlock')} on={() => editor.chain().focus().toggleCodeBlock().run()} />
          <B label="Link" title="Link" active={editor.isActive('link')} on={() => { const u = ask('Link URL (https://…)', editor.getAttributes('link').href ?? ''); if (u === null) return; if (!u) editor.chain().focus().unsetLink().run(); else editor.chain().focus().setLink({ href: u }).run(); }} />
          <B label="Image" title="Image by URL" on={() => { const u = ask('Image URL (https://…). Uploads arrive soon.'); if (!u) return; const alt = ask('Describe the image (alt text)') ?? ''; editor.chain().focus().setImage({ src: u, alt }).run(); }} />
          <B label="YouTube" title="Embed YouTube" on={() => { const u = ask('YouTube URL'); if (u) editor.chain().focus().setYoutubeVideo({ src: u }).run(); }} />
          <B label="—" title="Divider" on={() => editor.chain().focus().setHorizontalRule().run()} />
          <span class="ml-auto pr-2 text-xs text-muted">{words} words · {save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved' : save === 'error' ? 'Not saved' : 'Draft'}</span>
        </div>
      )}

      <div class="mt-6">
        <EditorContent editor={editor} />
      </div>

      <fieldset class="mt-10 grid gap-5 rounded-lg border border-line bg-surface p-5">
        <legend class="px-1 text-sm font-semibold">Before you submit</legend>
        <label class="grid gap-1.5 text-sm">
          <span class="font-semibold">Summary <span class="font-normal text-muted">(50 to 160 characters; shown in search results and cards)</span></span>
          <textarea class="rounded border border-line px-3 py-2" rows={2} maxLength={160} value={description} onInput={(e) => { setDescription((e.target as HTMLTextAreaElement).value); scheduleSave(); }} />
          <span class="text-xs text-muted">{description.trim().length}/160</span>
        </label>
        <label class="grid gap-1.5 text-sm">
          <span class="font-semibold">Tags <span class="font-normal text-muted">(comma separated, up to {maxTags})</span></span>
          <input class="rounded border border-line px-3 py-2" value={tags} placeholder="javascript, cloudflare, tutorial" onInput={(e) => { setTags((e.target as HTMLInputElement).value); scheduleSave(); }} />
        </label>
        <div class="grid gap-5 sm:grid-cols-2">
          <label class="grid gap-1.5 text-sm">
            <span class="font-semibold">Cover image URL <span class="font-normal text-muted">(optional)</span></span>
            <input class="rounded border border-line px-3 py-2" value={coverImage} placeholder="https://…" onInput={(e) => { setCoverImage((e.target as HTMLInputElement).value); scheduleSave(); }} />
          </label>
          <label class="grid gap-1.5 text-sm">
            <span class="font-semibold">Cover description (alt text)</span>
            <input class="rounded border border-line px-3 py-2" value={coverAlt} onInput={(e) => { setCoverAlt((e.target as HTMLInputElement).value); scheduleSave(); }} />
          </label>
        </div>
        {turnstileSiteKey && <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="light" />}
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} class="rounded bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
          <button type="button" onClick={() => void persist(false)} class="rounded border border-line px-4 py-2.5 hover:bg-page">Save draft</button>
          <span class="text-sm text-muted">Clean articles usually publish within a minute. See the <a href="/community-guidelines/" class="underline" target="_blank">guidelines</a>.</span>
        </div>
        {message && <p class="text-sm text-red-700" role="alert">{message}</p>}
      </fieldset>
    </form>
  );
}
