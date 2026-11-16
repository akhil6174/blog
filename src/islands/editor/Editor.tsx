/**
 * TrutiAI block editor (step A of docs/EDITOR-PLAN.md).
 *
 * Layout: left formatting rail · document canvas (title, subtitle, Tiptap blocks) · right settings panel.
 * Modes: Write / Split / Preview, plus distraction-free focus mode and an editor-only dark theme.
 * Saving: debounced autosave (2 s idle, at most 30 s apart) that writes one D1 row, plus a local browser copy
 * on every change so nothing is lost if the network or the tab fails; the copy is offered back on reload.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor as TEditor, JSONContent } from '@tiptap/core';
import {
  Bold, Check, Code, Columns2, Eye, Highlighter, Italic, LayoutTemplate, Link as LinkIcon, Maximize2, Minimize2, Moon,
  PenLine, RotateCcw, Settings2, Strikethrough, Sun, Underline, X,
} from 'lucide-preact';
import { buildExtensions, type EditorCallbacks } from './extensions';
import type { SlashItem } from './slash';
import { countHeadings, currentBlock, blockHasContent, deleteBlock } from './blockOps';
import Rail from './Rail';
import BlockHandle from './BlockHandle';
import Modal from './Modal';
import Preview from './Preview';
import SettingsPanel, { STATUS_LABEL, type Settings } from './SettingsPanel';
import { TEMPLATES, type Template } from './templates';
import { BodyImageDialog, CoverDialog } from './ImageDialogs';
import { isImageSrc } from '../../lib/media';

type InitialPost = {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  tags?: string[];
  coverImage?: string | null;
  coverAlt?: string | null;
  bodyJson?: JSONContent;
  status?: string;
  rejectReason?: string | null;
  updatedAt?: string;
};

type Props = { initial?: InitialPost; authorName: string; minWords: number; maxTags: number; turnstileSiteKey?: string };
type Mode = 'write' | 'split' | 'preview';
type SaveState = { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; at: Date | null; msg?: string };
type LocalDraft = { title: string; subtitle: string; settings: Settings; bodyJson: JSONContent; at: number };
type ModalState =
  | { kind: 'link'; url: string }
  | { kind: 'image'; file?: File }
  | { kind: 'cover' }
  | { kind: 'templates'; chosen?: Template }
  | { kind: 'shortcuts' }
  | { kind: 'notice'; title: string; items: string[] }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; run: () => void | Promise<void> };

const LANGS = ['', 'bash', 'javascript', 'typescript', 'json', 'html', 'css', 'python', 'go', 'rust', 'java', 'sql', 'yaml', 'xml', 'diff', 'plaintext'];
/** Module-level so its identity never changes (a new function per render makes BubbleMenu re-register its plugin forever). */
const bubbleShouldShow = ({ editor, from, to, state }: { editor: TEditor; from: number; to: number; state: TEditor['state'] }) =>
  from !== to && !(state.selection instanceof NodeSelection) && !editor.isActive('codeBlock');

const lsGet = (k: string): LocalDraft | null => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as LocalDraft) : null;
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: LocalDraft) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: server autosave still runs */
  }
};
const lsDel = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

function ModeBtn({ m, mode, setMode, icon: Icon, label, cls = '' }: { m: Mode; mode: Mode; setMode: (m: Mode) => void; icon: typeof Eye; label: string; cls?: string }) {
  return (
    <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)} class={`${cls || 'inline-flex'} items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
      <Icon size={14} /> {label}
    </button>
  );
}

function BubbleBtn({ active, label, run, children }: { active?: boolean; label: string; run: () => void; children: preact.ComponentChildren }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run} class={`rounded p-1.5 ${active ? 'bg-white/20' : 'hover:bg-white/10'}`}>{children}</button>
  );
}

export default function Editor({ initial = {}, authorName, minWords, maxTags, turnstileSiteKey }: Props) {
  const idRef = useRef<string | undefined>(initial.id);
  const [title, setTitle] = useState(initial.title && initial.title !== 'Untitled draft' ? initial.title : '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [settings, setSettings] = useState<Settings>({
    description: initial.description ?? '',
    tags: (initial.tags ?? []).join(', '),
    coverImage: initial.coverImage ?? '',
    coverAlt: initial.coverAlt ?? '',
  });
  const [status, setStatus] = useState(initial.status ?? 'draft');
  const [mode, setMode] = useState<Mode>('write');
  const [focus, setFocus] = useState(false);
  const [dark, setDark] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: 'idle', at: initial.updatedAt ? new Date(initial.updatedAt) : null });
  const [modal, setModal] = useState<ModalState | null>(null);
  const [recovery, setRecovery] = useState<LocalDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);

  const latest = useRef({ title, subtitle, settings });
  latest.current = { title, subtitle, settings };
  const version = useRef(0);
  const savedVersion = useRef(0);
  const inflight = useRef(false);
  const pending = useRef(false);
  const idleTimer = useRef<number>();
  const maxTimer = useRef<number>();
  const retryTimer = useRef<number>();
  const localTimer = useRef<number>();
  const editorRef = useRef<TEditor | null>(null);

  const localKey = () => `trutiai:draft:${idRef.current ?? 'new'}`;

  // ---------- saving ----------
  const payload = (submit: boolean) => {
    const s = latest.current.settings;
    const tags = s.tags.split(',').map((t) => t.trim()).filter((t) => t.length >= 2).map((t) => t.slice(0, 30)).slice(0, maxTags);
    return {
      id: idRef.current,
      title: latest.current.title.trim().slice(0, 90),
      subtitle: latest.current.subtitle.trim().slice(0, 140),
      description: s.description.trim().slice(0, 160),
      tags,
      coverImage: isImageSrc(s.coverImage.trim()) ? s.coverImage.trim() : null,
      coverAlt: s.coverAlt.trim().slice(0, 200) || null,
      bodyJson: editorRef.current?.getJSON() ?? { type: 'doc', content: [] },
      submit,
      autosave: !submit,
      turnstileToken: submit ? document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? '' : '',
    };
  };

  const persist = useCallback(async (submit = false): Promise<boolean> => {
    if (inflight.current) {
      pending.current = true;
      return false;
    }
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(maxTimer.current);
    window.clearTimeout(retryTimer.current);
    maxTimer.current = undefined;
    const v = version.current;
    inflight.current = true;
    setSave((s) => ({ ...s, state: 'saving' }));
    try {
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(submit)) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; redirect?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      if (data.id && !idRef.current) {
        const oldKey = localKey();
        idRef.current = data.id;
        history.replaceState(null, '', `/write/?id=${data.id}`);
        lsDel(oldKey);
      }
      if (data.status) setStatus(data.status);
      savedVersion.current = v;
      if (version.current === v) {
        lsDel(localKey());
        lsDel('trutiai:draft:new');
        setSave({ state: 'saved', at: new Date() });
      } else {
        setSave({ state: 'dirty', at: new Date() });
      }
      if (submit && data.redirect) {
        savedVersion.current = version.current;
        location.href = data.redirect;
      }
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      setSave((s) => ({ ...s, state: 'error', msg }));
      if (submit) setModal({ kind: 'notice', title: 'Could not submit', items: [msg] });
      else retryTimer.current = window.setTimeout(() => void persist(false), 15_000);
      return false;
    } finally {
      inflight.current = false;
      if (pending.current) {
        pending.current = false;
        void persist(false);
      }
    }
  }, []);

  const markDirty = useCallback(() => {
    version.current++;
    setSave((s) => (s.state === 'saving' ? s : { ...s, state: 'dirty' }));
    window.clearTimeout(localTimer.current);
    localTimer.current = window.setTimeout(() => {
      const ed = editorRef.current;
      if (!ed) return;
      lsSet(localKey(), { ...latest.current, bodyJson: ed.getJSON(), at: Date.now() });
    }, 400);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => void persist(false), 2000);
    if (!maxTimer.current) maxTimer.current = window.setTimeout(() => void persist(false), 30_000);
  }, [persist]);

  // ---------- editor ----------
  const cb = useRef<EditorCallbacks>({ saveNow: () => {}, openLink: () => {}, toggleFocus: () => {}, togglePreview: () => {}, confirmDeleteBlock: () => {} });
  const slashRef = useRef<() => SlashItem[]>(() => []);
  const imageFileRef = useRef<(f: File) => void>(() => {});

  // Built once. A new extensions array on every render makes Tiptap destroy and recreate the editor,
  // which re-renders again: an endless loop that freezes the page on the first keystroke.
  const extensions = useMemo(() => buildExtensions(cb, () => slashRef.current()), []);
  const editor = useEditor({
    extensions,
    content: initial.bodyJson ?? '',
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'tiptap prose prose-article editor-body', 'aria-label': 'Article body', spellcheck: 'true' },
      // Pasting or dropping an image file opens the upload dialog (alt text is required, so no silent insert).
      handlePaste: (_view, event) => {
        const f = [...(event.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
        if (!f) return false;
        imageFileRef.current(f);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const f = [...((event as DragEvent).dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
        if (!f) return false;
        event.preventDefault();
        imageFileRef.current(f);
        return true;
      },
    },
    onUpdate: () => markDirty(),
  }, []);
  editorRef.current = editor;

  // Test hook for local end-to-end checks only (never on the real domain).
  useEffect(() => {
    if (editor && ['localhost', '127.0.0.1'].includes(location.hostname)) (window as unknown as { __editor?: TEditor }).__editor = editor;
  }, [editor]);

  const openLink = () => {
    if (!editor) return;
    setModal({ kind: 'link', url: (editor.getAttributes('link').href as string) ?? '' });
  };
  const openImage = (file?: File) => setModal({ kind: 'image', file });
  const confirmDeleteBlock = () => {
    if (!editor) return;
    const b = currentBlock(editor);
    if (!b) return;
    if (blockHasContent(b)) setModal({ kind: 'confirm', title: 'Delete this block?', body: 'You can undo with Ctrl Z.', confirmLabel: 'Delete', danger: true, run: () => void deleteBlock(editor, b.start) });
    else deleteBlock(editor, b.start);
  };
  cb.current = {
    saveNow: () => void persist(false),
    openLink,
    toggleFocus: () => setFocus((f) => !f),
    togglePreview: () => setMode((m) => (m === 'preview' ? 'write' : 'preview')),
    confirmDeleteBlock,
  };
  imageFileRef.current = (f) => openImage(f);
  slashRef.current = () => {
    const c = (ed: TEditor) => ed.chain().focus();
    return [
      { group: 'Text', title: 'Text', hint: 'Plain paragraph', keywords: 'paragraph p', run: (ed) => c(ed).setParagraph().run() },
      { group: 'Text', title: 'Heading', hint: 'Section heading', keywords: 'h2 title section', run: (ed) => c(ed).setHeading({ level: 2 }).run() },
      { group: 'Text', title: 'Subheading', hint: 'Smaller heading', keywords: 'h3', run: (ed) => c(ed).setHeading({ level: 3 }).run() },
      { group: 'Text', title: 'Minor heading', hint: 'Smallest heading', keywords: 'h4', run: (ed) => c(ed).setHeading({ level: 4 }).run() },
      { group: 'Lists', title: 'Bulleted list', hint: '• item', keywords: 'ul unordered bullet', run: (ed) => c(ed).toggleBulletList().run() },
      { group: 'Lists', title: 'Numbered list', hint: '1. item', keywords: 'ol ordered number', run: (ed) => c(ed).toggleOrderedList().run() },
      { group: 'Blocks', title: 'Quote', hint: 'Highlighted quotation', keywords: 'blockquote citation', run: (ed) => c(ed).toggleBlockquote().run() },
      { group: 'Blocks', title: 'Code block', hint: 'With syntax highlighting', keywords: 'code pre snippet', run: (ed) => c(ed).toggleCodeBlock().run() },
      { group: 'Blocks', title: 'Table', hint: '3 × 3 with header row', keywords: 'grid table', run: (ed) => c(ed).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { group: 'Blocks', title: 'Divider', hint: 'Horizontal line', keywords: 'hr rule separator', run: (ed) => c(ed).setHorizontalRule().run() },
      { group: 'Media', title: 'Image', hint: 'Upload or paste a link', keywords: 'picture photo img upload', run: () => openImage() },
      { group: 'Media', title: 'YouTube video', hint: 'Embed by URL', keywords: 'video youtube embed', run: () => {
        const u = window.prompt('YouTube URL');
        if (u) editorRef.current?.chain().focus().setYoutubeVideo({ src: u }).run();
      } },
      { group: 'Insert', title: 'Template', hint: 'Structure for the article', keywords: 'template outline structure', run: () => setModal({ kind: 'templates' }) },
    ];
  };

  // ---------- lifecycle ----------
  useEffect(() => {
    try {
      const pref = localStorage.getItem('trutiai:editor-theme');
      setDark(pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('editor-dark', dark);
    return () => document.documentElement.classList.remove('editor-dark');
  }, [dark]);
  useEffect(() => {
    document.documentElement.classList.toggle('editor-focus', focus);
    return () => document.documentElement.classList.remove('editor-focus');
  }, [focus]);

  useEffect(() => {
    if (!editor) return;
    const local = lsGet(localKey()) ?? (idRef.current ? null : lsGet('trutiai:draft:new'));
    if (!local) return;
    const same = JSON.stringify(local.bodyJson) === JSON.stringify(editor.getJSON()) && local.title === latest.current.title && JSON.stringify(local.settings) === JSON.stringify(latest.current.settings);
    if (same) lsDel(localKey());
    else setRecovery(local);
  }, [editor]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current || inflight.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const keys = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persist(false);
      } else if (e.key === 'Escape' && !modal) {
        setFocus(false);
        setSheet(false);
      } else if (e.key === '?' && !typing && !modal) {
        setModal({ kind: 'shortcuts' });
      }
    };
    window.addEventListener('beforeunload', before);
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('keydown', keys);
    };
  }, [modal, persist]);

  useEffect(() => () => {
    [idleTimer, maxTimer, retryTimer, localTimer].forEach((t) => window.clearTimeout(t.current));
  }, []);

  // Grow the title and subtitle boxes to fit their text (on load, restore, mode switch and typing).
  useLayoutEffect(() => {
    for (const el of document.querySelectorAll<HTMLTextAreaElement>('.editor-title, .editor-subtitle')) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title, subtitle, mode, focus, editor]);

  if (!editor) return <p class="font-sans text-muted">Loading editor…</p>;

  // ---------- derived ----------
  const words = editor.storage.characterCount.words() as number;
  const chars = editor.storage.characterCount.characters() as number;
  const minutes = Math.max(1, Math.round(words / 220));
  const headings = countHeadings(editor.state.doc);
  const tagList = settings.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const doc = mode === 'write' ? null : editor.getJSON();
  const showSettingsColumn = !focus && mode !== 'split';
  const showRail = !focus && mode !== 'preview';

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    markDirty();
  };

  const requestSubmit = () => {
    const p: string[] = [];
    if (title.trim().length < 10) p.push('Give the article a title of at least 10 characters.');
    if (settings.description.trim().length < 50) p.push('Write a summary of at least 50 characters (right panel).');
    if (tagList.length < 1) p.push('Add at least one tag.');
    if (words < minWords) p.push(`Write at least ${minWords} words (now ${words}).`);
    if (settings.coverImage && !isImageSrc(settings.coverImage)) p.push('The cover image address is not valid. Upload the image or use a full https:// address.');
    if (settings.coverImage && !settings.coverAlt.trim()) p.push('Describe the cover image (alt text).');
    if (p.length) {
      setModal({ kind: 'notice', title: 'Before you submit', items: p });
      return;
    }
    setModal({
      kind: 'confirm',
      title: status === 'published' ? 'Resubmit your changes?' : 'Submit for review?',
      body: 'Automatic checks usually finish within a minute. Borderline articles wait for an editor. You will get an email either way.',
      confirmLabel: 'Submit',
      run: async () => {
        setBusy(true);
        await persist(true);
        setBusy(false);
      },
    });
  };

  const applyTemplate = (t: Template, where: 'replace' | 'end') => {
    if (where === 'replace') editor.chain().focus().setContent({ type: 'doc', content: t.content }).run();
    else editor.chain().focus('end').insertContent(t.content).run();
    markDirty();
    setModal(null);
  };

  const saveLabel =
    save.state === 'saving' ? 'Saving…'
    : save.state === 'error' ? 'Not saved'
    : save.state === 'dirty' ? 'Unsaved changes'
    : save.at ? `Saved ${save.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    : 'Not saved yet';
  const st = STATUS_LABEL[status] ?? STATUS_LABEL.draft;

  const settingsPanel = (
    <SettingsPanel value={settings} onChange={updateSettings} onEditCover={() => { setSheet(false); setModal({ kind: 'cover' }); }} status={status} rejectReason={initial.rejectReason ?? null} onSubmit={requestSubmit} onSaveDraft={() => void persist(false)} busy={busy} maxTags={maxTags} turnstileSiteKey={turnstileSiteKey} />
  );

  const canvasEl = (
    <div
      ref={setCanvas}
      class="editor-canvas relative rounded-2xl border border-line bg-surface px-5 pb-16 pt-8 sm:px-10 lg:pl-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          editor.commands.focus('end');
        }
      }}
    >
      {recovery && (
        <div class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 font-sans text-sm text-amber-900" role="alert">
          <RotateCcw size={16} />
          <span class="flex-1">Unsaved changes from {new Date(recovery.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} were kept in this browser.</span>
          <button type="button" class="rounded bg-amber-900 px-3 py-1 font-semibold text-white" onClick={() => {
            editor.commands.setContent(recovery.bodyJson);
            setTitle(recovery.title);
            setSubtitle(recovery.subtitle);
            setSettings(recovery.settings);
            setRecovery(null);
            markDirty();
          }}>Restore</button>
          <button type="button" class="rounded border border-amber-400 px-3 py-1" onClick={() => {
            lsDel(localKey());
            lsDel('trutiai:draft:new');
            setRecovery(null);
          }}>Discard</button>
        </div>
      )}
      {save.state === 'error' && (
        <div class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 font-sans text-sm text-red-900" role="alert">
          <span class="flex-1">Not saved: {save.msg}. Your text is kept in this browser and saving retries automatically.</span>
          <button type="button" class="rounded border border-red-300 px-3 py-1" onClick={() => void persist(false)}>Retry now</button>
        </div>
      )}
      {editor.isEmpty && !title && (
        <button type="button" class="mb-6 inline-flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 font-sans text-sm text-muted hover:border-accent hover:text-ink" onClick={() => setModal({ kind: 'templates' })}>
          <LayoutTemplate size={16} /> Start from a template
        </button>
      )}
      <textarea
        class="editor-title"
        rows={1}
        placeholder="Title"
        aria-label="Title"
        maxLength={90}
        value={title}
        onInput={(e) => {
          const t = e.target as HTMLTextAreaElement;
          setTitle(t.value.replace(/\n/g, ' '));
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
          markDirty();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (document.querySelector('.editor-subtitle') as HTMLTextAreaElement | null)?.focus();
          }
        }}
      />
      <textarea
        class="editor-subtitle"
        rows={1}
        placeholder="Subtitle (optional)"
        aria-label="Subtitle"
        maxLength={140}
        value={subtitle}
        onInput={(e) => {
          const t = e.target as HTMLTextAreaElement;
          setSubtitle(t.value.replace(/\n/g, ' '));
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
          markDirty();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // Synchronous focus: commands.focus() waits a frame, and fast typing would land in the subtitle.
            editor.commands.setTextSelection(1);
            editor.view.focus();
          }
        }}
      />

      {editor.isActive('table') && (
        <div class="context-bar" role="toolbar" aria-label="Table">
          <span class="font-semibold">Table</span>
          <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()}>Row above</button>
          <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>Row below</button>
          <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()}>Column left</button>
          <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>Column right</button>
          <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</button>
          <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header row</button>
          <button type="button" class="danger" onClick={() => setModal({ kind: 'confirm', title: 'Delete this table?', body: 'You can undo with Ctrl Z.', confirmLabel: 'Delete table', danger: true, run: () => void editor.chain().focus().deleteTable().run() })}>Delete table</button>
        </div>
      )}
      {editor.isActive('codeBlock') && (
        <div class="context-bar" role="toolbar" aria-label="Code block">
          <label class="inline-flex items-center gap-2">
            <span class="font-semibold">Language</span>
            <select class="field py-0.5" value={(editor.getAttributes('codeBlock').language as string) ?? ''} onChange={(e) => editor.chain().focus().updateAttributes('codeBlock', { language: (e.target as HTMLSelectElement).value || null }).run()}>
              {LANGS.map((l) => <option value={l}>{l || 'auto'}</option>)}
            </select>
          </label>
        </div>
      )}

      <EditorContent editor={editor} class="mt-6" />
      <BlockHandle editor={editor} container={canvas} onConfirmDelete={(run) => setModal({ kind: 'confirm', title: 'Delete this block?', body: 'You can undo with Ctrl Z.', confirmLabel: 'Delete', danger: true, run })} />

      <BubbleMenu
        editor={editor}
        shouldShow={bubbleShouldShow}
        className="bubble-menu"
      >
        <BubbleBtn label="Bold (Ctrl B)" active={editor.isActive('bold')} run={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></BubbleBtn>
        <BubbleBtn label="Italic (Ctrl I)" active={editor.isActive('italic')} run={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></BubbleBtn>
        <BubbleBtn label="Underline (Ctrl U)" active={editor.isActive('underline')} run={() => editor.chain().focus().toggleUnderline().run()}><Underline size={15} /></BubbleBtn>
        <BubbleBtn label="Strikethrough" active={editor.isActive('strike')} run={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></BubbleBtn>
        <BubbleBtn label="Highlight" active={editor.isActive('highlight')} run={() => editor.chain().focus().toggleHighlight().run()}><Highlighter size={15} /></BubbleBtn>
        <BubbleBtn label="Inline code (Ctrl E)" active={editor.isActive('code')} run={() => editor.chain().focus().toggleCode().run()}><Code size={15} /></BubbleBtn>
        <BubbleBtn label="Link (Ctrl K)" active={editor.isActive('link')} run={openLink}><LinkIcon size={15} /></BubbleBtn>
      </BubbleMenu>
    </div>
  );

  const preview = doc && (
    <div class="rounded-2xl border border-line bg-surface px-5 py-8 sm:px-10">
      <Preview title={title} subtitle={subtitle} authorName={authorName} minutes={minutes} tags={tagList} coverImage={isImageSrc(settings.coverImage) ? settings.coverImage : ''} coverAlt={settings.coverAlt} doc={doc} />
    </div>
  );

  const grid =
    focus ? 'mx-auto max-w-[820px]'
    : mode === 'split' ? 'lg:grid lg:grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5'
    : mode === 'preview' ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6'
    : 'lg:grid lg:grid-cols-[52px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[52px_minmax(0,1fr)_300px] xl:gap-6';

  return (
    <div class="editor-root font-sans">
      {/* Top bar */}
      <div class="editor-topbar sticky z-30 -mx-3 mb-4 flex flex-wrap items-center gap-2 border-b border-line bg-page/90 px-3 py-2 backdrop-blur lg:-mx-6 lg:px-6">
        <span class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
        <span class={`inline-flex items-center gap-1 text-xs ${save.state === 'error' ? 'text-red-700' : 'text-muted'}`} role="status" aria-live="polite">
          {save.state === 'saved' && <Check size={13} />} {saveLabel}
        </span>
        {!focus && (
          <div class="mx-auto flex items-center gap-0.5 rounded-lg bg-line/60 p-0.5" role="group" aria-label="View">
            <ModeBtn m="write" mode={mode} setMode={setMode} icon={PenLine} label="Write" />
            <ModeBtn m="split" mode={mode} setMode={setMode} icon={Columns2} label="Split" cls="hidden lg:inline-flex" />
            <ModeBtn m="preview" mode={mode} setMode={setMode} icon={Eye} label="Preview" />
          </div>
        )}
        <div class={`flex items-center gap-1 ${focus ? 'ml-auto' : ''}`}>
          <button type="button" class="icon-btn" title={dark ? 'Light theme' : 'Dark theme'} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => {
            setDark((d) => {
              try { localStorage.setItem('trutiai:editor-theme', d ? 'light' : 'dark'); } catch { /* ignore */ }
              return !d;
            });
          }}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button type="button" class="icon-btn" title={focus ? 'Exit focus mode (Esc)' : 'Focus mode (Ctrl .)'} aria-label={focus ? 'Exit focus mode' : 'Focus mode'} aria-pressed={focus} onClick={() => { setFocus((f) => !f); setMode('write'); }}>
            {focus ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          {!focus && (
            <button type="button" class={`icon-btn ${showSettingsColumn ? 'xl:hidden' : ''}`} title="Article settings" aria-label="Article settings" aria-expanded={sheet} onClick={() => setSheet(true)}><Settings2 size={17} /></button>
          )}
          {!focus && <button type="button" disabled={busy} onClick={requestSubmit} class="ml-1 hidden rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60 sm:inline-block">{status === 'published' ? 'Resubmit' : 'Submit'}</button>}
        </div>
      </div>

      <div class={`pb-24 lg:pb-8 ${grid}`}>
        {showRail && (
          <div class={mode === 'split' ? '' : ''}>
            <Rail editor={editor} actions={{ openLink, openImage: () => openImage(), openTemplates: () => setModal({ kind: 'templates' }), openShortcuts: () => setModal({ kind: 'shortcuts' }), confirmDeleteBlock }} />
          </div>
        )}

        <div class="min-w-0">
          <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Progress to the minimum length" aria-valuemin={0} aria-valuemax={minWords} aria-valuenow={Math.min(words, minWords)}>
            <div class={`h-full transition-all ${words >= minWords ? 'bg-green-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (words / minWords) * 100)}%` }} />
          </div>
          {mode === 'preview' ? preview : canvasEl}
          <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted" aria-label="Writing statistics">
            <span>{words.toLocaleString('en-IN')} words</span>
            <span>{chars.toLocaleString('en-IN')} characters</span>
            <span>{minutes} min read</span>
            <span>{headings} {headings === 1 ? 'heading' : 'headings'}</span>
            <span>{saveLabel}</span>
            {words < minWords ? <span class="text-amber-700">{minWords - words} more words to reach the {minWords}-word minimum</span> : <span class="text-green-700">Minimum length reached (no maximum)</span>}
          </p>
        </div>

        {mode === 'split' && <div class="mt-6 min-w-0 lg:mt-0">{preview}</div>}

        {showSettingsColumn && (
          <aside class="hidden xl:block" aria-label="Article settings">
            <div class="sticky top-[7.75rem] max-h-[calc(100dvh-8.75rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-4">{settingsPanel}</div>
          </aside>
        )}
      </div>

      {/* Settings sheet for tablet/mobile (and split mode) */}
      {sheet && (
        <div class="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
          <aside class="h-full w-full max-w-sm overflow-y-auto border-l border-line bg-surface p-5 shadow-xl" aria-label="Article settings">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-bold">Article settings</h2>
              <button type="button" class="icon-btn" aria-label="Close settings" onClick={() => setSheet(false)}><X size={18} /></button>
            </div>
            {settingsPanel}
          </aside>
        </div>
      )}

      {/* Dialogs */}
      {modal?.kind === 'link' && (
        <Modal title="Link" onClose={() => setModal(null)}>
          <form class="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            const url = modal.url.trim();
            if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
            else {
              const href = /^(https?:|mailto:|\/)/i.test(url) ? url : `https://${url}`;
              if (editor.state.selection.empty && !editor.isActive('link')) editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] }).run();
              else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            }
            setModal(null);
          }}>
            <input class="field" value={modal.url} placeholder="https://example.com" inputMode="url" onInput={(e) => setModal({ kind: 'link', url: (e.target as HTMLInputElement).value })} />
            <p class="text-xs text-muted">Leave empty and save to remove the link. Links in community articles are marked as user content (nofollow).</p>
            <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button class="btn-primary">Save link</button></div>
          </form>
        </Modal>
      )}

      {modal?.kind === 'image' && (
        <BodyImageDialog
          initialFile={modal.file}
          onClose={() => setModal(null)}
          onInsert={(src, alt) => {
            editor.chain().focus().setImage({ src, alt }).run();
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'cover' && (
        <CoverDialog
          current={settings.coverImage}
          currentAlt={settings.coverAlt}
          onClose={() => setModal(null)}
          onSave={(src, alt) => {
            updateSettings({ coverImage: src, coverAlt: alt });
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'templates' && (
        <Modal title="Start from a template" wide onClose={() => setModal(null)}>
          {modal.chosen ? (
            <div class="grid gap-4">
              <p>Your article already has content. Add the <strong>{modal.chosen.name}</strong> structure at the end, or replace everything?</p>
              <div class="flex flex-wrap justify-end gap-2">
                <button type="button" class="btn-secondary" onClick={() => setModal({ kind: 'templates' })}>Back</button>
                <button type="button" class="btn-secondary" onClick={() => applyTemplate(modal.chosen!, 'end')}>Add at the end</button>
                <button type="button" class="btn-danger" onClick={() => applyTemplate(modal.chosen!, 'replace')}>Replace content</button>
              </div>
            </div>
          ) : (
            <div class="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button type="button" class="rounded-xl border border-line p-4 text-left hover:border-accent" onClick={() => (editor.isEmpty ? applyTemplate(t, 'replace') : setModal({ kind: 'templates', chosen: t }))}>
                  <p class="font-semibold">{t.name}</p>
                  <p class="mt-1 text-sm text-muted">{t.description}</p>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.kind === 'shortcuts' && (
        <Modal title="Keyboard shortcuts" wide onClose={() => setModal(null)}>
          <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ['Open block menu', '/'], ['Save now', 'Ctrl S'], ['Bold / Italic / Underline', 'Ctrl B / I / U'], ['Strikethrough', 'Ctrl Shift S'],
              ['Highlight', 'Ctrl Shift H'], ['Inline code', 'Ctrl E'], ['Link', 'Ctrl K'], ['Heading / Subheading / Minor', 'Ctrl Alt 2 / 3 / 4'],
              ['Paragraph', 'Ctrl Alt 0'], ['Bulleted / Numbered list', 'Ctrl Shift 8 / 7'], ['Quote', 'Ctrl Shift B'], ['Code block', 'Ctrl Alt C'],
              ['Move block up / down', 'Alt Shift ↑ / ↓'], ['Duplicate block', 'Alt Shift D'], ['Delete block', 'Alt Shift Backspace'],
              ['Undo / Redo', 'Ctrl Z / Ctrl Shift Z'], ['Preview', 'Ctrl Alt P'], ['Focus mode', 'Ctrl .'], ['Exit focus / close panels', 'Esc'], ['This list', '?'],
            ].map(([a, k]) => (
              <div class="flex items-center justify-between gap-3 border-b border-line py-1.5"><dt>{a}</dt><dd><kbd class="kbd">{k}</kbd></dd></div>
            ))}
          </dl>
          <p class="mt-3 text-xs text-muted">On a Mac, use Cmd instead of Ctrl and Option instead of Alt.</p>
        </Modal>
      )}

      {modal?.kind === 'notice' && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <ul class="list-disc space-y-1 pl-5 text-sm">{modal.items.map((i) => <li>{i}</li>)}</ul>
          <div class="mt-4 flex justify-end"><button type="button" class="btn-primary" onClick={() => setModal(null)}>OK</button></div>
        </Modal>
      )}

      {modal?.kind === 'confirm' && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <p class="text-sm text-muted">{modal.body}</p>
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" class="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button type="button" class={modal.danger ? 'btn-danger' : 'btn-primary'} onClick={async () => {
              const run = modal.run;
              setModal(null);
              await run();
            }}>{modal.confirmLabel}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
