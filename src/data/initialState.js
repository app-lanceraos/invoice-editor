import { ELEMENT_TYPES, createContentItem } from './elementCatalog';

// Build the starting item list: every content type with defaultOn:true gets
// one instance, in catalog order. Shapes start empty — the user adds those
// deliberately from the shape library.
function buildInitialItems() {
  return Object.keys(ELEMENT_TYPES)
    .filter((type) => ELEMENT_TYPES[type].defaultOn)
    .map((type) => createContentItem(type));
}

export const initialTemplateState = {
  // One flat list of canvas items — shapes and content elements alike,
  // each `{ id, kind: 'content' | 'shape', type, x, y, width, height,
  // rotation, naturalWidth, naturalHeight, ...style }`. Paint/stacking
  // order follows array order within each kind (see CanvasLayer.jsx —
  // shapes always paint behind content as a group, matching the existing
  // "shapes are background decoration" rule).
  items: buildInitialItems(),
  // shape ids currently grouped, keyed by groupId -> [itemId, ...]
  groups: {},
  page: { width: 794, height: 1123 }, // ~A4 at 96dpi, used for rail detection
};
