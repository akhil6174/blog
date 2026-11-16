/**
 * Block handle shown beside the block under the pointer: "+" opens the block menu below it,
 * the grip drags the block or opens a menu (move up/down, duplicate, delete).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-preact';
import { blockAt, blockHasContent, deleteBlock, duplicateBlock, insertBelow, moveBlock, startBlockDrag } from './blockOps';

type Props = { editor: Editor; container: HTMLElement | null; onConfirmDelete: (run: () => void) => void };

export default function BlockHandle({ editor, container, onConfirmDelete }: Props) {
  const [pos, setPos] = useState<{ start: number; top: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container) return;
    const view = editor.view;
    const onMove = (e: MouseEvent) => {
      if (menu) return;
      const r = view.dom.getBoundingClientRect();
      const hit = view.posAtCoords({ left: Math.min(Math.max(e.clientX, r.left + 4), r.right - 4), top: e.clientY });
      if (!hit) return;
      const b = blockAt(view.state.doc, hit.inside >= 0 ? hit.inside : hit.pos);
      if (!b) return;
      const dom = view.nodeDOM(b.start);
      if (!(dom instanceof HTMLElement)) return;
      const cr = container.getBoundingClientRect();
      const dr = dom.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(dom).lineHeight) || 28;
      setPos({ start: b.start, top: dr.top - cr.top + Math.min(lh, dr.height) / 2 - 14 });
    };
    const onLeave = (e: MouseEvent) => {
      if (!menu && !container.contains(e.relatedTarget as Node)) setPos(null);
    };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, container, menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    menuRef.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  if (!pos || !editor.isEditable) return null;
  const run = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const doDelete = () => {
    const b = blockAt(editor.state.doc, pos.start);
    if (!b) return;
    if (blockHasContent(b)) onConfirmDelete(() => deleteBlock(editor, pos.start));
    else deleteBlock(editor, pos.start);
  };

  return (
    <div class="block-handle" style={{ top: `${pos.top}px` }} contentEditable={false}>
      <button type="button" class="handle-btn" title="Add a block below" aria-label="Add a block below" onMouseDown={(e) => e.preventDefault()} onClick={() => insertBelow(editor, pos.start)}>
        <Plus size={16} />
      </button>
      <button
        type="button"
        class="handle-btn cursor-grab active:cursor-grabbing"
        title="Drag to move, click for options"
        aria-label="Block options"
        aria-haspopup="menu"
        aria-expanded={menu}
        draggable
        onDragStart={(e) => startBlockDrag(editor.view, pos.start, e as DragEvent)}
        onDragEnd={() => setPos(null)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setMenu((m) => !m)}
      >
        <GripVertical size={16} />
      </button>
      {menu && (
        <div ref={menuRef} role="menu" class="block-menu">
          <button role="menuitem" type="button" onClick={run(() => moveBlock(editor, -1, pos.start))}><ArrowUp size={15} /> Move up <kbd>Alt Shift ↑</kbd></button>
          <button role="menuitem" type="button" onClick={run(() => moveBlock(editor, 1, pos.start))}><ArrowDown size={15} /> Move down <kbd>Alt Shift ↓</kbd></button>
          <button role="menuitem" type="button" onClick={run(() => duplicateBlock(editor, pos.start))}><Copy size={15} /> Duplicate <kbd>Alt Shift D</kbd></button>
          <button role="menuitem" type="button" class="danger" onClick={run(doDelete)}><Trash2 size={15} /> Delete</button>
        </div>
      )}
    </div>
  );
}
