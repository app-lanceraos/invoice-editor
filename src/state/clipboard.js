const KEY = 'invoice-editor:clipboard';

// Clipboard payload shape: { item: {...} } — a full unified canvas item
// (shape or content, `item.kind` tells you which), copied wholesale.
// Pasting always adds a new instance, same for either kind.

export function copyToClipboard(payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    // localStorage can fail (private mode, quota) — clipboard just won't
    // persist across a refresh in that case, no need to interrupt the user.
    console.warn('Clipboard persist failed', e);
  }
}

export function readClipboard() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
