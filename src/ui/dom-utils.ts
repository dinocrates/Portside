// Small shared DOM helpers. No framework — the UI layer is plain
// TypeScript over the DOM, re-rendering from RunOrchestrator state
// (spec §11.1: "Semantic HTML/CSS for controls, profile editing, results,
// and accessibility").

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CSS.escape with a safe fallback for older/headless environments. */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
