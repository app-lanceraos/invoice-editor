import React, { createContext, useCallback, useContext, useMemo, useReducer, useState } from 'react';
import { historyReducer, initialHistoryState } from './historyReducer';
import { ELEMENT_TYPES } from '../data/elementCatalog';
import { createShape, detectRail } from '../data/shapeCatalog';
import { validateTemplate } from '../utils/validation';

const EditorStateContext = createContext(null);

export function EditorProvider({ children }) {
  const [history, dispatch] = useReducer(historyReducer, initialHistoryState);
  // Selection is intentionally NOT part of undo history — selecting things
  // isn't a content edit.
  const [selection, setSelection] = useState({ type: null, ids: [] }); // type: 'shape' | 'content' | 'mixed'
  const [saveState, setSaveState] = useState({ status: 'idle', issues: [] }); // idle | saved | blocked

  const template = history.present;

  const commit = useCallback((next) => dispatch({ type: 'COMMIT', next }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  // ---- content element actions ----

  const toggleElement = useCallback(
    (type) => {
      const def = ELEMENT_TYPES[type];
      if (def.required) return; // required elements can't be turned off
      const region = def.region;
      const slots = { ...template.slots };
      const current = slots[region] || [];
      const isOn = current.includes(type);
      slots[region] = isOn ? current.filter((t) => t !== type) : [...current, type];
      commit({ ...template, slots });
    },
    [template, commit]
  );

  const reorderInSlot = useCallback(
    (region, fromIndex, toIndex) => {
      const list = [...(template.slots[region] || [])];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      commit({ ...template, slots: { ...template.slots, [region]: list } });
    },
    [template, commit]
  );

  const moveElementToRegion = useCallback(
    (type, fromRegion, toRegion, toIndex) => {
      const fromList = (template.slots[fromRegion] || []).filter((t) => t !== type);
      const toList = [...(template.slots[toRegion] || [])];
      toList.splice(toIndex, 0, type);
      commit({
        ...template,
        slots: { ...template.slots, [fromRegion]: fromList, [toRegion]: toList },
      });
    },
    [template, commit]
  );

  const updateElementStyle = useCallback(
    (type, patch) => {
      commit({
        ...template,
        elementStyles: {
          ...template.elementStyles,
          [type]: { ...(template.elementStyles[type] || {}), ...patch },
        },
      });
    },
    [template, commit]
  );

  // Sub-part style (title/body) for block-variant elements — kept nested
  // under elementStyles[type][part] alongside the flat whole-element props
  // (bgColor/borderColor/borderWidth/rotation/width/height).
  const updateElementPartStyle = useCallback(
    (type, part, patch) => {
      const current = template.elementStyles[type] || {};
      commit({
        ...template,
        elementStyles: {
          ...template.elementStyles,
          [type]: {
            ...current,
            [part]: { ...(current[part] || {}), ...patch },
          },
        },
      });
    },
    [template, commit]
  );

  // bulk style/visibility/delete for multi-selected content elements
  const bulkUpdateElements = useCallback(
    (types, patch) => {
      const elementStyles = { ...template.elementStyles };
      types.forEach((type) => {
        elementStyles[type] = { ...(elementStyles[type] || {}), ...patch };
      });
      commit({ ...template, elementStyles });
    },
    [template, commit]
  );

  const bulkDeleteOptionalElements = useCallback(
    (types) => {
      const slots = { ...template.slots };
      Object.keys(slots).forEach((region) => {
        slots[region] = slots[region].filter(
          (t) => !(types.includes(t) && !ELEMENT_TYPES[t].required)
        );
      });
      commit({ ...template, slots });
    },
    [template, commit]
  );

  // ---- shape actions ----

  const addShape = useCallback(
    (type) => {
      const shape = createShape(type);
      commit({ ...template, shapes: [...template.shapes, shape] });
      setSelection({ type: 'shape', ids: [shape.id] });
    },
    [template, commit]
  );

  const updateShape = useCallback(
    (id, patch) => {
      const shapes = template.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s));
      commit({ ...template, shapes });
    },
    [template, commit]
  );

  const updateShapes = useCallback(
    (ids, patchFn) => {
      const shapes = template.shapes.map((s) => (ids.includes(s.id) ? { ...s, ...patchFn(s) } : s));
      commit({ ...template, shapes });
    },
    [template, commit]
  );

  const deleteShapes = useCallback(
    (ids) => {
      commit({ ...template, shapes: template.shapes.filter((s) => !ids.includes(s.id)) });
      setSelection({ type: null, ids: [] });
    },
    [template, commit]
  );

  const duplicateShapes = useCallback(
    (ids) => {
      const copies = template.shapes
        .filter((s) => ids.includes(s.id))
        .map((s) => ({
          ...s,
          id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          x: s.x + 16,
          y: s.y + 16,
        }));
      commit({ ...template, shapes: [...template.shapes, ...copies] });
      setSelection({ type: 'shape', ids: copies.map((c) => c.id) });
    },
    [template, commit]
  );

  // Pasting a shape copied from another template (or earlier in this one) —
  // shapes have no identity/uniqueness rule, so this always adds a fresh
  // instance, offset slightly so it's visible rather than stacked exactly
  // on top of the original.
  const addShapeFromClipboard = useCallback(
    (shapeData) => {
      const pasted = {
        ...shapeData,
        id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: shapeData.x + 16,
        y: shapeData.y + 16,
      };
      commit({ ...template, shapes: [...template.shapes, pasted] });
      setSelection({ type: 'shape', ids: [pasted.id] });
    },
    [template, commit]
  );

  const groupShapes = useCallback(
    (ids) => {
      if (ids.length < 2) return;
      const groupId = `group-${Date.now()}`;
      commit({ ...template, groups: { ...template.groups, [groupId]: ids } });
    },
    [template, commit]
  );

  const ungroup = useCallback(
    (groupId) => {
      const groups = { ...template.groups };
      delete groups[groupId];
      commit({ ...template, groups });
    },
    [template, commit]
  );

  // rails: recompute which shapes currently act as edge rails, and by how
  // much they should inset the content-safe area on each side.
  const railInsets = useMemo(() => {
    const insets = { top: 0, bottom: 0, left: 0, right: 0 };
    template.shapes.forEach((shape) => {
      const rail = detectRail(shape, template.page);
      if (rail) insets[rail.edge] = Math.max(insets[rail.edge], rail.thickness);
    });
    return insets;
  }, [template.shapes, template.page]);

  const runSave = useCallback(() => {
    const issues = validateTemplate(template, railInsets);
    const hasErrors = issues.some((i) => i.level === 'error');
    setSaveState({ status: hasErrors ? 'blocked' : 'saved', issues });
    return !hasErrors;
  }, [template, railInsets]);

  const value = {
    template,
    railInsets,
    saveState,
    runSave,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    selection,
    setSelection,
    toggleElement,
    reorderInSlot,
    moveElementToRegion,
    updateElementStyle,
    updateElementPartStyle,
    bulkUpdateElements,
    bulkDeleteOptionalElements,
    addShape,
    addShapeFromClipboard,
    updateShape,
    updateShapes,
    deleteShapes,
    duplicateShapes,
    groupShapes,
    ungroup,
  };

  return <EditorStateContext.Provider value={value}>{children}</EditorStateContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorStateContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
