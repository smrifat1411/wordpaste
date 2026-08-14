<h1 align="center">wordpaste</h1>

<p align="center">
  Clean Microsoft Word clipboard HTML — and keep the equations <b>editable</b>.
</p>

<p align="center">
  <a href="https://github.com/smrifat1411/wordpaste/actions/workflows/ci.yml"><img src="https://github.com/smrifat1411/wordpaste/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/wordpaste"><img src="https://img.shields.io/npm/v/wordpaste.svg" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/wordpaste"><img src="https://img.shields.io/bundlephobia/minzip/wordpaste.svg" alt="minzipped size"></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="zero dependencies">
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/wordpaste.svg" alt="MIT license"></a>
</p>

<p align="center">
  <b><a href="https://smrifat1411.github.io/wordpaste/">Try the live playground →</a></b><br>
  <sub>Load a sample, or paste your own Word document. Runs in your browser.</sub>
</p>

---

Paste from Word into a web editor and two things go wrong. You get a wall of
invisible Word styling, and every equation turns into a flat picture nobody can
edit again.

`wordpaste` fixes both. It is one function: HTML string in, clean HTML string
out. No framework, no build step, no dependencies.

- **Equations survive** as editable LaTeX instead of screenshots
- **2.4 kB gzipped**, zero dependencies
- **Any editor** — plain `contenteditable`, Tiptap, ProseMirror, Lexical
- **Works in the browser today**, and in Node with jsdom

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Showing the maths](#showing-the-maths) — **read this if equations look wrong**
- [What it handles](#what-it-handles)
- [Use it with](#use-it-with) — [Plain JavaScript](#plain-javascript) · [Tiptap](#tiptap) · [ProseMirror](#prosemirror) · [Lexical](#lexical) · [React, Vue, Svelte](#react-vue-svelte) · [Node](#node)
- [API](#api)
- [Equations](#equations)
- [Limits](#limits)
- [Why this exists](#why-this-exists)

## Install

```bash
npm install wordpaste
```

## Quick start

```js
import { isWordHtml, hasWordMath, cleanWordHtml } from 'wordpaste';

const clean = isWordHtml(html) || hasWordMath(html) ? cleanWordHtml(html) : html;
```

`html` is the clipboard HTML — every editor gives you a place to see it before
it is parsed. The sections below show exactly where, for each editor.

Both checks are in the guard on purpose. `isWordHtml` catches Word and Office.
`hasWordMath` also catches LibreOffice, which sends bare `<math>` with no Word
markers at all.

## Showing the maths

An equation comes out like this:

```html
<span data-type="inline-math" data-latex="\frac{a}{b}">\frac{a}{b}</span>
```

The LaTeX is in the attribute **and** in the text. That means if you do nothing,
you see the raw `\frac{a}{b}` on screen. That is deliberate — a visible clue
beats a blank space you cannot debug.

To make it look like maths, pick one:

**1. Tiptap** — install
[`@tiptap/extension-mathematics`](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
and add it to your extensions. The output above is already its markup, so it
just works.

**2. Any other editor** — render it yourself with
[KaTeX](https://katex.org) or MathJax:

```js
document.querySelectorAll('[data-latex]').forEach((el) => {
  katex.render(el.dataset.latex, el, {
    displayMode: el.dataset.type === 'block-math',
    throwOnError: false,
  });
});
```

**3. No renderer** — emit something else instead:

```js
cleanWordHtml(html, {
  renderMath: (latex, block) => (block ? `$$${latex}$$` : `$${latex}$`),
});
```

## What it handles

| You copy from | Junk cleaned | Equations kept editable |
| --- | --- | --- |
| **Microsoft Word** | Yes | **Yes** — OMML |
| **LibreOffice Writer** | Yes | **Yes** — MathML |
| **Outlook** | Yes | n/a |
| **Excel** | Yes | n/a |
| **Google Docs** | Colour only | No |
| Anything else | Left untouched | — |

Google Docs writes no `mso-` markers, so the detector correctly says "not Word"
and leaves its HTML alone. `stripInlineColors` still runs, which is the part
that matters — Docs writes `color: rgb(0,0,0)` inline, so on a dark theme its
text arrives black on black.

Its equations cannot be recovered by anyone: Docs puts them on the clipboard as
images already. Word is the unusual one — it sends the picture *and* the real
maths, which is the gap this package exploits.

## Use it with

### Plain JavaScript

No editor library. This is a complete, working example — save it as an HTML file
and open it.

```html
<div id="editor" contenteditable="true">Paste here…</div>

<script type="module">
  import { isWordHtml, hasWordMath, cleanWordHtml, stripInlineColors }
    from 'https://esm.sh/wordpaste';

  document.getElementById('editor').addEventListener('paste', (event) => {
    const html = event.clipboardData.getData('text/html');
    if (!html) return;

    event.preventDefault();

    const clean = stripInlineColors(
      isWordHtml(html) || hasWordMath(html) ? cleanWordHtml(html) : html,
    );

    document.execCommand('insertHTML', false, clean);
  });
</script>
```

`stripInlineColors` runs on every paste, not just Word ones, so a Google Docs
paste cannot smuggle black text into a dark theme.

### Tiptap

`transformPastedHTML` is a documented method on a
[custom extension](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new).

```js
import { Extension } from '@tiptap/core';
import { isWordHtml, hasWordMath, cleanWordHtml, stripInlineColors } from 'wordpaste';

export const WordPaste = Extension.create({
  name: 'wordPaste',
  transformPastedHTML(html) {
    return stripInlineColors(
      isWordHtml(html) || hasWordMath(html) ? cleanWordHtml(html) : html,
    );
  },
});
```

Add `WordPaste` to your `extensions` array.

If you also use `@tiptap/extension-file-handler`, tell it to ignore Word's
screenshot when the HTML carries real maths — otherwise you get the equation
*and* a picture of it:

```js
FileHandler.configure({
  onPaste: (editor, files, pasteContent) => {
    if (pasteContent && hasWordMath(pasteContent)) return;
    // …your normal image upload
  },
});
```

### ProseMirror

Tiptap is built on ProseMirror, but if you use it directly the hook is an editor
prop. ProseMirror's own docs describe it as "for example to clean it up".

```js
import { EditorView } from 'prosemirror-view';
import { isWordHtml, hasWordMath, cleanWordHtml } from 'wordpaste';

new EditorView(element, {
  state,
  transformPastedHTML(html) {
    return isWordHtml(html) || hasWordMath(html) ? cleanWordHtml(html) : html;
  },
});
```

### Lexical

Lexical's [DOM import](https://lexical.dev/docs/serialization/dom-import) lets
you claim `text/html` and see the raw string. Clean it before parsing:

```js
configExtension(ClipboardImportExtension, {
  $importMimeType: {
    'text/html': [
      (html, selection, _$next, dataTransfer) => {
        const clean = isWordHtml(html) || hasWordMath(html) ? cleanWordHtml(html) : html;
        const dom = new DOMParser().parseFromString(clean, 'text/html');
        const nodes = $generateNodesFromDOMViaExtension(dom, {
          context: [
            contextValue(ImportSource, 'paste'),
            contextValue(ImportSourceDataTransfer, dataTransfer),
          ],
        });
        $insertGeneratedNodes($getEditor(), nodes, selection);
        return true;
      },
    ],
  },
});
```

### React, Vue, Svelte

Nothing extra to install and no framework build. This package has no UI and no
state — it is a function that takes a string and returns a string. Use whichever
editor you use above; the code is identical inside a component.

### Node

The parser uses the browser's `DOMParser` and `querySelector`. In Node, supply
one from [jsdom](https://github.com/jsdom/jsdom) before importing:

```js
import { JSDOM } from 'jsdom';
globalThis.DOMParser = new JSDOM().window.DOMParser;

const { cleanWordHtml } = await import('wordpaste');
```

`@xmldom/xmldom` will not work — it has no `querySelector`.

## API

### `cleanWordHtml(html, options?): string`

The main one. In order, it:

1. Unwraps Word's `<!--[if gte msEquation]-->` comments so the maths inside
   becomes live content.
2. Converts **OMML** (`<m:oMath>`, `<m:oMathPara>`) to LaTeX.
3. Converts standalone **MathML** (`<math>`) to LaTeX.
4. Strips the leftover downlevel blocks, including the screenshot Word pairs
   with every equation.
5. Removes namespaced elements (`<o:p>`, `<w:*>`, `<v:*>`), inline styles,
   `mso-*` classes, `file://` images and empty paragraphs.

`options.renderMath: (latex, block) => string` — see
[Showing the maths](#showing-the-maths).

### `isWordHtml(html): boolean`

True for Word and Office clipboard HTML. A cheap string check — run it first so
ordinary pastes stay untouched.

### `hasWordMath(html): boolean`

True when the paste carries recoverable equations — OMML, Word's msEquation
fallback, or bare MathML.

### `stripInlineColors(html): string`

Drops `color` and `background-color` only, keeping `text-align` and everything
else. Safe to run on every paste.

### `ommlToLatex(omml): string`

Word's equation markup to a LaTeX string, on its own. Useful if you are reading
a `.docx` yourself — [`mammoth`](https://github.com/mwilliamson/mammoth.js)
has no equation support, so this fills that gap.

### `mathNodeHtml(latex, block): string`

The default equation renderer. Exported so you can wrap it.

### `escapeLatexAttr(latex)` · `escapeLatexText(latex)`

HTML-escape a LaTeX string for an attribute or for element text. Different jobs:
LaTeX contains `<` and `>`, which only need escaping in text position.

## Equations

**Supported OMML:** fractions, subscripts, superscripts, both together, radicals
and n-th roots, delimiters, n-ary operators (∑ ∫ ∏), named functions, upper and
lower limits, overline, accent, and matrices — plus the unicode maths glyphs
Word emits as plain text (× ÷ ≥ ≤ ≠ ± ∞ ⇒ π θ …), which KaTeX cannot read raw.

Equations land **inline** so they flow with the text instead of becoming
full-width centred bands. Switch a specific one to display in your editor.

## Limits

- **Word's bullet lists are not rebuilt.** Word pastes list items as styled
  `<p>` tags; this strips the styling but does not reconstruct `<ul>`/`<ol>`.
  [`tinymce-word-paste-filter`](https://www.npmjs.com/package/tinymce-word-paste-filter)
  does that part.
- **Images that live on the writer's disk are dropped.** Word points at
  `file:///C:/…`, which is a dead link on the web. `https:` and `data:` images
  are kept. The real image bytes arrive separately as `clipboardData.files` —
  uploading those is your app's job.
- **Browser only**, unless you supply jsdom as shown above.
- **Not a `.docx` reader.** This handles what Word puts on the clipboard.

## Why this exists

Clean Word paste is a paid feature nearly everywhere:

| | Free | Works outside its own editor | Equations |
| --- | --- | --- | --- |
| TinyMCE PowerPaste | No — paid subscriptions only | No | No |
| CKEditor paste-from-office-enhanced | No — premium | No | No |
| CKEditor paste-from-office | GPL or commercial | No | No |
| Tiptap Conversion | No — from $49/mo | No | — |
| tinymce-word-paste-filter | Yes | Yes | No |
| **wordpaste** | **Yes, MIT** | **Yes** | **Yes** |

## Contributing

Bug reports are welcome — please include the raw clipboard HTML that reproduces
it. Pull requests too; run `npm test` first.

New features are considered but not promised. This package is deliberately
small, and staying small is the point.

## Licence

[MIT](./LICENSE)
