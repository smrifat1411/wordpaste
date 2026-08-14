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
  <sub>Paste your own Word document into a real editor. Runs in your browser.</sub>
</p>

---

Paste from Word into a web editor and two things go wrong. You get a wall of
invisible Word styling, and every equation turns into a flat picture nobody can
edit again.

**wordpaste** is a JavaScript and TypeScript package that fixes both. It is one
function — HTML string in, clean HTML string out.

```js
import { transformPastedHTML } from 'wordpaste';

new Editor({ editorProps: { transformPastedHTML } });
```

- **Equations survive** as editable LaTeX instead of screenshots
- **2.4 kB gzipped**, zero dependencies, types included
- **One line** to integrate — no plugin or extension to write
- **Any editor**, any framework, or no framework at all

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Showing the maths](#showing-the-maths) — **read this if equations look wrong**
- [What it handles](#what-it-handles)
- [Editors](#editors) — [Tiptap](#tiptap) · [ProseMirror](#prosemirror) · [Lexical](#lexical) · [Vanilla JavaScript](#vanilla-javascript)
- [Frameworks](#frameworks) — [React](#react) · [Next.js](#nextjs) · [Vue](#vue)
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
import { transformPastedHTML } from 'wordpaste';
```

`transformPastedHTML` is named after ProseMirror's editor prop, so in Tiptap and
ProseMirror you pass it straight through. Anywhere else, call it with the
clipboard HTML and use what it returns.

It cleans Word and LibreOffice pastes, and strips pasted colour from everything
else so a Google Docs paste cannot smuggle black text into a dark theme.

## Showing the maths

An equation comes out like this:

```html
<span data-type="inline-math" data-latex="\frac{a}{b}">\frac{a}{b}</span>
```

The LaTeX is in the attribute **and** in the text. So if you do nothing, you see
the raw `\frac{a}{b}` on screen. That is deliberate — a visible clue beats a
blank space you cannot debug.

To make it look like maths, pick one:

**1. Tiptap** — install
[`@tiptap/extension-mathematics`](https://tiptap.dev/docs/editor/extensions/nodes/mathematics).
The output above is already its markup, so it just works.

**2. Any other editor** — render it with [KaTeX](https://katex.org) or MathJax:

```js
document.querySelectorAll('[data-latex]').forEach((el) => {
  katex.render(el.dataset.latex, el, {
    displayMode: el.dataset.type === 'block-math',
    throwOnError: false,
  });
});
```

**3. No renderer** — emit something else with the low-level API:

```js
import { cleanWordHtml } from 'wordpaste';

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
| Anything else | Colour only | — |

**Formatting:** bold, italic, underline, super/subscript, links, lists, tables
and `text-align` survive. Colour, highlight, font family and font size do not —
that is the point, so Word's design does not leak into your app.

**Your editor has to want `text-align`.** wordpaste emits
`style="text-align:center"`, but an editor drops any style its schema has no
rule for. In Tiptap that means adding
[`@tiptap/extension-text-align`](https://tiptap.dev/docs/editor/extensions/functionality/textalign).
Without it the alignment is discarded by the editor, not by wordpaste.

**Google Docs** writes no `mso-` markers, so the detector correctly says "not
Word" and leaves its HTML alone. Only the colour fix runs — which is the part
that matters, since Docs writes `color: rgb(0,0,0)` inline.

Its equations cannot be recovered by anyone: Docs puts them on the clipboard as
images already. Word is the unusual one — it sends the picture *and* the real
maths, which is the gap this package exploits.

---

# Editors

**This is where wordpaste plugs in.** Pick the section for the editor you use.

### Tiptap

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/tiptap.html)**

`editorProps` is a documented Tiptap option, typed as ProseMirror's
`EditorProps`. Pass the function and you are done.

```js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { transformPastedHTML } from 'wordpaste';

new Editor({
  element,
  extensions: [StarterKit],
  editorProps: { transformPastedHTML },
});
```

If you also use `@tiptap/extension-file-handler`, tell it to ignore Word's
screenshot when the HTML carries real maths — otherwise you get the equation
*and* a picture of it:

```js
import { hasWordMath } from 'wordpaste';

FileHandler.configure({
  onPaste: (editor, files, pasteContent) => {
    if (pasteContent && hasWordMath(pasteContent)) return;
    // …your normal image upload
  },
});
```

### ProseMirror

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/prosemirror.html)**

The same prop, because Tiptap is built on ProseMirror. ProseMirror's own docs
describe it as "for example to clean it up".

```js
import { EditorView } from 'prosemirror-view';
import { transformPastedHTML } from 'wordpaste';

new EditorView(element, { state, transformPastedHTML });
```

### Lexical

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/lexical.html)**

Lexical has no equivalent prop, so claim the paste command instead:

```js
import { PASTE_COMMAND, COMMAND_PRIORITY_HIGH, $getRoot, $insertNodes } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import { transformPastedHTML, isWordHtml, hasWordMath } from 'wordpaste';

editor.registerCommand(
  PASTE_COMMAND,
  (event) => {
    const html = event.clipboardData?.getData('text/html');
    if (!html || !(isWordHtml(html) || hasWordMath(html))) return false;

    event.preventDefault();
    const dom = new DOMParser().parseFromString(transformPastedHTML(html), 'text/html');

    editor.update(() => {
      $getRoot().selectEnd();
      $insertNodes($generateNodesFromDOM(editor, dom));
    });
    return true;
  },
  COMMAND_PRIORITY_HIGH,
);
```

Lexical's default nodes have no maths node, so an equation lands as its LaTeX
text — see [Showing the maths](#showing-the-maths).

### Vanilla JavaScript

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/vanilla.html)**

No editor library at all. The native paste event carries the HTML:

```js
import { transformPastedHTML } from 'wordpaste';

element.addEventListener('paste', (event) => {
  const html = event.clipboardData.getData('text/html');
  if (!html) return;

  event.preventDefault();
  document.execCommand('insertHTML', false, transformPastedHTML(html));
});
```

---

# Frameworks

**Your framework does not change the code.** wordpaste has no UI and no state —
it is a function. Wire it into your *editor* using a section above; these pages
only show where that code sits inside a component.

### React

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/react.html)**

```jsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { transformPastedHTML } from 'wordpaste';

export function WordEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    editorProps: { transformPastedHTML },
  });

  return <EditorContent editor={editor} />;
}
```

### Next.js

Same component, with one rule:

> **Importing wordpaste on the server is safe. Calling it there is not.**

Verified: importing the package in Node succeeds, but calling it outside a
browser throws `ReferenceError: DOMParser is not defined`.

So the editor component needs `'use client'` — which it needs anyway, since
paste is a browser event. You do **not** need `next/dynamic` or `ssr: false`;
the import is harmless because the package touches no DOM at module scope.

To clean HTML on the server on purpose — a background job, an API route —
supply a DOM first:

```js
import { JSDOM } from 'jsdom';
globalThis.DOMParser = new JSDOM().window.DOMParser;
```

### Vue

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/vue.html)**

```vue
<script setup>
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { transformPastedHTML } from 'wordpaste';

const editor = useEditor({
  extensions: [StarterKit],
  editorProps: { transformPastedHTML },
});
</script>

<template>
  <EditorContent :editor="editor" />
</template>
```

Svelte, Solid and Angular are the same — pick your editor above and put that
code wherever your component lives.

---

## API

### `transformPastedHTML(html): string`

The one you want. Cleans Word and LibreOffice HTML, and drops pasted colour from
everything else.

Takes no options on purpose: ProseMirror calls it as `(html, view)`, so extra
parameters would break passing it by reference. For more control, compose the
pieces below yourself.

### `cleanWordHtml(html, options?): string`

The full cleaner, without the colour pass. In order, it:

1. Unwraps Word's `<!--[if gte msEquation]-->` comments so the maths inside
   becomes live content.
2. Converts **OMML** (`<m:oMath>`, `<m:oMathPara>`) to LaTeX.
3. Converts standalone **MathML** (`<math>`) to LaTeX.
4. Strips the leftover downlevel blocks, including the screenshot Word pairs
   with every equation.
5. Removes namespaced elements (`<o:p>`, `<w:*>`, `<v:*>`), inline styles except
   `text-align`, `mso-*` classes, `file://` images and empty paragraphs.

`options.renderMath: (latex, block) => string` — see
[Showing the maths](#showing-the-maths).

### `isWordHtml(html): boolean`

True for Word and Office clipboard HTML. A cheap string check.

### `hasWordMath(html): boolean`

True when the paste carries recoverable equations — OMML, Word's msEquation
fallback, or bare MathML.

### `stripInlineColors(html): string`

Drops `color` and `background-color` only, keeping everything else.

### `ommlToLatex(omml): string`

Word's equation markup to a LaTeX string, on its own. Useful if you are reading
a `.docx` yourself — [`mammoth`](https://github.com/mwilliamson/mammoth.js) has
no equation support, so this fills that gap.

### `mathNodeHtml(latex, block)` · `escapeLatexAttr` · `escapeLatexText`

The default equation renderer and its HTML escapers.

## Equations

**Supported OMML:** fractions, subscripts, superscripts, both together, radicals
and n-th roots, delimiters, n-ary operators (∑ ∫ ∏), named functions, upper and
lower limits, overline, accent, and matrices — plus the unicode maths glyphs
Word emits as plain text (× ÷ ≥ ≤ ≠ ± ∞ ⇒ π θ …), which KaTeX cannot read raw.

Equations land **inline** so they flow with the text instead of becoming
full-width centred bands.

## Limits

- **Word's bullet lists are not rebuilt.** Word pastes list items as styled
  `<p>` tags; this strips the styling but does not reconstruct `<ul>`/`<ol>`.
  [`tinymce-word-paste-filter`](https://www.npmjs.com/package/tinymce-word-paste-filter)
  does that part.
- **Images on the writer's disk are dropped.** Word points at `file:///C:/…`,
  a dead link on the web. `https:` and `data:` images are kept. The real bytes
  arrive separately as `clipboardData.files` — uploading those is your app's job.
- **Browser only**, unless you supply jsdom as shown under Next.js.
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
