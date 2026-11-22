/** Tiny DOM helper. All text goes through textContent, never innerHTML, so model output cannot inject markup. */
type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Render redacted text with placeholders highlighted. */
export function redactedView(text: string): HTMLElement {
  const pre = h('div', { class: 'redacted' });
  for (const part of text.split(/(\[[A-Z_]+_\d+\])/g)) {
    if (!part) continue;
    pre.append(/^\[[A-Z_]+_\d+\]$/.test(part) ? h('mark', {}, part) : document.createTextNode(part));
  }
  return pre;
}
