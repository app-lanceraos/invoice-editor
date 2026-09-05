import { useEffect } from 'react';
import { useEditor } from '../state/EditorContext';
import { copyToClipboard, readClipboard } from '../state/clipboard';

export function useKeyboardShortcuts({ onPreviewToggle } = {}) {
  const {
    template, selection, setSelection,
    undo, redo, runSave,
    deleteItems, deleteBlockLine, duplicateItems, groupItems,
    addItemsFromClipboard,
  } = useEditor();

  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't hijack typing in property fields

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); runSave(); return; }

      // Prompt 17 item 2: select every canvas item — content AND shapes,
      // the unified template.items model from Prompt 3 — and, critically,
      // preventDefault so the browser's own "select all text on the page"
      // never fires alongside it (that native behavior firing unopposed
      // was the actual bug; there was no prior select-all of any kind to
      // widen — Prompt 2 predates the unified item model entirely).
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection({ ids: template.items.map((i) => i.id), part: null });
        return;
      }

      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (selection.ids.length >= 2) groupItems(selection.ids);
        return;
      }

      // Prompt 23 item 3: gated the same way the Toolbar button and
      // ContextMenu item already are — "at least one shape in the
      // selection" (duplicateItems itself would silently no-op on a
      // content-only selection anyway, but every SURFACE that offers
      // Duplicate should agree on when it's actually available, not just
      // the underlying data-layer guard).
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const canDuplicate = selection.ids.some((id) => {
          const item = template.items.find((i) => i.id === id);
          return item && item.kind === 'shape' && !item.locked;
        });
        if (canDuplicate) duplicateItems(selection.ids);
        return;
      }

      // Prompt 21 item 2: content items are single-instance and never go
      // to the clipboard at all — copying a mixed shape+content
      // selection copies just the shape(s); a pure-content selection
      // copies nothing (and leaves whatever was already on the
      // clipboard untouched, rather than clobbering it with an empty
      // payload).
      if (mod && e.key.toLowerCase() === 'c') {
        if (selection.ids.length > 0) {
          const items = template.items.filter((i) => selection.ids.includes(i.id) && i.kind === 'shape');
          if (items.length > 0) copyToClipboard({ items });
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'v') {
        const clip = readClipboard();
        if (clip?.items?.length) addItemsFromClipboard(clip.items);
        return;
      }

      if (!mod && e.key.toLowerCase() === 'p') { e.preventDefault(); onPreviewToggle?.(); return; }

      if (e.key === 'Escape') { setSelection({ ids: [], part: null }); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.part && selection.ids.length === 1) {
          deleteBlockLine(selection.ids[0], selection.part.key);
        } else if (selection.ids.length > 0) {
          deleteItems(selection.ids);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [template, selection, undo, redo, runSave, deleteItems, deleteBlockLine, duplicateItems, groupItems, setSelection, addItemsFromClipboard, onPreviewToggle]);
}
