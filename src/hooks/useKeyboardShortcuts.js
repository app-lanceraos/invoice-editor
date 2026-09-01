import { useEffect } from 'react';
import { useEditor } from '../state/EditorContext';
import { copyToClipboard, readClipboard } from '../state/clipboard';

export function useKeyboardShortcuts({ onPreviewToggle } = {}) {
  const {
    template, selection, setSelection,
    undo, redo, runSave,
    deleteItems, deleteBlockLine, duplicateItems, groupItems,
    addItemFromClipboard,
  } = useEditor();

  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't hijack typing in property fields

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); runSave(); return; }

      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (selection.ids.length >= 2) groupItems(selection.ids);
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selection.ids.length > 0) duplicateItems(selection.ids);
        return;
      }

      if (mod && e.key.toLowerCase() === 'c') {
        if (selection.ids.length === 1) {
          const item = template.items.find((i) => i.id === selection.ids[0]);
          if (item) copyToClipboard({ item });
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'v') {
        const clip = readClipboard();
        if (clip?.item) addItemFromClipboard(clip.item);
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
  }, [template, selection, undo, redo, runSave, deleteItems, deleteBlockLine, duplicateItems, groupItems, setSelection, addItemFromClipboard, onPreviewToggle]);
}
