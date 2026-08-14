<h1 align="center">wordpaste</h1>

<p align="center">
  Clean Microsoft Word clipboard HTML — and keep the equations <b>editable</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/wordpaste"><img src="https://img.shields.io/npm/v/wordpaste.svg" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/wordpaste"><img src="https://img.shields.io/bundlephobia/minzip/wordpaste.svg" alt="minzipped size"></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="zero dependencies">
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/wordpaste.svg" alt="MIT license"></a>
</p>

- **Equations survive.** Word's maths becomes editable LaTeX, not a screenshot.
- **Tiny.** 2.4 kB gzipped, zero dependencies.
- **Any editor.** Tiptap, Lexical, plain `contenteditable`. No framework.
- **One function.** HTML string in, clean HTML string out.

```js
import { isWordHtml, cleanWordHtml } from 'wordpaste';

const clean = isWordHtml(html) ? cleanWordHtml(html) : html;
```

## Contents

- [Install](#install)
- [The problem](#the-problem)
- [Integrations](#integrations) — [Tiptap](#tiptap) · [Lexical](#lexical) · [Plain JavaScript](#plain-javascript) · [React](#react) · [Node](#node--server-side)
- [API](#api)
- [Equations](#equations)
- [Limits](#limits)
- [Why this exists](#why-this-exists)
- [Contributing](#contributing)

## Install

```bash
npm install wordpaste
```

## The problem

Someone writes in Word. They copy. They paste into your editor. Four things
break:

- The HTML arrives full of `class="MsoNormal"`, `mso-bidi-font-size`,
  `font-family:Calibri` and empty `<o:p>` tags, so your editor now carries
  Word's design instead of yours.
- **Equations become pictures.** Word puts every equation on the clipboard
  twice — once as real maths (`<m:oMath>`) and once as a screenshot. Editors
  take the screenshot. The author can no longer fix a typo in their own formula.
- Images point at `file:///C:/Users/...`, a dead link on the web.
- Google Docs pastes `color: rgb(0,0,0)`, so on a dark theme the text is black
  on black.

Real input and output from this package:

```html
<!-- IN — what the browser hands your editor -->
<p class="MsoNormal" style="margin:0cm;mso-bidi-font-size:11.0pt;font-family:Calibri">
  Head loss is given by<o:p></o:p></p>
<p class="MsoNormal" style="mso-pagination:widow-orphan">
  <m:oMathPara><m:oMath>…</m:oMath></m:oMathPara>
  <![if !msEquation]><img src="file:///C:/Users/me/AppData/clip_image001.png"><![endif]>
</p>
```

```html
<!-- OUT -->
<p>Head loss is given by</p>
<p><span data-type="inline-math" data-latex="{Z}_{A}=f\frac{L{V}^{2}}{2gD}"></span></p>
```

The junk is gone, the dead image is gone, and the equation survived as LaTeX the
author can still edit.

## Integrations

Wire it wherever your editor lets you see pasted HTML before it is parsed.

### Tiptap

`transformPastedHTML` is a documented top-level method on a
[custom extension](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new).

```js
import { Extension } from '@tiptap/core';
import { isWordHtml, hasWordMath, cleanWordHtml, stripInlineColors } from 'wordpaste';

export const WordPaste = Extension.create({
  name: 'wordPaste',
  transformPastedHTML(html) {
    // Word gets the full clean; everything else at least loses its colour,
    // so a Google Docs paste cannot smuggle black text into a dark theme.
    return stripInlineColors(isWordHtml(html) ? cleanWordHtml(html) : html);
  },
});
```

Add `WordPaste` to your `extensions` array. It pairs with
[`@tiptap/extension-mathematics`](https://tiptap.dev/docs/editor/extensions/nodes/mathematics),
whose markup this package emits by default.

If you use `@tiptap/extension-file-handler`, tell it to ignore Word's screenshot
when the HTML carries real maths — otherwise you get both:

```js
onPaste: (editor, files, pasteContent) => {
  if (pasteContent && hasWordMath(pasteContent)) return;
  // …your normal image upload
},
```

### Lexical

Lexical's [DOM import](https://lexical.dev/docs/serialization/dom-import) lets
you claim `text/html` and see the raw string. Clean it before parsing:

```js
configExtension(ClipboardImportExtension, {
  $importMimeType: {
    'text/html': [
      (html, selection, _$next, dataTransfer) => {
        const clean = isWordHtml(html) ? cleanWordHtml(html) : html;
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

### Plain JavaScript

No editor library needed — the native paste event carries the HTML:

```js
element.addEventListener('paste', (event) => {
  const html = event.clipboardData?.getData('text/html');
  if (!html || !isWordHtml(html)) return;

  event.preventDefault();
  document.execCommand('insertHTML', false, cleanWordHtml(html));
});
```

### React

Nothing extra to install. There is no React build and none is needed — this
package has no UI and no state, so a React wrapper would only add a layer.
Use whichever editor you use above; the code is identical.

### Node / server-side

The parser uses the browser's `DOMParser` and `querySelector`. In Node, supply
one from [jsdom](https://github.com/jsdom/jsdom):

```js
import { JSDOM } from 'jsdom';
globalThis.DOMParser = new JSDOM().window.DOMParser;
```

`@xmldom/xmldom` will not work — it has no `querySelector`.

## API

### `cleanWordHtml(html, options?): string`

The main one. Runs the full pipeline:

1. Unwraps Word's `<!--[if gte msEquation]-->` comments so the maths inside
   becomes live content.
2. Converts **OMML** (`<m:oMath>`, `<m:oMathPara>` — Word's default clipboard
   maths format) to LaTeX.
3. Converts standalone **MathML** (`<math>`) to LaTeX. LibreOffice pastes this,
   and so does Word when configured to.
4. Strips the leftover downlevel blocks, including the screenshot Word pairs
   with every equation.
5. Removes namespaced elements (`<o:p>`, `<w:*>`, `<v:*>`), inline styles,
   `mso-*` classes, `file://` images and empty paragraphs.

`options.renderMath` — see [Equations](#equations).

### `isWordHtml(html): boolean`

True for Word and Office clipboard HTML. A cheap string check — run it first so
ordinary pastes stay untouched.

### `hasWordMath(html): boolean`

True when the paste carries recoverable equations. Use it to skip Word's
screenshot in a file-paste handler, as shown in [Tiptap](#tiptap).

### `stripInlineColors(html): string`

Drops `color` and `background-color` only, keeping `text-align` and everything
else. Google Docs carries no `mso-` markers, so `isWordHtml` will not catch it —
run this on **every** paste to protect a dark theme.

### `ommlToLatex(omml): string`

Word's equation markup to a LaTeX string, on its own. Useful if you are reading
a `.docx` yourself.

### `mathNodeHtml(latex, block): string`

The default equation renderer. Exported so you can wrap it.

## Equations

By default an equation becomes
[`@tiptap/extension-mathematics`](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
markup — a plain span any editor can read:

```html
<span data-type="inline-math" data-latex="\frac{a}{b}"></span>
```

Pass your own renderer for anything else:

```js
cleanWordHtml(html, {
  renderMath: (latex, block) => (block ? `$$${latex}$$` : `$${latex}$`),
});
```

Equations land **inline** so they flow with the text instead of becoming
full-width centred bands. Switch a specific one to display in your editor.

**Supported OMML:** fractions, subscripts, superscripts, both together,
radicals and n-th roots, delimiters, n-ary operators (∑ ∫ ∏), named functions,
upper and lower limits, overline, accent, matrices — plus the unicode maths
glyphs Word emits as plain text (× ÷ ≥ ≤ ≠ ± ∞ ⇒ π θ …), which KaTeX cannot read
raw.

## Limits

- **Word's bullet lists are not rebuilt.** Word pastes list items as styled
  `<p>` tags; this strips the styling but does not reconstruct `<ul>`/`<ol>`.
  [`tinymce-word-paste-filter`](https://www.npmjs.com/package/tinymce-word-paste-filter)
  does that part. Open an issue if you want it here.
- **Browser only**, unless you supply jsdom as shown above.
- **Not a `.docx` reader.** This handles what Word puts on the clipboard. For
  files, use [`mammoth`](https://github.com/mwilliamson/mammoth.js) — and note it
  has no equation support, so `ommlToLatex` is useful alongside it.

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

Bug reports are welcome — please include the raw clipboard HTML that
reproduces it. Pull requests are welcome too; run `npm test` before opening one.

New features are considered but not promised. This package is deliberately
small, and staying small is the point.

## Licence

[MIT](./LICENSE)
