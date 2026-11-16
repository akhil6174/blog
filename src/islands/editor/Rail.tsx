/**
 * Left formatting rail. Desktop: sticky vertical icon bar. Below lg: fixed horizontal bar at the bottom.
 * Every button has a tooltip with its shortcut and aria-pressed for toggles.
 */
import { useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import type { ComponentType } from 'preact';
import {
  ArrowDown, ArrowUp, Bold, Code, Copy, Heading2, Heading3, Heading4, Highlighter, Image, Italic, Keyboard, LayoutTemplate, Link,
  List, ListOrdered, Minus, Pilcrow, Quote, Redo2, SquareCode, Strikethrough, Table, Trash2, Underline, Undo2,
} from 'lucide-preact';
import { duplicateBlock, moveBlock } from './blockOps';

type Btn = { icon: ComponentType<{ size?: number; strokeWidth?: number }>; label: string; keys?: string; run: () => void; active?: boolean; disabled?: boolean };

export type RailActions = {
  openLink: () => void;
  openTable: () => void;
  openImage: () => void;
  openTemplates: () => void;
  openShortcuts: () => void;
  confirmDeleteBlock: () => void;
};

export default function Rail({ editor, actions }: { editor: Editor; actions: RailActions }) {
  // One tooltip rendered OUTSIDE the scrolling rail (position: fixed). Tooltips inside it made the rail scroll sideways.
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const showTip = (e: Event, text: string) => {
    if (window.innerWidth < 1024) return;
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    const rail = btn.closest('.editor-rail')?.getBoundingClientRect();
    setTip({ text, x: (rail?.right ?? r.right) + 8, y: r.top + r.height / 2 });
  };
  const c = () => editor.chain().focus();
  const groups: Btn[][] = [
    [
      { icon: Undo2, label: 'Undo', keys: 'Ctrl Z', run: () => c().undo().run(), disabled: !editor.can().undo() },
      { icon: Redo2, label: 'Redo', keys: 'Ctrl Shift Z', run: () => c().redo().run(), disabled: !editor.can().redo() },
    ],
    [
      { icon: Pilcrow, label: 'Paragraph', keys: 'Ctrl Alt 0', run: () => c().setParagraph().run(), active: editor.isActive('paragraph') },
      { icon: Heading2, label: 'Heading', keys: 'Ctrl Alt 2', run: () => c().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
      { icon: Heading3, label: 'Subheading', keys: 'Ctrl Alt 3', run: () => c().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }) },
      { icon: Heading4, label: 'Minor heading', keys: 'Ctrl Alt 4', run: () => c().toggleHeading({ level: 4 }).run(), active: editor.isActive('heading', { level: 4 }) },
    ],
    [
      { icon: Bold, label: 'Bold', keys: 'Ctrl B', run: () => c().toggleBold().run(), active: editor.isActive('bold') },
      { icon: Italic, label: 'Italic', keys: 'Ctrl I', run: () => c().toggleItalic().run(), active: editor.isActive('italic') },
      { icon: Underline, label: 'Underline', keys: 'Ctrl U', run: () => c().toggleUnderline().run(), active: editor.isActive('underline') },
      { icon: Strikethrough, label: 'Strikethrough', keys: 'Ctrl Shift S', run: () => c().toggleStrike().run(), active: editor.isActive('strike') },
      { icon: Highlighter, label: 'Highlight', keys: 'Ctrl Shift H', run: () => c().toggleHighlight().run(), active: editor.isActive('highlight') },
      { icon: Code, label: 'Inline code', keys: 'Ctrl E', run: () => c().toggleCode().run(), active: editor.isActive('code') },
    ],
    [
      { icon: List, label: 'Bulleted list', keys: 'Ctrl Shift 8', run: () => c().toggleBulletList().run(), active: editor.isActive('bulletList') },
      { icon: ListOrdered, label: 'Numbered list', keys: 'Ctrl Shift 7', run: () => c().toggleOrderedList().run(), active: editor.isActive('orderedList') },
      { icon: Quote, label: 'Quote', keys: 'Ctrl Shift B', run: () => c().toggleBlockquote().run(), active: editor.isActive('blockquote') },
      { icon: SquareCode, label: 'Code block', keys: 'Ctrl Alt C', run: () => c().toggleCodeBlock().run(), active: editor.isActive('codeBlock') },
    ],
    [
      { icon: Link, label: 'Link', keys: 'Ctrl K', run: actions.openLink, active: editor.isActive('link') },
      { icon: Image, label: 'Image', run: actions.openImage },
      { icon: Table, label: 'Table', run: actions.openTable, disabled: editor.isActive('table') },
      { icon: Minus, label: 'Divider', run: () => c().setHorizontalRule().run() },
    ],
    [
      { icon: ArrowUp, label: 'Move block up', keys: 'Alt Shift ↑', run: () => moveBlock(editor, -1) },
      { icon: ArrowDown, label: 'Move block down', keys: 'Alt Shift ↓', run: () => moveBlock(editor, 1) },
      { icon: Copy, label: 'Duplicate block', keys: 'Alt Shift D', run: () => duplicateBlock(editor) },
      { icon: Trash2, label: 'Delete block', keys: 'Alt Shift Backspace', run: actions.confirmDeleteBlock },
    ],
    [
      { icon: LayoutTemplate, label: 'Templates', run: actions.openTemplates },
      { icon: Keyboard, label: 'Keyboard shortcuts', keys: '?', run: actions.openShortcuts },
    ],
  ];

  return (
    <>
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="vertical"
      onScroll={() => setTip(null)}
      class="editor-rail fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 overflow-x-auto border-t border-line bg-surface px-2 py-1.5 lg:sticky lg:top-[7.75rem] lg:z-20 lg:inset-auto lg:max-h-[calc(100dvh-8.75rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:rounded-xl lg:border lg:px-1.5 lg:py-2"
    >
      {groups.map((g, gi) => (
        <>
          {gi > 0 && <span class="mx-1 h-6 w-px shrink-0 bg-line lg:mx-0 lg:my-1 lg:h-px lg:w-6" aria-hidden="true" />}
          {g.map((b) => {
            const Icon = b.icon;
            const label = b.keys ? `${b.label} (${b.keys})` : b.label;
            return (
              <button
                type="button"
                class="rail-btn"
                aria-label={label}
                aria-pressed={b.active === undefined ? undefined : b.active ? 'true' : 'false'}
                disabled={b.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={b.run}
                onMouseEnter={(e) => showTip(e, label)}
                onMouseLeave={() => setTip(null)}
                onFocus={(e) => showTip(e, label)}
                onBlur={() => setTip(null)}
              >
                <Icon size={18} strokeWidth={2} />
              </button>
            );
          })}
        </>
      ))}
    </div>
    {tip && <span class="rail-tooltip" role="tooltip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>{tip.text}</span>}
    </>
  );
}
