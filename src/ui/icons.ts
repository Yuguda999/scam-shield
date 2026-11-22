import {
  createElement,
  ChevronDown,
  CircleCheck,
  Cloud,
  ClipboardPaste,
  FileSearch,
  Languages,
  Lock,
  Megaphone,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
  Users,
  type IconNode,
} from 'lucide';

export const icons = {
  chevron: ChevronDown,
  ok: CircleCheck,
  cloud: Cloud,
  paste: ClipboardPaste,
  page: FileSearch,
  languages: Languages,
  lock: Lock,
  megaphone: Megaphone,
  scam: OctagonAlert,
  shield: ShieldCheck,
  warn: TriangleAlert,
  users: Users,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof icons;

/** Lucide icon as inline SVG, 24-grid, currentColor stroke. Decorative unless labelled by its parent. */
export function icon(name: IconName, cls = 'icon'): SVGElement {
  const el = createElement(icons[name], { class: cls, 'aria-hidden': 'true', 'stroke-width': 2 });
  return el;
}
