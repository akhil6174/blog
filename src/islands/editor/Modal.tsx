/**
 * Small accessible modal: Escape and backdrop close it, focus moves inside on open and returns on close.
 */
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';

export default function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Layout effect: the Escape listener must exist as soon as the dialog is on screen.
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    if (first) first.focus();
    else ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} class={`outline-none ${`max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 font-sans text-ink shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}`}>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-bold">{title}</h2>
          <button type="button" data-close class="rounded p-1 text-muted hover:bg-page hover:text-ink" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
