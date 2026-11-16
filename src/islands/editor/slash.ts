/**
 * Slash command: typing "/" opens a filterable block menu. Rendered with plain DOM (no React portal),
 * positioned under the caret, fully keyboard driven (↑ ↓ Enter Esc).
 */
import { Extension, type Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

export type SlashItem = { title: string; hint: string; keywords: string; group: string; run: (editor: Editor) => void };

export function SlashCommand(getItems: () => SlashItem[]) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: '/',
          pluginKey: new PluginKey('slashCommand'),
          allowSpaces: false,
          startOfLine: false,
          allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== 'codeBlock',
          items: ({ query }) => {
            const q = query.toLowerCase();
            return getItems().filter((i) => `${i.title} ${i.keywords}`.toLowerCase().includes(q)).slice(0, 14);
          },
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            props.run(editor);
          },
          render: () => {
            let el: HTMLDivElement | null = null;
            let items: SlashItem[] = [];
            let selected = 0;
            let pick: (i: SlashItem) => void = () => {};

            /** Rebuild the list only when the items change; hover and arrows just move the highlight (no DOM churn). */
            const highlight = () => {
              if (!el) return;
              el.querySelectorAll<HTMLElement>('.slash-item').forEach((b, idx) => {
                const on = idx === selected;
                b.classList.toggle('is-selected', on);
                b.setAttribute('aria-selected', String(on));
                if (on) b.scrollIntoView({ block: 'nearest' });
              });
            };
            const draw = () => {
              if (!el) return;
              el.replaceChildren();
              if (items.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'slash-empty';
                empty.textContent = 'No matching blocks';
                el.appendChild(empty);
                return;
              }
              let group = '';
              items.forEach((item, idx) => {
                if (item.group !== group) {
                  group = item.group;
                  const g = document.createElement('p');
                  g.className = 'slash-group';
                  g.textContent = group;
                  el!.appendChild(g);
                }
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'slash-item';
                b.setAttribute('role', 'option');
                b.dataset.index = String(idx);
                const t = document.createElement('span');
                t.className = 'slash-title';
                t.textContent = item.title;
                const h = document.createElement('span');
                h.className = 'slash-hint';
                h.textContent = item.hint;
                b.append(t, h);
                b.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  pick(item);
                });
                b.addEventListener('mousemove', () => {
                  if (selected !== idx) {
                    selected = idx;
                    highlight();
                  }
                });
                el!.appendChild(b);
              });
              highlight();
            };

            const place = (rect: DOMRect | null | undefined) => {
              if (!el || !rect) return;
              const h = el.offsetHeight || 320;
              const below = rect.bottom + 6;
              const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below;
              el.style.top = `${top}px`;
              el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
            };

            return {
              onStart: (props) => {
                items = props.items;
                selected = 0;
                pick = (i) => props.command(i);
                el = document.createElement('div');
                el.className = 'slash-menu';
                el.setAttribute('role', 'listbox');
                el.setAttribute('aria-label', 'Insert block');
                document.body.appendChild(el);
                draw();
                place(props.clientRect?.());
              },
              onUpdate: (props) => {
                items = props.items;
                selected = Math.min(selected, Math.max(0, items.length - 1));
                pick = (i) => props.command(i);
                draw();
                place(props.clientRect?.());
              },
              onKeyDown: ({ event }) => {
                if (!el) return false;
                if (event.key === 'ArrowDown') {
                  selected = (selected + 1) % Math.max(1, items.length);
                  highlight();
                  return true;
                }
                if (event.key === 'ArrowUp') {
                  selected = (selected - 1 + items.length) % Math.max(1, items.length);
                  highlight();
                  return true;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  if (items[selected]) pick(items[selected]);
                  return true;
                }
                if (event.key === 'Escape') {
                  el.remove();
                  el = null;
                  return true;
                }
                return false;
              },
              onExit: () => {
                el?.remove();
                el = null;
              },
            };
          },
        }),
      ];
    },
  });
}
