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
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Editor as TEditor, JSONContent } from '@tiptap/core';
import {
  Bold, Check, Code, Columns2, Eye, Highlighter, Italic, LayoutTemplate, Link as LinkIcon, Maximize2, Minimize2, Moon,
  History, PenLine, RotateCcw, Settings2, Strikethrough, Sun, Underline, X,
} from 'lucide-preact';
import { buildExtensions, type EditorCallbacks } from './extensions';
import type { SlashItem } from './slash';
import { countHeadings, currentBlock, blockHasContent, deleteBlock } from './blockOps';
import Rail from './Rail';
import BlockHandle from './BlockHandle';
import Modal from './Modal';
import Preview from './Preview';
import SettingsPanel, { STATUS_LABEL, emptyTech, type Settings, type TechFields } from './SettingsPanel';
import { TEMPLATES, type Template } from './templates';
import { BodyImageDialog, CoverDialog } from './ImageDialogs';
import { isImageSrc } from '../../lib/media';
import { slugify } from '../../lib/slug';
import { changedFraction } from '../../lib/fingerprint';

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
  seoTitle?: string | null;
  category?: string | null;
  slug?: string | null;
  summarySource?: string | null;
  summaryBasis?: string | null;
  featured?: boolean;
  publishedAt?: string | null;
  kind?: 'community' | 'editorial';
  scheduledAt?: string | null;
  tech?: Partial<TechFields> | null;
  version?: number;
  internCode?: string;
};

type Props = { initial?: InitialPost; authorName: string; minWords: number; maxTags: number; turnstileSiteKey?: string; isAdmin?: boolean; host?: string };
type Mode = 'write' | 'split' | 'preview';
type SaveState = { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; at: Date | null; msg?: string };
type LocalDraft = { title: string; subtitle: string; settings: Settings; bodyJson: JSONContent; at: number };
type ModalState =
  | { kind: 'link'; url: string }
  | { kind: 'table'; rows: number; cols: number; header: boolean }
  | { kind: 'image'; file?: File }
  | { kind: 'cover' }
  | { kind: 'published'; url: string; commitUrl: string | null; dryRun: boolean; first: boolean }
  | { kind: 'schedule' }
  | { kind: 'templates'; chosen?: Template }
  | { kind: 'shortcuts' }
  | { kind: 'history'; items?: { id: number; title: string; savedAt: string; words: number }[]; error?: string }
  | { kind: 'conflict' }
  | { kind: 'notice'; title: string; items: string[] }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; run: () => void | Promise<void> };

const TABLE_MAX_ROWS = 50;
const TABLE_MAX_COLS = 10;
function clampInt(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}
/** Small picture of the table about to be inserted (capped at 8 x 8 cells so it stays small). */
function TablePreview({ rows, cols, header }: { rows: number; cols: number; header: boolean }) {
  const r = Math.min(rows, 8);
  const c = Math.min(cols, 8);
  return (
    <div aria-hidden="true" class="flex items-center gap-3">
      <div class="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${c}, 1.25rem)` }}>
        {Array.from({ length: r * c }, (_, i) => <span class={`h-3.5 rounded-sm border border-line ${header && i < c ? 'bg-accent/30' : 'bg-page'}`} />)}
      </div>
      <span class="text-xs text-muted">{rows} × {cols}{rows > 8 || cols > 8 ? ' (preview shortened)' : ''}</span>
    </div>
  );
}

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

export default function Editor({ initial = {}, authorName, minWords, maxTags, turnstileSiteKey, isAdmin = false, host = 'trutiai.in' }: Props) {
  const idRef = useRef<string | undefined>(initial.id);
  const [title, setTitle] = useState(initial.title && initial.title !== 'Untitled draft' ? initial.title : '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [settings, setSettings] = useState<Settings>({
    description: initial.description ?? '',
    tags: (initial.tags ?? []).join(', '),
    coverImage: initial.coverImage ?? '',
    coverAlt: initial.coverAlt ?? '',
    seoTitle: initial.seoTitle ?? '',
    category: initial.category ?? '',
    slug: initial.slug ?? '',
    summarySource: (initial.summarySource === 'ai' || initial.summarySource === 'user' ? initial.summarySource : '') as Settings['summarySource'],
    summaryBasis: initial.summaryBasis ?? '',
    featured: !!initial.featured,
    tech: emptyTech(initial.tech),
    internCode: initial.internCode ?? '',
  });
  // The URL follows the title until the writer edits it (or the post is published, which locks it).
  const [slugTouched, setSlugTouched] = useState(!!initial.slug && initial.slug !== slugify(initial.title ?? '') && initial.slug !== 'untitled-draft');
  const [slugLocked, setSlugLocked] = useState(!!initial.publishedAt);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [summaryStale, setSummaryStale] = useState(false);
  const autoTried = useRef(false);
  const lastAutoRegen = useRef(0);
  const [status, setStatus] = useState(initial.status ?? 'draft');
  // Admin articles are editorial: published from here to /blog/ (D-029). Everyone else submits for review.
  const editorial = (initial.kind ?? (isAdmin ? 'editorial' : 'community')) === 'editorial' && isAdmin;
  const [scheduledAt, setScheduledAt] = useState<string | null>(initial.scheduledAt ?? null);
  const [publishedOnce, setPublishedOnce] = useState(!!initial.publishedAt);
  const [dirtySincePublish, setDirtySincePublish] = useState(false);
  const [mode, setMode] = useState<Mode>('write');
  const [focus, setFocus] = useState(false);
  const [dark, setDark] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: 'idle', at: initial.updatedAt ? new Date(initial.updatedAt) : null });
  const [modal, setModal] = useState<ModalState | null>(null);
  /** The last table size chosen, offered again next time. */
  const lastTable = useRef({ rows: 3, cols: 3, header: true });
  const [recovery, setRecovery] = useState<LocalDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);

  const effectiveSlug = slugLocked || slugTouched ? settings.slug : title.trim() ? slugify(title) : settings.slug;
  const latest = useRef({ title, subtitle, settings, effectiveSlug });
  latest.current = { title, subtitle, settings, effectiveSlug };
  const version = useRef(0);
  /** Server-side version this editor last saw; sent with every save so a newer save elsewhere is never overwritten. */
  const serverVersion = useRef(initial.version ?? 0);
  const forceNext = useRef(false);
  const conflicted = useRef(false);
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
  const payload = (submit: boolean, snapshot = false) => {
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
      seoTitle: s.seoTitle.trim().slice(0, 70),
      category: s.category,
      slug: latest.current.effectiveSlug,
      summarySource: s.summarySource,
      summaryBasis: s.summaryBasis,
      ...(isAdmin ? { featured: s.featured } : {}),
      tech: s.tech,
      ...(isAdmin ? {} : { internCode: (s.internCode ?? '').trim() }),
      ...(idRef.current ? { baseVersion: serverVersion.current } : {}),
      force: forceNext.current,
      submit,
      autosave: !submit && !snapshot,
      turnstileToken: submit ? document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? '' : '',
    };
  };

  /** snapshot = also keep this exact state in Version history (used before restoring an older version). */
  const persist = useCallback(async (submit = false, snapshot = false): Promise<boolean> => {
    if (inflight.current) {
      pending.current = true;
      return false;
    }
    // After a conflict, wait for the writer's choice instead of retrying in the background.
    if (conflicted.current && !forceNext.current) return false;
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(maxTimer.current);
    window.clearTimeout(retryTimer.current);
    maxTimer.current = undefined;
    const v = version.current;
    inflight.current = true;
    setSave((s) => ({ ...s, state: 'saving' }));
    try {
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(submit, snapshot)) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; redirect?: string; error?: string; slug?: string; slugLocked?: boolean; slugError?: string | null; version?: number; conflict?: boolean };
      if (res.status === 409 && data.conflict) {
        conflicted.current = true;
        setSave((s) => ({ ...s, state: 'error', msg: 'Changed in another tab' }));
        setModal({ kind: 'conflict' });
        return false;
      }
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      if (typeof data.version === 'number') serverVersion.current = data.version;
      conflicted.current = false;
      forceNext.current = false;
      if (data.id && !idRef.current) {
        const oldKey = localKey();
        idRef.current = data.id;
        history.replaceState(null, '', `/write/?id=${data.id}`);
        lsDel(oldKey);
      }
      if (data.status) setStatus(data.status);
      if (data.slug) setSettings((cur) => (cur.slug === data.slug ? cur : { ...cur, slug: data.slug! }));
      if (typeof data.slugLocked === 'boolean') setSlugLocked(data.slugLocked);
      setSlugError(data.slugError ?? null);
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
    setDirtySincePublish(true);
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

  const openHistory = async () => {
    setModal({ kind: 'history' });
    // Save first so the newest work is part of the list.
    if (version.current !== savedVersion.current) await persist(false);
    if (!idRef.current) return setModal({ kind: 'history', items: [] });
    try {
      const r = await fetch(`/api/posts/${idRef.current}/revisions`);
      const d = (await r.json()) as { revisions?: { id: number; title: string; savedAt: string; words: number }[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Could not load versions.');
      setModal((m) => (m?.kind === 'history' ? { kind: 'history', items: d.revisions ?? [] } : m));
    } catch (e) {
      setModal((m) => (m?.kind === 'history' ? { kind: 'history', error: (e as Error).message } : m));
    }
  };
  const restoreRevision = async (rev: number) => {
    if (!editor || !idRef.current) return;
    try {
      const r = await fetch(`/api/posts/${idRef.current}/revisions?rev=${rev}`);
      const d = (await r.json()) as { title?: string; bodyJson?: JSONContent; error?: string };
      if (!r.ok || !d.bodyJson) throw new Error(d.error ?? 'Could not load this version.');
      // Keep the current state in history first, so restoring is never a one-way door.
      await persist(false, true);
      editor.commands.setContent(d.bodyJson);
      if (d.title && d.title !== 'Untitled draft') setTitle(d.title);
      setModal(null);
      markDirty();
    } catch (e) {
      setModal({ kind: 'history', error: (e as Error).message });
    }
  };

  const openLink = () => {
    if (!editor) return;
    setModal({ kind: 'link', url: (editor.getAttributes('link').href as string) ?? '' });
  };
  const openImage = (file?: File) => setModal({ kind: 'image', file });
  const openTable = () => {
    if (!editor || editor.isActive('table')) return;
    setModal({ kind: 'table', ...lastTable.current });
  };
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

  // ---------- AI summary ----------
  const runGenerate = async (auto = false) => {
    const ed = editorRef.current;
    if (!ed || aiBusy) return;
    setAiBusy(true);
    setAiError('');
    try {
      const text = ed.getText();
      const res = await fetch('/api/ai/summary', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: latest.current.title, text }) });
      const data = (await res.json().catch(() => ({}))) as { summary?: string; basis?: string; error?: string };
      if (!res.ok || !data.summary) throw new Error(data.error ?? 'Could not generate a summary.');
      // Never replace a summary the writer edited while this request was running.
      const cur = latest.current.settings;
      if (auto && cur.summarySource === 'user' && cur.description.trim()) return;
      setSettings((c) => ({ ...c, description: data.summary!, summarySource: 'ai', summaryBasis: data.basis ?? '' }));
      setSummaryStale(false);
      markDirty();
    } catch (e) {
      if (!auto) setAiError((e as Error).message);
      // An automatic attempt that failed may try again after a minute of further writing.
      else window.setTimeout(() => (autoTried.current = false), 60_000);
    } finally {
      setAiBusy(false);
    }
  };
  const generateSummary = () => {
    const cur = latest.current.settings;
    if (cur.summarySource === 'user' && cur.description.trim()) {
      setModal({ kind: 'confirm', title: 'Replace your summary?', body: 'You wrote or edited this summary yourself. Generating a new one replaces it (you can undo by typing it again).', confirmLabel: 'Replace with AI summary', run: () => runGenerate(false) });
    } else void runGenerate(false);
  };
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
      { group: 'Blocks', title: 'Table', hint: 'Choose rows, columns and header', keywords: 'grid table', run: () => openTable() },
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
      // Light by default; dark only when the writer switched to it (moon button).
      setDark(pref === 'dark');
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

  // Summary upkeep, 4 s after typing pauses: first summary at 300 words; refresh AI summaries after big changes;
  // flag (never overwrite) a writer's own summary when the article changed a lot.
  const wordsNow = editor ? (editor.storage.characterCount.words() as number) : 0;
  useEffect(() => {
    if (!editor) return;
    const t = window.setTimeout(() => {
      const cur = latest.current.settings;
      if (wordsNow >= 300 && !cur.description.trim() && !autoTried.current) {
        autoTried.current = true;
        void runGenerate(true);
        return;
      }
      if (!cur.description.trim() || !cur.summaryBasis) return setSummaryStale(false);
      const changed = changedFraction(cur.summaryBasis, editor.getText()) > 0.3;
      if (changed && cur.summarySource === 'ai' && Date.now() - lastAutoRegen.current > 120_000) {
        lastAutoRegen.current = Date.now();
        void runGenerate(true);
      } else setSummaryStale(changed && cur.summarySource === 'user');
    }, 4000);
    return () => window.clearTimeout(t);
  }, [editor, wordsNow]);

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

  /** Save the latest text and wait for it (publishing must use exactly what is on screen). */
  const saveAndWait = async (): Promise<boolean> => {
    for (let i = 0; i < 100 && inflight.current; i++) await new Promise((r) => setTimeout(r, 100));
    if (version.current === savedVersion.current && idRef.current) return true;
    await persist(false);
    for (let i = 0; i < 100 && inflight.current; i++) await new Promise((r) => setTimeout(r, 100));
    return version.current === savedVersion.current && !!idRef.current;
  };

  const editorialCall = async (action: 'publish' | 'schedule' | 'unschedule' | 'unpublish', at?: string) => {
    setBusy(true);
    try {
      if (action !== 'unpublish' && action !== 'unschedule' && !(await saveAndWait())) throw new Error('Could not save the latest changes. Check your connection and try again.');
      const res = await fetch('/api/editorial', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: idRef.current, action, at }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: string[]; url?: string; commitUrl?: string | null; dryRun?: boolean; scheduledAt?: string };
      if (!res.ok || !data.ok) {
        setModal({ kind: 'notice', title: action === 'publish' ? 'Not published yet' : 'That did not work', items: data.errors ?? [`Error ${res.status}`] });
        return;
      }
      if (action === 'publish') {
        const first = !publishedOnce;
        setStatus('published');
        setPublishedOnce(true);
        setScheduledAt(null);
        setSlugLocked(true);
        setDirtySincePublish(false);
        setModal({ kind: 'published', url: data.url ?? '', commitUrl: data.commitUrl ?? null, dryRun: !!data.dryRun, first });
      } else if (action === 'schedule') {
        setStatus('scheduled');
        setScheduledAt(data.scheduledAt ?? at ?? null);
        setModal(null);
      } else if (action === 'unschedule') {
        setStatus('draft');
        setScheduledAt(null);
      } else {
        setStatus('unpublished');
      }
    } catch (e) {
      setModal({ kind: 'notice', title: 'That did not work', items: [(e as Error).message] });
    } finally {
      setBusy(false);
    }
  };

  const requestSubmit = () => {
    const p: string[] = [];
    if (title.trim().length < 10) p.push('Give the article a title of at least 10 characters.');
    if (settings.description.trim().length < 50) p.push('Add a summary of at least 50 characters: click "Generate with AI" or write it (right panel).');
    if (tagList.length < 1) p.push('Add at least one tag.');
    if (!settings.category || settings.category === 'c:') p.push('Choose a category (right panel).');
    if (words < minWords) p.push(`Write at least ${minWords} words (now ${words}).`);
    if (settings.coverImage && !isImageSrc(settings.coverImage)) p.push('The cover image address is not valid. Upload the image or use a full https:// address.');
    if (settings.coverImage && !settings.coverAlt.trim()) p.push('Describe the cover image (alt text).');
    if (p.length) {
      setModal({ kind: 'notice', title: editorial ? 'Before you publish' : 'Before you submit', items: p });
      return;
    }
    if (editorial) {
      setModal({
        kind: 'confirm',
        title: publishedOnce ? 'Update the published article?' : 'Publish to the blog?',
        body: `It goes live at ${host}/blog/${effectiveSlug}/ about 2 to 3 minutes after you confirm (the site rebuilds). ${publishedOnce ? 'Readers see the update after the rebuild.' : 'The address cannot change after publishing.'}`,
        confirmLabel: publishedOnce ? 'Update article' : 'Publish now',
        run: () => editorialCall('publish'),
      });
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
    <SettingsPanel
      value={settings}
      title={title}
      effectiveSlug={effectiveSlug}
      slugLocked={slugLocked}
      slugError={slugError}
      onSlugInput={(v) => { setSlugTouched(true); setSlugError(null); updateSettings({ slug: v }); }}
      onGenerate={generateSummary}
      aiBusy={aiBusy}
      aiError={aiError}
      summaryStale={summaryStale}
      isAdmin={isAdmin}
      host={host}
      onChange={updateSettings} onEditCover={() => { setSheet(false); setModal({ kind: 'cover' }); }}
      actionsSlot={editorial ? (
        <div class="grid min-w-0 grid-cols-1 gap-2 border-t border-line pt-4">
          {status === 'scheduled' && scheduledAt && (
            <p class="rounded-lg border border-line bg-page p-2.5 text-xs">Scheduled for <strong>{new Date(scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong>. It goes live within 15 minutes of that time.</p>
          )}
          {status === 'published' && (
            <p class="rounded-lg border border-accent/30 bg-accent/10 p-2.5 text-xs text-accent-strong">
              Live at <a class="underline" href={`/blog/${effectiveSlug}/`} target="_blank">{host}/blog/{effectiveSlug}/</a>.{dirtySincePublish ? ' You have changes that are not live yet: click Update article.' : ''}
            </p>
          )}
          {status === 'unpublished' && <p class="rounded-lg border border-line bg-page p-2.5 text-xs">Taken offline. Publish again to restore it at the same address.</p>}
          <button type="button" disabled={busy} onClick={requestSubmit} class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
            {busy ? 'Working…' : status === 'published' ? 'Update article' : status === 'unpublished' ? 'Publish again' : 'Publish to blog'}
          </button>
          {!publishedOnce && status !== 'scheduled' && <button type="button" disabled={busy} onClick={() => setModal({ kind: 'schedule' })} class="rounded-lg border border-line px-4 py-2 hover:bg-page">Schedule…</button>}
          {status === 'scheduled' && <button type="button" disabled={busy} onClick={() => void editorialCall('unschedule')} class="rounded-lg border border-line px-4 py-2 hover:bg-page">Cancel schedule</button>}
          {status === 'published' && (
            <button type="button" disabled={busy} class="text-xs text-red-700 underline" onClick={() => setModal({ kind: 'confirm', title: 'Take this article offline?', body: 'The page disappears from the blog after the rebuild (2 to 3 minutes). The address stays reserved, and you can publish it again later.', confirmLabel: 'Unpublish', danger: true, run: () => editorialCall('unpublish') })}>Unpublish</button>
          )}
          <p class="text-xs text-muted">Your articles skip community review and become static pages on the blog, listed on the home page, topics, RSS and sitemap.</p>
        </div>
      ) : undefined} status={status} rejectReason={initial.rejectReason ?? null} onSubmit={requestSubmit} onSaveDraft={() => void persist(false)} busy={busy} maxTags={maxTags} turnstileSiteKey={turnstileSiteKey} />
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
            setSettings({ ...recovery.settings, tech: emptyTech(recovery.settings.tech), internCode: recovery.settings.internCode ?? '' });
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
          {!focus && <button type="button" class="icon-btn" title="Version history" aria-label="Version history" onClick={openHistory}><History size={17} /></button>}
          <button type="button" class="icon-btn" title={focus ? 'Exit focus mode (Esc)' : 'Focus mode (Ctrl .)'} aria-label={focus ? 'Exit focus mode' : 'Focus mode'} aria-pressed={focus} onClick={() => { setFocus((f) => !f); setMode('write'); }}>
            {focus ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          {!focus && (
            <button type="button" class={`icon-btn ${showSettingsColumn ? 'xl:hidden' : ''}`} title="Article settings" aria-label="Article settings" aria-expanded={sheet} onClick={() => setSheet(true)}><Settings2 size={17} /></button>
          )}
          {!focus && <button type="button" disabled={busy} onClick={requestSubmit} class="ml-1 hidden rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60 sm:inline-block">{editorial ? (publishedOnce ? 'Update' : 'Publish') : status === 'published' ? 'Resubmit' : 'Submit'}</button>}
        </div>
      </div>

      <div class={`pb-24 lg:pb-8 ${grid}`}>
        {showRail && (
          <div class={mode === 'split' ? '' : ''}>
            <Rail editor={editor} actions={{ openLink, openTable, openImage: () => openImage(), openTemplates: () => setModal({ kind: 'templates' }), openShortcuts: () => setModal({ kind: 'shortcuts' }), confirmDeleteBlock }} />
          </div>
        )}

        <div class="min-w-0">
          <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Progress to the minimum length" aria-valuemin={0} aria-valuemax={minWords} aria-valuenow={Math.min(words, minWords)}>
            <div class={`h-full transition-all ${words >= minWords ? 'bg-accent' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (words / minWords) * 100)}%` }} />
          </div>
          {mode === 'preview' ? preview : canvasEl}
          <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted" aria-label="Writing statistics">
            <span>{words.toLocaleString('en-IN')} words</span>
            <span>{chars.toLocaleString('en-IN')} characters</span>
            <span>{minutes} min read</span>
            <span>{headings} {headings === 1 ? 'heading' : 'headings'}</span>
            <span>{saveLabel}</span>
            {words < minWords ? <span class="text-amber-700">{minWords - words} more words to reach the {minWords}-word minimum</span> : <span class="text-accent-strong">Minimum length reached (no maximum)</span>}
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

      {modal?.kind === 'table' && (
        <Modal title="Insert table" onClose={() => setModal(null)}>
          <form class="grid gap-4" onSubmit={(e) => {
            e.preventDefault();
            const rows = clampInt(modal.rows, 1, TABLE_MAX_ROWS);
            const cols = clampInt(modal.cols, 1, TABLE_MAX_COLS);
            lastTable.current = { rows, cols, header: modal.header };
            setModal(null);
            // A header row counts as one of the rows, so a 1-row table with a header is just the header.
            editor.chain().focus().insertTable({ rows, cols, withHeaderRow: modal.header }).run();
          }}>
            <div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1 text-sm"><span class="font-semibold">Rows</span>
                <input class="field" type="number" min={1} max={TABLE_MAX_ROWS} required value={modal.rows} data-testid="table-rows" onInput={(e) => setModal({ ...modal, rows: Number((e.target as HTMLInputElement).value) })} />
              </label>
              <label class="grid gap-1 text-sm"><span class="font-semibold">Columns</span>
                <input class="field" type="number" min={1} max={TABLE_MAX_COLS} required value={modal.cols} data-testid="table-cols" onInput={(e) => setModal({ ...modal, cols: Number((e.target as HTMLInputElement).value) })} />
              </label>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modal.header} data-testid="table-header" onChange={(e) => setModal({ ...modal, header: (e.target as HTMLInputElement).checked })} />
              First row is a header
            </label>
            <TablePreview rows={clampInt(modal.rows, 1, TABLE_MAX_ROWS)} cols={clampInt(modal.cols, 1, TABLE_MAX_COLS)} header={modal.header} />
            <p class="text-xs text-muted">Up to {TABLE_MAX_ROWS} rows and {TABLE_MAX_COLS} columns. You can add or remove rows and columns later from the table menu.</p>
            <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button class="btn-primary">Insert table</button></div>
          </form>
        </Modal>
      )}

      {modal?.kind === 'image' && (
        <BodyImageDialog
          initialFile={modal.file}
          onClose={() => setModal(null)}
          onInsert={(src, alt) => {
            // After inserting, put the cursor on the line below the image (adding an empty line if the image is
            // last). Left as a selected node, the next keystroke would replace the image with text.
            editor.chain().focus(null, { scrollIntoView: false }).setImage({ src, alt }).command(({ tr, state }) => {
              const sel = tr.selection;
              if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return true;
              const after = sel.to;
              if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, state.schema.nodes.paragraph.create());
              tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
              return true;
            }).run();
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'published' && (
        <Modal title={modal.first ? 'Published' : 'Update sent'} onClose={() => setModal(null)}>
          <p class="text-sm">{modal.dryRun ? 'Dry run (local testing): nothing was sent to GitHub.' : `The site is rebuilding. Your article ${modal.first ? 'goes live' : 'updates'} in about 2 to 3 minutes.`}</p>
          <p class="mt-3 text-sm"><a class="font-semibold text-accent underline" href={modal.url} target="_blank">{host}{modal.url}</a></p>
          {modal.commitUrl && <p class="mt-1 text-xs text-muted"><a class="underline" href={modal.commitUrl} target="_blank" rel="noopener">See the change on GitHub</a></p>}
          <div class="mt-4 flex justify-end"><button type="button" class="btn-primary" onClick={() => setModal(null)}>Done</button></div>
        </Modal>
      )}

      {modal?.kind === 'schedule' && (
        <Modal title="Schedule publishing" onClose={() => setModal(null)}>
          <form class="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            const v = (e.currentTarget.elements.namedItem('when') as HTMLInputElement).value;
            if (!v) return;
            void editorialCall('schedule', new Date(v).toISOString());
          }}>
            <label class="grid gap-1.5 text-sm">
              <span class="font-semibold">Publish on</span>
              <input name="when" type="datetime-local" required class="field" min={new Date(Date.now() + 10 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} />
              <span class="text-xs text-muted">Your local time. The article goes live within 15 minutes after this time, then takes 2 to 3 minutes to rebuild.</span>
            </label>
            <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button class="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Schedule'}</button></div>
          </form>
        </Modal>
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

      {modal?.kind === 'history' && (
        <Modal title="Version history" wide onClose={() => setModal(null)}>
          <p class="text-sm text-muted">A version is kept when you submit or publish, and at most every 5 minutes while you write. The last 20 are kept. Restoring replaces the editor content; Ctrl Z undoes it.</p>
          {modal.error && <p class="mt-3 text-sm text-red-700" role="alert">{modal.error}</p>}
          {!modal.items && !modal.error && <p class="mt-3 text-sm text-muted">Loading…</p>}
          {modal.items && modal.items.length === 0 && <p class="mt-3 text-sm text-muted">No saved versions yet. Keep writing: the first one is kept within a few minutes.</p>}
          {modal.items && modal.items.length > 0 && (
            <ul class="mt-3 max-h-[60vh] divide-y divide-line overflow-y-auto rounded-lg border border-line" aria-label="Saved versions">
              {modal.items.map((r, i) => (
                <li class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span class="min-w-0">
                    <span class="block font-semibold">{new Date(r.savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{i === 0 && <span class="ml-2 rounded bg-page px-1.5 py-0.5 text-xs font-normal text-muted">latest</span>}</span>
                    <span class="block truncate text-xs text-muted">{r.title} · {r.words.toLocaleString('en-IN')} words</span>
                  </span>
                  <button type="button" class="btn-secondary" onClick={() => void restoreRevision(r.id)}>Restore</button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {modal?.kind === 'conflict' && (
        <Modal title="Changed somewhere else" onClose={() => setModal(null)}>
          <p class="text-sm text-muted">This article was saved from another tab or device after you opened it. Saving here now would overwrite that work, so autosave is paused.</p>
          <ul class="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li><strong>Load the latest</strong> opens the newer version. What you typed here is kept in this browser and offered back.</li>
            <li><strong>Keep mine</strong> saves this version over the other one. The other one stays in Version history.</li>
          </ul>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" class="btn-secondary" onClick={() => { savedVersion.current = version.current; location.reload(); }}>Load the latest</button>
            <button type="button" class="btn-danger" onClick={() => { forceNext.current = true; setModal(null); void persist(false); }}>Keep mine</button>
          </div>
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
