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
  /**
   * How to render a converted equation. Defaults to `mathNodeHtml`, which emits
   * `@tiptap/extension-mathematics` markup. Override it for another editor.
   */
  renderMath?: RenderMath;
};

export function isWordHtml(html: string): boolean {
  return (
    html.includes('xmlns:o="urn:schemas-microsoft-com') ||
    html.includes('xmlns:w="urn:schemas-microsoft-com') ||
    html.includes('xmlns:m="http://schemas.openxmlformats.org') ||
    html.includes('<!--[if') ||
    html.includes('mso-bidi') ||
    html.includes('mso-fareast')
  );
}

/**
 * True when the pasted HTML carries recoverable equation math — OMML
 * (`<m:oMath>`), Word's msEquation MathML fallback, or bare MathML.
 *
 * Two jobs. A paste handler uses it to skip the rasterized image Word ALSO puts
 * on the clipboard, so the editable equation wins instead of a flat picture.
 * And it catches the case `isWordHtml` cannot: LibreOffice pastes bare `<math>`
 * with no `mso-` markers at all, so gating only on `isWordHtml` would skip a
 * document whose equations `cleanWordHtml` can recover.
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
    .replace(/<!\[if[^\]]*\]>[\s\S]*?<!\[endif\]>/gi, '');

  // 5. DOMParser structural cleanup.
  const doc = new DOMParser().parseFromString(processed, 'text/html');

  // Remaining namespace-prefixed elements (o:p, w:*, v:*, stray m:*) → remove.
  Array.from(doc.querySelectorAll('*'))
    .filter((el) => el.tagName.includes(':'))
    .forEach((el) => el.remove());

  // Strip Word's inline styles
  doc.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));

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
