import { ELEMENT_TYPES } from './elementCatalog';

// Build the starting slot assignment: every element with defaultOn:true gets
// placed into its region's slots in catalog order.
function buildInitialSlots() {
  const slots = {}; // region -> [elementType, ...] in stacking order
  Object.entries(ELEMENT_TYPES).forEach(([type, def]) => {
    if (!def.defaultOn) return;
    if (!slots[def.region]) slots[def.region] = [];
    slots[def.region].push(type);
  });
  return slots;
}

export const initialTemplateState = {
  slots: buildInitialSlots(),
  // per-element style overrides, keyed by element type
  elementStyles: {},
  // decoration shapes on the free canvas layer
  shapes: [],
  // shape ids currently grouped, keyed by groupId -> [shapeId, ...]
  groups: {},
  page: { width: 794, height: 1123 }, // ~A4 at 96dpi, used for rail detection
};
