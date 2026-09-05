import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState } from 'react';
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
  // Transient, not history: which page edge(s) an in-progress drag/resize
  // is currently touching, for the edge-contact highlight. null when idle.
  const [edgeHighlight, setEdgeHighlight] = useState(null);
  // Transient, not history: smart alignment guides + live distance labels
  // + equal-spacing markers for an in-progress drag/resize (Prompt 6/14,
  // rebuilt Prompt 19 — see geometry.js's resolveAxisSnap/
  // detectEqualSpacing, driven by CanvasItem) — { vertical, horizontal,
  // labels, spacing } | null. Separate from edgeHighlight since guides
  // are item-to-item/page-center, not page-boundary.
  const [guides, setGuides] = useState(null);
  // Transient, not history: a text-bearing item's actual rendered size,
  // when it's larger than its own stored width/height (Prompt 14) — a
  // manually-set size is a MINIMUM for text, not a hard cap (see
  // CanvasItem.jsx's measurement hook), so this is what collision
  // detection reads instead of the raw stored size, keeping "no overlap"
  // true for what's actually on screen rather than the stale box a user
  // once dragged. Written by each CanvasItem instance as it measures its
  // own content (not by the item being dragged — every OTHER item's entry
  // is what a move/resize gesture reads). Keyed by item id; an item with
  // no entry (never measured, or not a growing variant) just falls back
  // to its own stored width/height at the read site.
  const [effectiveSizes, setEffectiveSizes] = useState({});
  const setEffectiveSize = useCallback((id, size) => {
    setEffectiveSizes((prev) => {
      const existing = prev[id];
      if (existing && existing.width === size.width && existing.height === size.height) return prev;
      return { ...prev, [id]: size };
    });
  }, []);
  // Transient, not history: live preview positions for items being
  // cascade-pushed by ANOTHER item's in-progress move/resize/align gesture
  // (Prompt 16) — { [id]: { x, y } }, recomputed fresh every frame from the
  // gesture's own start snapshot (never accumulated), so a pushed item's
  // own CanvasItem instance can render the shove in real time even though
  // it isn't the one being dragged. Cleared back to {} on gesture end,
  // right when the real positions get committed via updateItems.
  const [pushPreview, setPushPreview] = useState({});
  // Transient, not history: the right-click context menu (Prompt 15) —
  // { x, y } screen position, or null when closed. Deliberately just a
  // position: which actions it shows is derived fresh from whatever
  // `selection` holds at render time (right-clicking updates selection
  // first — see CanvasItem's onContextMenu — so the two never disagree).
  const [contextMenu, setContextMenu] = useState(null);
  // Prompt 22: canvas zoom is a VIEW preference, not saved document data —
  // deliberately its own plain useState, never touching `template`/
  // history, so zooming in and out is never an undo-able action and never
  // changes a single stored x/y/width/height. A percentage, clamped to a
  // sensible [25,200] range; every mouse-driven gesture divides its own
  // raw screen-pixel delta by `zoom/100` before touching page-unit data
  // (see CanvasItem.jsx/GroupSelectionOverlay.jsx/CanvasLayer.jsx).
  const [zoom, setZoomRaw] = useState(100);
  const setZoom = useCallback((value) => {
    setZoomRaw(Math.min(200, Math.max(25, Math.round(value))));
  }, []);
  // The live `.canvas-scroll` DOM node, shared via ref rather than state
  // (its dimensions/scroll position are read imperatively, on demand, by
  // EditorCanvas's own wheel-zoom handler and by Toolbar's "Fit to
  // screen" — neither needs to re-render when the OTHER touches it).
  const canvasViewportRef = useRef(null);
  // Prompt 23 item 1: whether each sidebar is collapsed — a VIEW
  // preference, same category as `zoom` above, not `template` data:
  // collapsing a panel is never an undo-able action and never touches a
  // single stored item field, so it's a plain useState independent of
  // history/commit, same reasoning as zoom's own comment.
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const toggleLeftPanel = useCallback(() => setLeftPanelCollapsed((v) => !v), []);
  const toggleRightPanel = useCallback(() => setRightPanelCollapsed((v) => !v), []);

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

  // Removes one optional line from a block-variant item's rendered body
  // (title is never a removable line) — blocked the same way deleteItems
  // blocks a required top-level item, just at line granularity. The
  // item's currently-hidden lines are tracked as a plain list on the
  // item itself, alongside its other flat props.
  const deleteBlockLine = useCallback(
    (itemId, lineKey) => {
      if (lineKey === 'title') return;
      const item = itemsById.get(itemId);
      if (!item || item.kind !== 'content') return;
      const def = ELEMENT_TYPES[item.type];
      if (def.variant !== 'block') return;
      const line = def.render().lines.find((l) => l.key === lineKey);
      if (!line || line.required) return;
      if ((item.hiddenLines || []).includes(lineKey)) return;
      const hiddenLines = [...(item.hiddenLines || []), lineKey];
      commit({ ...template, items: template.items.map((i) => (i.id === itemId ? { ...i, hiddenLines } : i)) });
      setSelection({ ids: [itemId], part: null });
    },
    [template, commit, itemsById]
  );

  // Prompt 21 item 2: content items are single-instance, full stop — a
  // content item is silently excluded from duplication (never an error,
  // never a partial/confusing duplicate of just its "container") rather
  // than blocking the whole gesture, so duplicating a mixed shape+
  // content selection still duplicates the shape(s) in it. Shapes are
  // completely unaffected — this only ever narrows `source`, and only
  // when a content item is present.
  const duplicateItems = useCallback(
    (ids) => {
      const source = template.items.filter((i) => ids.includes(i.id) && !i.locked && i.kind === 'shape');
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

  // Pasting whatever was copied earlier (this session or from another
  // template) — always adds fresh instances offset slightly so they're
  // visible rather than stacked exactly on the originals. `itemsData` is
  // always an array (see clipboard.js) — a single copied item is just a
  // one-element array, and a multi-item copy pastes the WHOLE group in
  // one commit, each item getting the exact same offset so their
  // relative positions to each other are preserved (Prompt 16 item 6)
  // rather than every pasted item landing stacked on the same spot.
  // Prompt 21 item 2: content items are single-instance — filtered out
  // here too (not just at copy time), a defensive second gate since a
  // clipboard entry could be stale (copied before this rule existed, or
  // from another tab/session via the shared localStorage clipboard).
  const addItemsFromClipboard = useCallback(
    (itemsData) => {
      const shapesOnly = (itemsData || []).filter((d) => d.kind === 'shape');
      if (shapesOnly.length === 0) return;
      const stamp = Date.now();
      const pasted = shapesOnly.map((itemData, i) => ({
        ...itemData,
        id: `${itemData.kind}-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        x: itemData.x + 16,
        y: itemData.y + 16,
      }));
      commit({ ...template, items: [...template.items, ...pasted] });
      setSelection({ ids: pasted.map((p) => p.id), part: null });
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

  // Page background is a per-template value (not the global --page-bg
  // token), so different templates can each have their own page color.
  const updatePageBackground = useCallback(
    (color) => {
      commit({ ...template, page: { ...template.page, backgroundColor: color } });
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
    edgeHighlight,
    setEdgeHighlight,
    guides,
    setGuides,
    effectiveSizes,
    setEffectiveSize,
    pushPreview,
    setPushPreview,
    contextMenu,
    setContextMenu,
    zoom,
    setZoom,
    canvasViewportRef,
    leftPanelCollapsed,
    toggleLeftPanel,
    rightPanelCollapsed,
    toggleRightPanel,
    toggleContentItem,
    updateItem,
    updateItems,
    updateItemPart,
    deleteItems,
    deleteBlockLine,
    duplicateItems,
    addItemsFromClipboard,
    addShape,
    groupItems,
    ungroupItems,
    updatePageBackground,
  };

  return <EditorStateContext.Provider value={value}>{children}</EditorStateContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorStateContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
