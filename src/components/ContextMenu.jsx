import React, { useEffect } from 'react';
import { useEditor } from '../state/EditorContext';
import { copyToClipboard } from '../state/clipboard';
import { copyFormatting, readFormatting, captureFormatting, formattingPatch } from '../state/formatting';

// A single item's own available actions, independent of what else is
// selected — the menu shown for a multi-selection is the genuine
// intersection of these across every selected item (Prompt 15), not a
// separate hardcoded "multi-select menu".
function itemCapabilities(item) {
  const caps = new Set();
  if (item.locked) return caps; // the footer: selectable, but no destructive/structural actions
  caps.add('duplicate');
  caps.add('delete');
  if (item.kind === 'content' || item.type === 'roundedRect') caps.add('reset-radius');
  return caps;
}

export default function ContextMenu() {
  const {
    template, selection, setSelection, contextMenu, setContextMenu,
    duplicateItems, deleteItems, updateItems, updateItemPart, groupItems,
  } = useEditor();

  const close = () => setContextMenu(null);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.('.context-menu')) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu]);

  if (!contextMenu) return null;

  const selectedItems = template.items.filter((i) => selection.ids.includes(i.id));
  if (selectedItems.length === 0) return null;

  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  const part = selection.part;
  const formatClip = readFormatting();

  // Genuine intersection, not a hardcoded multi-select list: only an
  // action every selected item actually supports shows up.
  const commonCaps = selectedItems.map(itemCapabilities).reduce((a, b) => new Set([...a].filter((x) => b.has(x))));

  const canGroup = selectedItems.length >= 2 && selectedItems.every((i) => !i.locked);
  const canCopy = !!single && !part; // matches the existing Cmd+C shortcut's own single-whole-item scope
  const canCopyFormatting = !!single;
  const canPasteFormatting = !!formatClip && selectedItems.length > 0;
  const canSelectWholeContainer = !!single && !!part;

  const actions = [];
  if (canSelectWholeContainer) {
    actions.push({
      key: 'select-whole',
      label: 'Select whole container',
      run: () => setSelection({ ids: [single.id], part: null }),
    });
  }
  if (commonCaps.has('duplicate')) {
    actions.push({ key: 'duplicate', label: 'Duplicate', run: () => duplicateItems(selection.ids) });
  }
  if (canCopy) {
    actions.push({ key: 'copy', label: 'Copy', run: () => copyToClipboard({ item: single }) });
  }
  if (canCopyFormatting) {
    actions.push({
      key: 'copy-formatting',
      label: part ? 'Copy formatting (part)' : 'Copy formatting',
      run: () => copyFormatting(captureFormatting(single, part?.key)),
    });
  }
  if (canPasteFormatting) {
    actions.push({
      key: 'paste-formatting',
      label: 'Paste formatting',
      run: () => {
        if (part && single) {
          updateItemPart(single.id, part.key, formattingPatch(formatClip, single, part.key));
        } else {
          updateItems(selection.ids, (item) => formattingPatch(formatClip, item, null));
        }
      },
    });
  }
  if (commonCaps.has('reset-radius')) {
    actions.push({
      key: 'reset-radius',
      label: 'Reset border radius',
      run: () => updateItems(selection.ids, (item) => (item.kind === 'shape' ? { radius: 0 } : { cornerRadius: 0 })),
    });
  }
  if (canGroup) {
    actions.push({ key: 'group', label: 'Group', run: () => groupItems(selection.ids) });
  }
  if (commonCaps.has('delete')) {
    actions.push({ key: 'delete', label: 'Delete', run: () => deleteItems(selection.ids) });
  }

  if (actions.length === 0) return null;

  return (
    <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
      {actions.map((a) => (
        <button
          key={a.key}
          className="context-menu__item"
          onClick={() => {
            a.run();
            close();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
