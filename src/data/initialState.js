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
  // ~A4 at 96dpi, used for rail detection + the boundary clamp. backgroundColor
  // is a per-template value (not the global --page-bg token) so different
  // templates can have different page colors; this default matches the
  // token's current cream tone so existing templates don't visually change.
  page: { width: 794, height: 1123, backgroundColor: '#FAF9F6' },
};
