import React, { createContext, useCallback, useContext, useMemo, useReducer, useState } from 'react';
import { historyReducer, initialHistoryState } from './historyReducer';
import { ELEMENT_TYPES, createContentItem } from '../data/elementCatalog';
import { createShape, detectRail } from '../data/shapeCatalog';
import { validateTemplate } from '../utils/validation';

const EditorStateContext = createContext(null);

export function EditorProvider({ children }) {
  const [history, dispatch] = useReducer(historyReducer, initialHistoryState);
  // Selection is intentionally NOT part of undo history — selecting things
  // isn't a content edit. `ids` are unified item ids (shape or content,
  // doesn't matter which — look up `kind` on the item itself when it
  // matters). `part` is only ever set for a single selected content item
  // whose title/body sub-part is being styled: { id, key: 'title'|'body' }.
  const [selection, setSelection] = useState({ ids: [], part: null });
  const [saveState, setSaveState] = useState({ status: 'idle', issues: [] }); // idle | saved | blocked

  const template = history.present;

  const commit = useCallback((next) => dispatch({ type: 'COMMIT', next }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  const itemsById = useMemo(() => {
    const map = new Map();
    template.items.forEach((item) => map.set(item.id, item));
    return map;
  }, [template.items]);

  // ---- content item on/off (library panel) ----
  // Content types are toggled as a presence/absence concept — "on" means at
  // least one instance of that type exists. Turning on adds one fresh
  // instance at its catalog default box; turning off removes every
  // instance of that type (blocked entirely for `required` types, same
  // "can't be turned off" rule as before).

  const toggleContentItem = useCallback(
    (type) => {
      const def = ELEMENT_TYPES[type];
      const existing = template.items.filter((i) => i.kind === 'content' && i.type === type);
      if (existing.length > 0) {
        if (def.required) return; // required elements can't be removed entirely
        commit({ ...template, items: template.items.filter((i) => !existing.includes(i)) });
      } else {
        commit({ ...template, items: [...template.items, createContentItem(type)] });
      }
    },
    [template, commit]
  );

  // ---- unified item actions (shape or content) ----

  const updateItem = useCallback(
    (id, patch) => {
      commit({ ...template, items: template.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    },
    [template, commit]
  );

  const updateItems = useCallback(
    (ids, patchFn) => {
      commit({
        ...template,
        items: template.items.map((i) => (ids.includes(i.id) ? { ...i, ...patchFn(i) } : i)),
      });
    },
    [template, commit]
  );

  // Sub-part style (title/body) for block/qr-variant content items — kept
  // nested directly on the item alongside its flat whole-item props
  // (bgColor/borderColor/borderWidth/x/y/width/height/rotation/...).
  const updateItemPart = useCallback(
    (id, part, patch) => {
      commit({
        ...template,
        items: template.items.map((i) =>
          i.id === id ? { ...i, [part]: { ...(i[part] || {}), ...patch } } : i
        ),
      });
    },
    [template, commit]
  );

  // Deletes are blocked per-item, not per-call: a locked item never goes,
  // and a required content type can't be deleted down to zero instances
  // (deleting one of several duplicates of a required type is fine).
  const canDeleteItem = useCallback(
    (id, remainingItems) => {
      const item = itemsById.get(id);
      if (!item) return false;
      if (item.locked) return false;
      if (item.kind === 'content' && ELEMENT_TYPES[item.type]?.required) {
        const stillPresent = remainingItems.some((i) => i.kind === 'content' && i.type === item.type);
        if (!stillPresent) return false;
      }
      return true;
    },
    [itemsById]
  );

  const deleteItems = useCallback(
    (ids) => {
      const remaining = template.items.filter((i) => !ids.includes(i.id));
      const toDelete = ids.filter((id) => canDeleteItem(id, remaining));
      if (toDelete.length === 0) return;
      commit({ ...template, items: template.items.filter((i) => !toDelete.includes(i.id)) });
      setSelection({ ids: [], part: null });
    },
    [template, commit, canDeleteItem]
  );

  const duplicateItems = useCallback(
    (ids) => {
      const source = template.items.filter((i) => ids.includes(i.id) && !i.locked);
      if (source.length === 0) return;
      const copies = source.map((i) => ({
        ...i,
        id: `${i.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: i.x + 16,
        y: i.y + 16,
      }));
      commit({ ...template, items: [...template.items, ...copies] });
      setSelection({ ids: copies.map((c) => c.id), part: null });
    },
    [template, commit]
  );

  // Pasting an item copied earlier (this session or from another template) —
  // always adds a fresh instance offset slightly so it's visible rather
  // than stacked exactly on the original; works the same for a shape or a
  // content item.
  const addItemFromClipboard = useCallback(
    (itemData) => {
      const pasted = {
        ...itemData,
        id: `${itemData.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: itemData.x + 16,
        y: itemData.y + 16,
      };
      commit({ ...template, items: [...template.items, pasted] });
      setSelection({ ids: [pasted.id], part: null });
    },
    [template, commit]
  );

  // ---- shape creation ----

  const addShape = useCallback(
    (type) => {
      const shape = createShape(type);
      commit({ ...template, items: [...template.items, shape] });
      setSelection({ ids: [shape.id], part: null });
    },
    [template, commit]
  );

  const groupItems = useCallback(
    (ids) => {
      if (ids.length < 2) return;
      const groupId = `group-${Date.now()}`;
      commit({ ...template, groups: { ...template.groups, [groupId]: ids } });
    },
    [template, commit]
  );

  const ungroupItems = useCallback(
    (groupId) => {
      const groups = { ...template.groups };
      delete groups[groupId];
      commit({ ...template, groups });
    },
    [template, commit]
  );

  // rails: recompute which shapes currently act as edge rails, and by how
  // much they'd inset the page's safe area on each side (used by
  // validation only now — there's no flow container left to actually pad).
  const railInsets = useMemo(() => {
    const insets = { top: 0, bottom: 0, left: 0, right: 0 };
    template.items.forEach((item) => {
      if (item.kind !== 'shape') return;
      const rail = detectRail(item, template.page);
      if (rail) insets[rail.edge] = Math.max(insets[rail.edge], rail.thickness);
    });
    return insets;
  }, [template.items, template.page]);

  const runSave = useCallback(() => {
    const issues = validateTemplate(template, railInsets);
    const hasErrors = issues.some((i) => i.level === 'error');
    setSaveState({ status: hasErrors ? 'blocked' : 'saved', issues });
    return !hasErrors;
  }, [template, railInsets]);

  const value = {
    template,
    itemsById,
    railInsets,
    saveState,
    runSave,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    selection,
    setSelection,
    toggleContentItem,
    updateItem,
    updateItems,
    updateItemPart,
    deleteItems,
    duplicateItems,
    addItemFromClipboard,
    addShape,
    groupItems,
    ungroupItems,
  };

  return <EditorStateContext.Provider value={value}>{children}</EditorStateContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorStateContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
