let enabled = true;

export function setHapticsEnabled(v) {
  enabled = v;
}

export function isHapticsEnabled() {
  return enabled;
}

export function vibrate(pattern) {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}
