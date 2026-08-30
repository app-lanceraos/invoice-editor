import { useEffect } from 'react';
import { useEditor } from '../state/EditorContext';
import { copyToClipboard, readClipboard } from '../state/clipboard';
import { ELEMENT_TYPES } from '../data/elementCatalog';

export function useKeyboardShortcuts({ onPreviewToggle } = {}) {
  const {
    template, selection, setSelection,
    undo, redo, runSave,
    deleteShapes, duplicateShapes, groupShapes, ungroup,
    bulkDeleteOptionalElements, updateElementStyle,
    addShapeFromClipboard, // see note below
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
        if (selection.type === 'shape' && selection.ids.length >= 2) groupShapes(selection.ids);
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selection.type === 'shape') duplicateShapes(selection.ids);
        return;
      }

      if (mod && e.key.toLowerCase() === 'c') {
        if (selection.type === 'shape' && selection.ids.length === 1) {
          const shape = template.shapes.find((s) => s.id === selection.ids[0]);
          if (shape) copyToClipboard({ kind: 'shape', data: shape });
        } else if (selection.type === 'content' && selection.ids.length === 1) {
          const type = selection.ids[0];
          copyToClipboard({ kind: 'content', elementType: type, style: template.elementStyles[type] || {} });
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'v') {
        const clip = readClipboard();
        if (!clip) return;
        if (clip.kind === 'shape') {
          addShapeFromClipboard(clip.data); // shapes: no uniqueness rule, paste = new instance
        } else if (clip.kind === 'content') {
          // content elements: no duplicate types allowed — pasting re-styles
          // the existing instance instead of blocking or duplicating it.
          updateElementStyle(clip.elementType, clip.style);
        }
        return;
      }

      if (e.key === 'Escape') { setSelection({ type: null, ids: [] }); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.type === 'shape') deleteShapes(selection.ids);
        if (selection.type === 'content') bulkDeleteOptionalElements(selection.ids);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [template, selection, undo, redo, runSave, deleteShapes, duplicateShapes, groupShapes, ungroup, bulkDeleteOptionalElements, updateElementStyle, setSelection, addShapeFromClipboard]);
}
