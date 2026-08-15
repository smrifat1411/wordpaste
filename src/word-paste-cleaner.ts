/**
 * Word → clean HTML paste transformer.
 *
 * Word copies produce HTML with:
 *   - OMML equations: <m:oMath>…</m:oMath> — Word's DEFAULT clipboard math format
 *     (per Microsoft's RichEdit HTML docs), the same OMML stored in a .docx.
 *   - MathML equations: inside <!--[if gte msEquation 12]><math>…</math><![endif]-->
 *     (older Word, or Word configured to copy MathML). LibreOffice pastes bare
 *     <math>.
 *   - Massive inline styles, mso-* class attributes, XML namespace declarations,
 *     and a rasterized image fallback in downlevel (<![if !msEquation]>) blocks.
 *
 * Strategy (string phase is case-sensitive — the text/html parser lowercases tag
 * names, which breaks the OMML walker — so equation conversion happens BEFORE the
 * DOM cleanup):
 *   1. Unwrap Word's msEquation conditional comments so their math is live.
 *   2. OMML (<m:oMath> / <m:oMathPara>) → math nodes via the `ommlToLatex` walker.
 *   3. Standalone MathML (<math>) → math nodes.
 *   4. Strip leftover conditional / downlevel comments (the image fallbacks).
 *   5. DOMParser cleanup: drop remaining namespaced elements, styles, mso-*
 *      classes, dead file:// images, empty paragraphs.
 */

import { ommlToLatex, mathNodeHtml } from './omml-to-latex.js';

/** Emits the markup for one equation. `block` is true for display equations. */
export type RenderMath = (latex: string, block: boolean) => string;

export type CleanWordHtmlOptions = {
  /** Defaults to `mathNodeHtml`. Override to emit markup for another editor. */
  renderMath?: RenderMath;
};

export function isWordHtml(html: string): boolean {
  return (
    html.includes('xmlns:o="urn:schemas-microsoft-com') ||
    html.includes('xmlns:w="urn:schemas-microsoft-com') ||
    html.includes('xmlns:m="http://schemas.openxmlformats.org') ||
    html.includes('<!--[if') ||
    html.includes('mso-bidi') ||
    html.includes('mso-fareast') ||
    html.includes('mso-list')
  );
}

/**
 * True when the paste carries recoverable math — OMML, Word's msEquation
 * fallback, or bare MathML. Use it to skip the rasterized image Word also puts
 * on the clipboard, and to catch LibreOffice, which has no `mso-` markers.
 */
export function hasWordMath(html: string): boolean {
  return /<m:oMath|\[if gte msEquation|<math[\s>]/i.test(html);
}

// ── MathML → LaTeX ────────────────────────────────────────────────────────

function childLatex(el: Element): string {
  return Array.from(el.childNodes).map(convertMathmlNode).join('');
}

function childAt(el: Element, i: number): string {
  const child = el.children[i];
  return child ? convertMathmlNode(child) : '';
}

function convertMathmlNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  // localName strips any XML namespace prefix
  const tag = el.localName.toLowerCase();

  switch (tag) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mphantom':
      return childLatex(el);

    case 'mi':
    case 'mn':
    case 'mo':
      return el.textContent?.trim() ?? '';

    case 'mtext':
      return `\\text{${el.textContent?.trim() ?? ''}}`;

    case 'mspace':
      return ' ';

    case 'mfrac':
      return `\\frac{${childAt(el, 0)}}{${childAt(el, 1)}}`;

    case 'msup':
      return `{${childAt(el, 0)}}^{${childAt(el, 1)}}`;

    case 'msub':
      return `{${childAt(el, 0)}}_{${childAt(el, 1)}}`;

    case 'msubsup':
      return `{${childAt(el, 0)}}_{${childAt(el, 1)}}^{${childAt(el, 2)}}`;

    case 'msqrt':
      return `\\sqrt{${childLatex(el)}}`;

    case 'mroot':
      return `\\sqrt[${childAt(el, 1)}]{${childAt(el, 0)}}`;

    case 'mfenced': {
      const open = el.getAttribute('open') ?? '(';
      const close = el.getAttribute('close') ?? ')';
      const sep = el.getAttribute('separators') ?? ',';
      const items = Array.from(el.children).map((c) => convertMathmlNode(c));
      return `\\left${open}${items.join(sep)}\\right${close}`;
    }

    case 'mover': {
      const base = childAt(el, 0);
      const accent = el.children[1]?.textContent?.trim() ?? '';
      if (accent === '→' || accent === '⃗') return `\\vec{${base}}`;
      if (accent === '¯' || accent === '‾') return `\\overline{${base}}`;
      return `\\overset{${accent}}{${base}}`;
    }

    case 'munder':
      return `\\underset{${childAt(el, 1)}}{${childAt(el, 0)}}`;

    case 'mtable': {
      const rows = Array.from(el.children).map((row) =>
        Array.from(row.children)
          .map((c) => convertMathmlNode(c))
          .join(' & '),
      );
      return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
    }

    default:
      return childLatex(el);
  }
}

function mathmlStringToLatex(mathml: string): string {
  try {
    const doc = new DOMParser().parseFromString(mathml, 'application/xml');
    const mathEl = doc.querySelector('math');
    return mathEl ? convertMathmlNode(mathEl).trim() : '';
  } catch {
    return '';
  }
}

// ── Shared cleanup ─────────────────────────────────────────────────────────

/** Drop every inline style except text-align, which is the author's layout. */
function keepOnlyTextAlign(doc: Document): void {
  doc.querySelectorAll('[style]').forEach((el) => {
    const kept = (el.getAttribute('style') ?? '')
      .split(';')
      .filter((decl) => /^\s*text-align\s*:/i.test(decl))
      .join('; ')
      .trim();

    if (kept) el.setAttribute('style', kept);
    else el.removeAttribute('style');
  });
}

// ── Google Docs ────────────────────────────────────────────────────────────

export function isGoogleDocsHtml(html: string): boolean {
  return html.includes('docs-internal-guid');
}

// Docs carries bold and italic as inline styles, not tags. These have to become
// real elements before the styles are stripped, or the formatting is lost.
const STYLE_AS_TAG: Array<[RegExp, string]> = [
  [/font-weight\s*:\s*(bold(er)?|[6-9]00)/i, 'strong'],
  [/font-style\s*:\s*italic/i, 'em'],
  [/text-decoration[\w-]*\s*:[^;]*underline/i, 'u'],
  [/text-decoration[\w-]*\s*:[^;]*line-through/i, 's'],
];

/**
 * Clean a Google Docs paste: unwrap its fake bold wrapper, turn its inline
 * formatting into real tags, then drop the font noise.
 */
export function cleanGoogleDocsHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Docs wraps the whole paste in <b style="font-weight:normal">. Unwrap it
  // FIRST — strip the style and a bare <b> makes everything bold.
  doc
    .querySelectorAll('b[id^="docs-internal-guid"], b[style*="font-weight:normal"]')
    .forEach((el) => el.replaceWith(...Array.from(el.childNodes)));

  doc.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style') ?? '';
    for (const [pattern, tag] of STYLE_AS_TAG) {
      if (!pattern.test(style)) continue;
      const wrapper = doc.createElement(tag);
      while (el.firstChild) wrapper.appendChild(el.firstChild);
      el.appendChild(wrapper);
    }
  });

  keepOnlyTextAlign(doc);
  doc
    .querySelectorAll('[id^="docs-internal-guid"]')
    .forEach((el) => el.removeAttribute('id'));

  return doc.body.innerHTML;
}

// ── Word lists ─────────────────────────────────────────────────────────────

/**
 * Word does not paste a list as a list. Every item arrives as a <p> carrying
 * `mso-list: l0 level1 lfo1` in its style, with the bullet or number sitting in
 * the text as a `mso-list:Ignore` span. Strip the styles and you keep "1." and
 * "2." frozen into the paragraph — reorder or insert an item and the numbering
 * is wrong forever, because nothing is numbering it any more.
 *
 * So the markers must be read before they are thrown away: they are the only
 * record of whether the list was ordered, which sequence it used, and where it
 * started. Word itself flags them `Ignore`, which is exactly the hint that they
 * are presentation, not content.
 */
const MSO_LIST = /mso-list\s*:\s*(l\d+)\s+level(\d+)/i;

type ListRunItem = { el: Element; level: number; marker: string };
type ListShape = { ordered: boolean; type?: string; start?: number };

/** The `mso-list:Ignore` span holding the literal bullet or number. */
function markerSpans(el: Element): Element[] {
  return Array.from(el.querySelectorAll('span[style*="mso-list"]')).filter((s) =>
    /ignore/i.test(s.getAttribute('style') ?? ''),
  );
}

function readListItem(el: Element): ListRunItem & { listId: string } | null {
  const found = MSO_LIST.exec(el.getAttribute('style') ?? '');
  if (!found) return null;
  return {
    el,
    listId: found[1]!.toLowerCase(),
    level: Number(found[2]),
    marker: markerSpans(el)[0]?.textContent ?? '',
  };
}

/** "1." / "a)" / "IV." → ordered. Word's bullets (·, o, §, ) carry no
 *  trailing punctuation — 'o' is a Courier bullet, not the letter. */
function parseMarker(marker: string): { ordered: boolean; body?: string } {
  const m = marker.replace(/[\s ]+/g, '');
  if (!/^[([]?[0-9A-Za-z]+[.)\]]$/.test(m)) return { ordered: false };
  return { ordered: true, body: m.replace(/^[([]/, '').replace(/[.)\]]$/, '') };
}

/**
 * Decide the shape from every marker at this level, not just the first — "i."
 * alone is ambiguous between roman and alpha, but "i., ii., iii." is not.
 */
function readListShape(markers: string[]): ListShape {
  const parsed = markers.map(parseMarker);
  if (!parsed.some((p) => p.ordered)) return { ordered: false };

  const bodies = parsed.filter((p) => p.ordered).map((p) => p.body!);
  const every = (re: RegExp) => bodies.every((b) => re.test(b));
  const multi = bodies.some((b) => b.length > 1);

  if (every(/^\d+$/)) {
    const start = Number(bodies[0]);
    return { ordered: true, start: start > 1 ? start : undefined };
  }
  if (every(/^[ivxlcdm]+$/) && multi) return { ordered: true, type: 'i' };
  if (every(/^[IVXLCDM]+$/) && multi) return { ordered: true, type: 'I' };
  if (every(/^[a-z]+$/)) return { ordered: true, type: 'a' };
  if (every(/^[A-Z]+$/)) return { ordered: true, type: 'A' };
  return { ordered: true };
}

function makeList(doc: Document, shape: ListShape): Element {
  const list = doc.createElement(shape.ordered ? 'ol' : 'ul');
  if (shape.type) list.setAttribute('type', shape.type);
  if (shape.start) list.setAttribute('start', String(shape.start));
  return list;
}

/** Word pads after the marker; once the marker span goes the padding is litter. */
function trimLeading(li: Element): void {
  while (
    li.firstChild &&
    li.firstChild.nodeType === Node.TEXT_NODE &&
    !(li.firstChild.textContent ?? '').replace(/[\s ]+/g, '')
  ) {
    li.firstChild.remove();
  }
}

function buildList(doc: Document, run: ListRunItem[]): Element {
  const base = run[0]!.level;
  const shapeAt = (level: number) =>
    readListShape(run.filter((r) => r.level === level).map((r) => r.marker));

  const root = makeList(doc, shapeAt(base));
  // stack[n] is the list holding items at depth n.
  const stack: Element[] = [root];

  for (const { el, level } of run) {
    const depth = Math.max(0, level - base);

    // Deeper than anything open — nest new lists inside the current last item.
    while (stack.length <= depth) {
      const parent = stack[stack.length - 1]!;
      const host =
        parent.lastElementChild ?? parent.appendChild(doc.createElement('li'));
      const nested = makeList(doc, shapeAt(base + stack.length));
      host.appendChild(nested);
      stack.push(nested);
    }
    stack.length = depth + 1;

    markerSpans(el).forEach((s) => s.remove());

    const li = doc.createElement('li');
    while (el.firstChild) li.appendChild(el.firstChild);
    trimLeading(li);
    stack[depth]!.appendChild(li);
  }

  return root;
}

/** Replace every run of consecutive Word list paragraphs with a real list. */
function rebuildWordLists(doc: Document): void {
  const blocks = Array.from(doc.body.children);
  let i = 0;

  while (i < blocks.length) {
    const first = readListItem(blocks[i]!);
    if (!first) {
      i++;
      continue;
    }

    // A run ends at the first non-item, or when Word starts a different list.
    const run: ListRunItem[] = [];
    let j = i;
    for (; j < blocks.length; j++) {
      const item = readListItem(blocks[j]!);
      if (!item || item.listId !== first.listId) break;
      run.push(item);
    }

    const list = buildList(doc, run);
    run[0]!.el.replaceWith(list);
    run.slice(1).forEach((r) => r.el.remove());
    i = j;
  }
}

// ── Main cleaner ───────────────────────────────────────────────────────────

export function cleanWordHtml(
  html: string,
  { renderMath = mathNodeHtml }: CleanWordHtmlOptions = {},
): string {
  // 1. Unwrap Word's "msEquation" conditional comments so the OMML / MathML they
  //    guard for old browsers becomes live content we can convert.
  let processed = html.replace(
    /<!--\[if gte msEquation[^\]]*\]>([\s\S]*?)<!\[endif\]-->/gi,
    '$1',
  );

  // 2. OMML — Word's default clipboard math format. Convert on the raw string
  //    (case-sensitive: the text/html parser lowercases tag names, breaking the
  //    walker). oMathPara (display para) first so its inner oMath isn't converted
  //    twice. Reuses the same `ommlToLatex` walker as the .docx import. Everything
  //    lands INLINE so equations flow like text (compact), not as full-width
  //    centered bands — authors switch a specific equation to display via the
  //    editor's inline⇄display toggle.
  processed = processed
    .replace(/<m:oMathPara(?:\s[^>]*)?>[\s\S]*?<\/m:oMathPara>/g, (frag) =>
      renderMath(ommlToLatex(frag), false),
    )
    .replace(/<m:oMath(?:\s[^>]*)?>[\s\S]*?<\/m:oMath>/g, (frag) =>
      renderMath(ommlToLatex(frag), false),
    );

  // 3. Standalone MathML (LibreOffice, or Word configured to emit MathML) → inline.
  processed = processed.replace(/<math[\s\S]*?<\/math>/gi, (mathml) => {
    const latex = mathmlStringToLatex(mathml);
    return latex ? renderMath(latex, false) : '';
  });

  // 4. Strip leftover conditional / downlevel comments — including the rasterized
  //    image fallbacks Word pairs with each equation (<![if !msEquation]>…).
  processed = processed
    .replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')
    // Word guards list markers in a downlevel-REVEALED block, which is meant to
    // be shown. Unwrap it rather than dropping it: the marker is the only record
    // of how the list was numbered, and `rebuildWordLists` needs it below.
    .replace(/<!\[if\s*!supportLists\s*\]>([\s\S]*?)<!\[endif\]>/gi, '$1')
    .replace(/<!\[if[^\]]*\]>[\s\S]*?<!\[endif\]>/gi, '');

  // 5. DOMParser structural cleanup.
  const doc = new DOMParser().parseFromString(processed, 'text/html');

  // Lists first — this reads the mso-list styles and marker spans that the
  // style and class stripping below is about to delete.
  rebuildWordLists(doc);

  // Remaining namespace-prefixed elements (o:p, w:*, v:*, stray m:*) → remove.
  Array.from(doc.querySelectorAll('*'))
    .filter((el) => el.tagName.includes(':'))
    .forEach((el) => el.remove());

  keepOnlyTextAlign(doc);

  // Strip mso-* class attributes
  doc.querySelectorAll('[class]').forEach((el) => {
    if (/mso/i.test(el.getAttribute('class') ?? ''))
      el.removeAttribute('class');
  });

  // Word references pasted images by local path (file:///…) — dead links in a
  // browser. Drop them; genuine images arrive via the upload path instead.
  doc.querySelectorAll('img').forEach((el) => {
    if (!/^(https?:|data:)/i.test(el.getAttribute('src') ?? '')) el.remove();
  });

  // Clean up empty paragraphs left by o:p removal
  doc.querySelectorAll('p:empty').forEach((el) => el.remove());

  return doc.body.innerHTML;
}

/**
 * Drop inline text colour from pasted HTML, whatever produced it.
 *
 * `cleanWordHtml` only runs when `isWordHtml` matches, and Google Docs carries
 * no `mso-` markers — so Docs paste arrived untouched, bringing its default
 * `color: rgb(0,0,0)` with it. On a dark theme an inline colour beats the
 * stylesheet, so that pasted text renders black on a dark background and cannot
 * be read. 395 questions in the bank are in exactly that state.
 *
 * Pasted text adopting the document's own styling is what every editor does —
 * Notion, Confluence, Docs itself. This is the narrow version of that: ONLY
 * colour is removed, because the editor legitimately writes other inline styles
 * (text-align among them) and stripping the attribute wholesale would undo
 * them.
 */
export function stripInlineColors(html: string): string {
  if (!html.includes('style')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('[style]').forEach((el) => {
    const kept = (el.getAttribute('style') ?? '')
      .split(';')
      .filter(
        (decl) => !/^\s*(?:background-)?color\s*:/i.test(decl) && decl.trim(),
      )
      .join('; ')
      .trim();

    if (kept) el.setAttribute('style', kept);
    else el.removeAttribute('style');
  });

  return doc.body.innerHTML;
}

/**
 * Clean a paste from Word or LibreOffice; drop colour from anything else so a
 * Google Docs paste can't put black text on a dark theme.
 *
 * Named after ProseMirror's editor prop so it can be passed by reference —
 * Tiptap takes the same prop via `editorProps`. No options for that reason;
 * compose `cleanWordHtml` yourself if you need `renderMath`.
 */
export function transformPastedHTML(html: string): string {
  if (isWordHtml(html) || hasWordMath(html)) {
    return stripInlineColors(cleanWordHtml(html));
  }
  if (isGoogleDocsHtml(html)) return stripInlineColors(cleanGoogleDocsHtml(html));
  return stripInlineColors(html);
}
