<h1 align="center">wordpaste</h1>

<p align="center">
  Clean Microsoft Word clipboard HTML — and keep the equations <b>editable</b>.
</p>

<p align="center">
  <a href="https://github.com/smrifat1411/wordpaste/actions/workflows/ci.yml"><img src="https://github.com/smrifat1411/wordpaste/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/wordpaste"><img src="https://img.shields.io/npm/v/wordpaste.svg" alt="npm version"></a>
  <a href="https://bundlejs.com/?q=wordpaste"><img src="https://img.shields.io/bundlejs/size/wordpaste" alt="minified and gzipped size"></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="zero dependencies">
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/wordpaste.svg" alt="MIT license"></a>
</p>

<p align="center">
  <b><a href="https://smrifat1411.github.io/wordpaste/">Try the live playground →</a></b><br>
  <sub>Paste your own document into a real editor. Runs in your browser.</sub>
</p>

---

Paste from Word into a web editor and two things go wrong. You get a wall of
invisible formatting, and every equation turns into a flat picture nobody can
edit again.

**wordpaste** is one function. Clipboard HTML in, clean HTML out.

```js
import { transformPastedHTML } from 'wordpaste';
```

You do not need to know where the paste came from. Word, LibreOffice, Outlook,
Excel, Google Docs — it handles all of them, and leaves ordinary HTML alone.

- **Equations survive** as editable LaTeX instead of screenshots
- **Lists become real lists**, nested, numbered by the browser again
- **3.6 kB gzipped**, zero dependencies, types included
- **One line** to wire into any editor
- JavaScript and TypeScript, no framework

## Contents

- [Install](#install)
- [Use it](#use-it) — [Tiptap](#tiptap) · [ProseMirror](#prosemirror) · [Lexical](#lexical) · [Vanilla JavaScript](#vanilla-javascript) · [React, Next.js, Vue](#react-nextjs-vue)
- [Showing the maths](#showing-the-maths) — **read this if equations look wrong**
- [What it handles](#what-it-handles)
- [Security](#security)
- [Limits](#limits)
- [Advanced](#advanced)
- [Why this exists](#why-this-exists)

## Install

```bash
npm install wordpaste
```

```bash
pnpm add wordpaste
```

```bash
yarn add wordpaste
```

```bash
bun add wordpaste
```

**No build step?** Import it straight from a CDN. Pin the version — an unpinned
URL is served from a stale browser cache after a release.

```html
<script type="module">
  import { transformPastedHTML } from 'https://esm.sh/wordpaste@0.10.0';
</script>
```

## Use it

One line, wherever your editor lets you see a paste. Every example below is a
single HTML file you can open and try.

### Tiptap

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/tiptap.html)**

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

`editorProps` is a documented Tiptap option, typed as ProseMirror's
`EditorProps`. There is no plugin or extension to write.

### ProseMirror

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/prosemirror.html)**

The same prop, because Tiptap is built on ProseMirror.

```js
import { EditorView } from 'prosemirror-view';
import { transformPastedHTML } from 'wordpaste';

new EditorView(element, { state, transformPastedHTML });
```

### Lexical

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/lexical.html)**

Lexical has no equivalent prop, so claim the paste command:

```js
import { PASTE_COMMAND, COMMAND_PRIORITY_HIGH, $getRoot, $insertNodes } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import { transformPastedHTML } from 'wordpaste';

editor.registerCommand(
  PASTE_COMMAND,
  (event) => {
    const html = event.clipboardData?.getData('text/html');
    if (!html) return false;

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

### Vanilla JavaScript

**[▶ Run this example](https://smrifat1411.github.io/wordpaste/examples/vanilla.html)**

No editor library. The native paste event carries the HTML:

```js
import { transformPastedHTML } from 'wordpaste';

element.addEventListener('paste', (event) => {
  const html = event.clipboardData.getData('text/html');
  if (!html) return;

  event.preventDefault();
  document.execCommand('insertHTML', false, transformPastedHTML(html));
});
```

This inserts HTML directly, so sanitise it before you store it or show it to
anyone else — see [Security](#security).

### React, Next.js, Vue

**[▶ React](https://smrifat1411.github.io/wordpaste/examples/react.html)** ·
**[▶ Vue](https://smrifat1411.github.io/wordpaste/examples/vue.html)**

wordpaste has no UI and no state — it is a function, and the line that uses it
is `editorProps: { transformPastedHTML }` in every framework. Only your editor's
binding package changes.

```jsx
// React — @tiptap/react
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

```vue
<!-- Vue 3 — @tiptap/vue-3 -->
<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3';
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

**Next.js:** importing wordpaste on the server is safe, but calling it there
throws `ReferenceError: DOMParser is not defined`. So the editor component needs
`'use client'` — which it needs anyway, since paste is a browser event. You do
not need `next/dynamic` or `ssr: false`.

To clean HTML on the server on purpose, supply a DOM first:

```js
import { JSDOM } from 'jsdom';
globalThis.DOMParser = new JSDOM().window.DOMParser;
```

## Showing the maths

An equation comes out like this:

```html
<span data-type="inline-math" data-latex="\frac{a}{b}">\frac{a}{b}</span>
```

The LaTeX is in the attribute **and** in the text. So if you do nothing, you see
the raw `\frac{a}{b}` on screen. That is deliberate — a visible clue beats a
blank space you cannot debug.

To make it look like maths, pick one:

**Tiptap** — install
[`@tiptap/extension-mathematics`](https://tiptap.dev/docs/editor/extensions/nodes/mathematics).
The output above is already its markup, so it just works.

**Anything else** — render it with [KaTeX](https://katex.org) or MathJax:

```js
document.querySelectorAll('[data-latex]').forEach((el) => {
  katex.render(el.dataset.latex, el, {
    displayMode: el.dataset.type === 'block-math',
    throwOnError: false,
  });
});
```

## What it handles

| You copy from | Formatting junk removed | Equations kept editable |
| --- | --- | --- |
| **Microsoft Word** | Yes | **Yes** — OMML |
| **LibreOffice Writer** | Yes | **Yes** — MathML |
| **Google Docs** | Yes | No |
| **Outlook** | Yes | n/a |
| **Excel** | Yes | n/a |
| Anything else | Colour only | — |

Bold, italic, underline, super/subscript, links, lists, tables and `text-align`
survive. Colour, highlight, font family and font size do not — that is the
point, so the source document's design does not leak into your app.

**Lists become real lists.** Word does not paste a list as a list — every item
is a `<p>` with the bullet or number sitting in the text as literal characters.
Strip the styling naively and you keep "1." and "2." frozen in place, so
reordering or inserting an item leaves the numbering wrong forever. wordpaste
reads Word's markers before discarding them and rebuilds `<ul>`/`<ol>`, with
nesting, the original sequence (`1.` `a.` `i.` `I.`) and a `start` when the list
does not begin at 1.

**Your editor has to want `text-align`.** wordpaste emits
`style="text-align:center"`, but an editor drops any style its schema has no
rule for. In Tiptap that means adding
[`@tiptap/extension-text-align`](https://tiptap.dev/docs/editor/extensions/functionality/textalign).

**Google Docs** needs its own handling. It wraps every paste in
`<b style="font-weight:normal">` — strip that style and the whole paste turns
bold. It also stores bold and italic as inline styles rather than tags, so those
become real `<strong>` and `<em>` before the fonts are dropped.

Its equations cannot be recovered by anyone: Docs puts them on the clipboard as
images already. Word is the unusual one — it sends the picture *and* the real
maths, which is the gap this package exploits.

## Security

**wordpaste is not a sanitiser.** It removes formatting junk, not dangerous
markup — `<script>`, `<iframe>`, inline `onclick`/`onerror` handlers and
`javascript:` URLs pass straight through.

Inside Tiptap, ProseMirror or Lexical their schema drops all of that before
rendering, so nothing more is needed. **If you insert the output yourself with
`innerHTML` or `insertHTML`, sanitise first:**

```js
import DOMPurify from 'dompurify';
import { transformPastedHTML } from 'wordpaste';

element.innerHTML = DOMPurify.sanitize(transformPastedHTML(html), {
  ADD_ATTR: ['data-latex', 'data-type'],
});
```

`ADD_ATTR` keeps the equation attributes, which DOMPurify strips by default.
See [SECURITY.md](./SECURITY.md).

## Limits

- **Images on the writer's disk are dropped.** Word points at `file:///C:/…`,
  a dead link on the web. `https:` and `data:` images are kept. The real bytes
  arrive separately as `clipboardData.files` — uploading those is your app's job.
- **Browser only**, unless you supply jsdom as shown under Next.js.
- **Not a `.docx` reader.** This handles what an editor puts on the clipboard.

## Advanced

Two extra exports for cases the main function does not cover. You will probably
never need them.

### `hasWordMath(html): boolean`

True when the paste carries recoverable equations. Word also puts a screenshot
of each equation on the clipboard as a file, so if you handle pasted images you
need to skip it — otherwise you get the equation *and* a picture of it:

```js
import { hasWordMath } from 'wordpaste';

FileHandler.configure({
  onPaste: (editor, files, pasteContent) => {
    if (pasteContent && hasWordMath(pasteContent)) return;
    // …your normal image upload
  },
});
```

### `ommlToLatex(omml): string`

Converts Word's equation markup to a LaTeX string on its own. This is for
reading a `.docx` **file**, not the clipboard —
[`mammoth`](https://github.com/mwilliamson/mammoth.js) has no equation support,
so this fills that gap.

Handles fractions, sub/superscripts, radicals, delimiters, n-ary operators
(∑ ∫ ∏), functions, limits, overline, accent and matrices, plus the unicode
maths glyphs Word emits as plain text.

## Why this exists

Clean Office paste is a paid feature nearly everywhere:

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
