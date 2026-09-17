/**
 * OMML (Office Math Markup Language) → LaTeX.
 *
 * Word stores equations as OMML — both on the clipboard and inside a .docx
 * (`word/document.xml`). This walks the OMML tree and emits LaTeX that KaTeX or
 * MathJax renders.
 *
 * Browser-only (uses the native DOMParser).
 */

const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Unicode math glyphs Word emits as plain runs → their LaTeX commands. Without
// this map KaTeX chokes on the raw codepoints (e.g. ×, ⇒, ∆).
const UNI: Record<string, string> = {
  '×': '\\times ',
  '÷': '\\div ',
  '⇒': '\\Rightarrow ',
  '⇔': '\\Leftrightarrow ',
  '→': '\\to ',
  '≥': '\\geq ',
  '≤': '\\leq ',
  '≠': '\\neq ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '∞': '\\infty ',
  '∴': '\\therefore ',
  '∵': '\\because ',
  '≈': '\\approx ',
  '∝': '\\propto ',
  '·': '\\cdot ',
  '∙': '\\cdot ',
  '°': '^{\\circ}',
  π: '\\pi ',
  θ: '\\theta ',
  α: '\\alpha ',
  β: '\\beta ',
  γ: '\\gamma ',
  δ: '\\delta ',
  Δ: '\\Delta ',
  '∆': '\\Delta ',
  μ: '\\mu ',
  ρ: '\\rho ',
  σ: '\\sigma ',
  ω: '\\omega ',
  φ: '\\phi ',
  λ: '\\lambda ',
  Σ: '\\sum ',
  '∑': '\\sum ',
  '∫': '\\int ',
  '∏': '\\prod ',
  ' ': ' ',
  ' ': ' ', // thin / non-breaking space → ordinary space
};
// LaTeX-special ASCII that must be escaped when it appears as literal text.
const ESC: Record<string, string> = {
  '%': '\\%',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
};

// <m:accPr><m:chr> holds the accent as a combining codepoint. Word omits the
// attribute entirely for a circumflex, so \hat doubles as the fallback.
const ACCENT: Record<string, string> = {
  '\u0300': 'grave',
  '\u0301': 'acute',
  '\u0302': 'hat',
  '\u0303': 'tilde',
  '\u0304': 'bar',
  '\u0305': 'overline',
  '\u0306': 'breve',
  '\u0307': 'dot',
  '\u0308': 'ddot',
  '\u030C': 'check',
  '\u20D6': 'overleftarrow',
  '\u20D7': 'vec',
};

// Delimiter characters Word stores literally in <m:begChr>/<m:endChr>, which
// LaTeX will not accept raw after \left and \right. An empty string means
// "no delimiter this side", which LaTeX spells as a full stop.
const DELIM: Record<string, string> = {
  '': '.',
  '{': '\\{',
  '}': '\\}',
  '\u2016': '\\|',
  '\u230A': '\\lfloor',
  '\u230B': '\\rfloor',
  '\u2308': '\\lceil',
  '\u2309': '\\rceil',
  '\u27E8': '\\langle',
  '\u27E9': '\\rangle',
  '\u3008': '\\langle',
  '\u3009': '\\rangle',
};
const delim = (ch: string): string => DELIM[ch] ?? ch;

function escText(s: string): string {
  let o = '';
  for (const ch of s) o += UNI[ch] ?? ESC[ch] ?? ch;
  return o;
}

const kids = (el: Element, ln: string): Element[] =>
  Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).localName === ln,
  );
const child = (el: Element, ln: string): Element | undefined => kids(el, ln)[0];
const attrVal = (el: Element | undefined): string =>
  el
    ? (el.getAttributeNS(M_NS, 'val') ??
      el.getAttribute('m:val') ??
      el.getAttribute('val') ??
      '')
    : '';

function conv(node: Element): string {
  let out = '';
  for (const n of Array.from(node.childNodes)) {
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    switch (el.localName) {
      // Transparent containers — recurse into their children.
      case 'oMath':
      case 'oMathPara':
      case 'e':
      case 'num':
      case 'den':
      case 'sub':
      case 'sup':
      case 'deg':
      case 'fName':
      case 'lim':
        out += conv(el);
        break;
      case 'r': {
        // Math run text. Three forms seen in the wild: the .docx wraps it in
        // <m:t>; Word's HTML clipboard stores it directly in the run OR wraps it
        // in HTML formatting (<i>/<b>/<span> — math variables come through
        // italicized). Reading the run's full textContent captures all three
        // (<m:rPr> run-properties carry no text). Verified on a real Mac Word
        // multi-equation clipboard paste.
        const text = escText(el.textContent ?? '');
        // <m:nor/> marks a run as upright text — units and words like "2.5 m"
        // or "and". Without \text{} they render as italic variables.
        const rPr = child(el, 'rPr');
        const upright = rPr ? !!child(rPr, 'nor') : false;
        out += upright && text.trim() ? `\\text{${text}}` : text;
        break;
      }
      case 'f': {
        // fraction — <m:fPr><m:type> picks the shape. Absent or "bar" is the
        // horizontal rule; "noBar" is how Word writes a binomial coefficient,
        // and "lin"/"skw" are written inline with a slash.
        const nu = child(el, 'num'),
          de = child(el, 'den');
        const top = nu ? conv(nu) : '',
          bot = de ? conv(de) : '';
        const fPr = child(el, 'fPr');
        const type = fPr ? attrVal(child(fPr, 'type')) : '';
        if (type === 'noBar') out += `\\binom{${top}}{${bot}}`;
        else if (type === 'lin' || type === 'skw') out += `${top}/${bot}`;
        else out += `\\frac{${top}}{${bot}}`;
        break;
      }
      case 'sSub': {
        const e = child(el, 'e'),
          s = child(el, 'sub');
        out += `{${e ? conv(e) : ''}}_{${s ? conv(s) : ''}}`;
        break;
      }
      case 'sSup': {
        const e = child(el, 'e'),
          s = child(el, 'sup');
        out += `{${e ? conv(e) : ''}}^{${s ? conv(s) : ''}}`;
        break;
      }
      case 'sSubSup': {
        const e = child(el, 'e'),
          sb = child(el, 'sub'),
          sp = child(el, 'sup');
        out += `{${e ? conv(e) : ''}}_{${sb ? conv(sb) : ''}}^{${sp ? conv(sp) : ''}}`;
        break;
      }
      case 'rad': {
        // radical (n-th root)
        const dg = child(el, 'deg'),
          e = child(el, 'e');
        const dc = dg ? conv(dg) : '';
        out += dc
          ? `\\sqrt[${dc}]{${e ? conv(e) : ''}}`
          : `\\sqrt{${e ? conv(e) : ''}}`;
        break;
      }
      case 'd': {
        // delimiter (parentheses/brackets/braces)
        const dpr = child(el, 'dPr');
        let beg = '(',
          end = ')',
          sep = ',';
        if (dpr) {
          const bEl = child(dpr, 'begChr'),
            eEl = child(dpr, 'endChr'),
            sEl = child(dpr, 'sepChr');
          // Present-but-empty means "no delimiter on this side" — Word writes
          // that for the open edge of a cases block. Absent means "default",
          // which is why these read the element rather than its value.
          if (bEl) beg = attrVal(bEl);
          if (eEl) end = attrVal(eEl);
          if (sEl) sep = attrVal(sEl);
        }
        const inner = kids(el, 'e').map(conv).join(sep);
        out += `\\left${delim(beg)} ${inner} \\right${delim(end)}`;
        break;
      }
      case 'nary': {
        // n-ary operator (∑, ∫, ∏ …)
        const pr = child(el, 'naryPr');
        const chr = pr ? attrVal(child(pr, 'chr')) : '';
        const op = UNI[chr] || (chr ? escText(chr) : '\\int ');
        const sb = child(el, 'sub'),
          sp = child(el, 'sup'),
          e = child(el, 'e');
        out += `${op}${sb ? `_{${conv(sb)}}` : ''}${sp ? `^{${conv(sp)}}` : ''}{${e ? conv(e) : ''}}`;
        break;
      }
      case 'func': {
        // named function with argument
        const fn = child(el, 'fName'),
          e = child(el, 'e');
        out += `${fn ? conv(fn) : ''}\\left(${e ? conv(e) : ''}\\right)`;
        break;
      }
      case 'limLow': {
        const e = child(el, 'e'),
          l = child(el, 'lim');
        out += `${e ? conv(e) : ''}_{${l ? conv(l) : ''}}`;
        break;
      }
      case 'limUpp': {
        const e = child(el, 'e'),
          l = child(el, 'lim');
        out += `${e ? conv(e) : ''}^{${l ? conv(l) : ''}}`;
        break;
      }
      case 'bar': {
        // <m:barPr><m:pos val="bot"/> puts the rule under the expression.
        const e = child(el, 'e');
        const barPr = child(el, 'barPr');
        const cmd =
          (barPr ? attrVal(child(barPr, 'pos')) : '') === 'bot'
            ? 'underline'
            : 'overline';
        out += `\\${cmd}{${e ? conv(e) : ''}}`;
        break;
      }
      case 'acc': {
        // Every accent used to collapse to \hat, which turns a vector into a
        // circumflex — the wrong symbol in most physics and engineering
        // documents, and silently so.
        const e = child(el, 'e');
        const accPr = child(el, 'accPr');
        const cmd = ACCENT[accPr ? attrVal(child(accPr, 'chr')) : ''] ?? 'hat';
        out += `\\${cmd}{${e ? conv(e) : ''}}`;
        break;
      }

      case 'sPre': {
        // pre-sub/superscript — an isotope such as {}_{6}^{14}C.
        const e = child(el, 'e'),
          sb = child(el, 'sub'),
          sp = child(el, 'sup');
        out += `{}${sb ? `_{${conv(sb)}}` : ''}${sp ? `^{${conv(sp)}}` : ''}{${e ? conv(e) : ''}}`;
        break;
      }

      case 'eqArr': {
        // equation array — Word's multi-line aligned block. Without this the
        // lines run together into one expression.
        out += `\\begin{aligned} ${kids(el, 'e').map(conv).join(' \\\\ ')} \\end{aligned}`;
        break;
      }
      case 'm': {
        // matrix
        const rows = kids(el, 'mr')
          .map((r) => kids(r, 'e').map(conv).join(' & '))
          .join(' \\\\ ');
        out += `\\begin{matrix} ${rows} \\end{matrix}`;
        break;
      }
      default:
        out += conv(el); // unknown wrapper — descend
    }
  }
  return out;
}

/**
 * Convert a single OMML fragment (`<m:oMath>…` or `<m:oMathPara>…`) to LaTeX.
 * Returns '' if the fragment can't be parsed.
 */
export function ommlToLatex(ommlFragment: string): string {
  try {
    const doc = new DOMParser().parseFromString(
      `<root xmlns:m="${M_NS}" xmlns:w="${W_NS}">${ommlFragment}</root>`,
      'application/xml',
    );
    if (doc.querySelector('parsererror')) return '';
    return conv(doc.documentElement).trim();
  } catch {
    return '';
  }
}

/** Escape a LaTeX string for use as element text. */
export function escapeLatexText(latex: string): string {
  return latex
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a LaTeX string for use inside a `data-latex="…"` attribute. */
export function escapeLatexAttr(latex: string): string {
  return escapeLatexText(latex).replace(/"/g, '&quot;');
}

/**
 * Render a LaTeX string as @tiptap/extension-mathematics node markup — block
 * (`<div data-type="block-math">`) for display equations, inline
 * (`<span data-type="inline-math">`) otherwise. This is `cleanWordHtml`'s
 * default `renderMath`; pass your own to emit something else.
 *
 * The LaTeX is repeated as text so it degrades readably when nothing renders
 * it; Tiptap's math nodes are atoms reading `data-latex`, so they ignore it.
 */
export function mathNodeHtml(latex: string, block: boolean): string {
  const attr = escapeLatexAttr(latex);
  const text = escapeLatexText(latex);
  return block
    ? `<div data-type="block-math" data-latex="${attr}">${text}</div>`
    : `<span data-type="inline-math" data-latex="${attr}">${text}</span>`;
}
