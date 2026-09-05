// Prompt 17 items 1/2: while any drag/resize/rotate/marquee gesture is in
// progress, the mouse can move faster than the clamped/pushed position
// it's actually producing — e.g. right at a page/collision boundary,
// where the item's own position stops changing but the pointer keeps
// moving — and the browser reads that continued movement as a normal
// click-and-drag TEXT selection instead. Disabling selection on the
// whole page for the gesture's duration (not just the canvas) is what
// actually covers every case, since a fast drag can carry the pointer
// outside the canvas entirely before the next mousemove is even handled.
//
// Call at the very start of a gesture (mousedown), keep the returned
// function, and call it again on mouseup to restore whatever `user-select`
// value was there before (almost always none, but never assume).
export function beginDragSelectGuard() {
  const prev = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  return () => {
    document.body.style.userSelect = prev;
  };
}
