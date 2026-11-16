/**
 * Top-level block operations for the editor: find, move, duplicate, delete, drag.
 * Written directly on ProseMirror so we do not need the drag-handle extension (it bundles Yjs).
 */
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export type Block = { index: number; start: number; end: number; node: PMNode };

/** The top-level block containing document position `pos`. */
export function blockAt(doc: PMNode, pos: number): Block | null {
  if (doc.childCount === 0) return null;
  const p = Math.max(0, Math.min(pos, doc.content.size));
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    const end = offset + node.nodeSize;
    if (p < end || i === doc.childCount - 1) return { index: i, start: offset, end, node };
    offset = end;
  }
  return null;
}

export function currentBlock(editor: Editor): Block | null {
  return blockAt(editor.state.doc, editor.state.selection.from);
}

function cursorNear(tr: Transaction, pos: number): Transaction {
  const p = Math.max(0, Math.min(pos + 1, tr.doc.content.size));
  return tr.setSelection(TextSelection.near(tr.doc.resolve(p)));
}

export function moveBlock(editor: Editor, dir: -1 | 1, at?: number): boolean {
  const { state, view } = editor;
  const b = at === undefined ? currentBlock(editor) : blockAt(state.doc, at);
  if (!b) return false;
  if (dir < 0 && b.index === 0) return false;
  if (dir > 0 && b.index === state.doc.childCount - 1) return false;
  const tr = state.tr;
  let target: number;
  if (dir < 0) {
    target = b.start - state.doc.child(b.index - 1).nodeSize;
    tr.delete(b.start, b.end).insert(target, b.node);
  } else {
    const next = state.doc.child(b.index + 1);
    tr.delete(b.start, b.end);
    target = b.start + next.nodeSize;
    tr.insert(target, b.node);
  }
  view.dispatch(cursorNear(tr, target).scrollIntoView());
  view.focus();
  return true;
}

export function duplicateBlock(editor: Editor, at?: number): boolean {
  const { state, view } = editor;
  const b = at === undefined ? currentBlock(editor) : blockAt(state.doc, at);
  if (!b) return false;
  const tr = state.tr.insert(b.end, b.node.copy(b.node.content));
  view.dispatch(cursorNear(tr, b.end).scrollIntoView());
  view.focus();
  return true;
}

export function deleteBlock(editor: Editor, at?: number): boolean {
  const { state, view } = editor;
  const b = at === undefined ? currentBlock(editor) : blockAt(state.doc, at);
  if (!b) return false;
  const tr = state.tr;
  if (state.doc.childCount === 1) tr.replaceWith(0, state.doc.content.size, state.schema.nodes.paragraph.create());
  else tr.delete(b.start, b.end);
  view.dispatch(cursorNear(tr, Math.max(0, b.start - 1)).scrollIntoView());
  view.focus();
  return true;
}

/** Insert an empty paragraph after a block and type "/" to open the block menu. */
export function insertBelow(editor: Editor, at?: number): void {
  const { state, view } = editor;
  const b = at === undefined ? currentBlock(editor) : blockAt(state.doc, at);
  const pos = b ? b.end : state.doc.content.size;
  const tr = state.tr.insert(pos, state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  editor.commands.insertContent('/');
}

export function blockHasContent(b: Block): boolean {
  return b.node.textContent.trim().length > 0 || b.node.isAtom || b.node.type.name === 'table';
}

/** Begin a native drag of a whole block; ProseMirror's own drop handling moves it. */
export function startBlockDrag(view: EditorView, at: number, e: DragEvent): void {
  const b = blockAt(view.state.doc, at);
  if (!b || !e.dataTransfer) return;
  const sel = NodeSelection.create(view.state.doc, b.start);
  view.dispatch(view.state.tr.setSelection(sel));
  (view as unknown as { dragging: { slice: unknown; move: boolean } | null }).dragging = { slice: sel.content(), move: true };
  e.dataTransfer.clearData();
  e.dataTransfer.setData('text/plain', b.node.textContent || ' ');
  e.dataTransfer.effectAllowed = 'copyMove';
  const dom = view.nodeDOM(b.start);
  if (dom instanceof HTMLElement) e.dataTransfer.setDragImage(dom, 0, 0);
}

export function countHeadings(doc: PMNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === 'heading') n++;
    return node.type.name !== 'table';
  });
  return n;
}
