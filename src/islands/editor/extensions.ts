/**
 * The editor's extension set. Must stay in sync with src/lib/render-doc.ts (what the server renders).
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { createLowlight, common } from 'lowlight';
import { SlashCommand, type SlashItem } from './slash';
import { duplicateBlock, moveBlock } from './blockOps';

export const lowlight = createLowlight(common);

export type EditorCallbacks = {
  saveNow: () => void;
  openLink: () => void;
  toggleFocus: () => void;
  togglePreview: () => void;
  confirmDeleteBlock: () => void;
};

export function buildExtensions(cb: { current: EditorCallbacks }, slashItems: () => SlashItem[]) {
  const Shortcuts = Extension.create({
    name: 'trutiaiShortcuts',
    addKeyboardShortcuts() {
      const ed = () => this.editor as Editor;
      return {
        'Mod-s': () => (cb.current.saveNow(), true),
        'Mod-k': () => (cb.current.openLink(), true),
        'Mod-.': () => (cb.current.toggleFocus(), true),
        'Mod-Alt-p': () => (cb.current.togglePreview(), true),
        'Alt-Shift-ArrowUp': () => moveBlock(ed(), -1),
        'Alt-Shift-ArrowDown': () => moveBlock(ed(), 1),
        'Alt-Shift-d': () => duplicateBlock(ed()),
        'Alt-Shift-Backspace': () => (cb.current.confirmDeleteBlock(), true),
      };
    },
  });

  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'ugc nofollow noopener', target: '_blank' } },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Highlight,
    Image.configure({ allowBase64: false }),
    Youtube.configure({ nocookie: true, width: 680, height: 383 }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      includeChildren: false,
      showOnlyCurrent: true,
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return node.attrs.level === 2 ? 'Heading' : node.attrs.level === 3 ? 'Subheading' : 'Minor heading';
        if (node.type.name === 'codeBlock') return 'Code';
        return "Write, or press '/' for blocks";
      },
    }),
    CharacterCount,
    SlashCommand(slashItems),
    Shortcuts,
  ];
}
