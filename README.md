# wordpaste

Clean Microsoft Word clipboard HTML, and turn Word's equations into **editable
LaTeX** instead of pictures.

Editor-agnostic. Zero runtime dependencies. MIT.

```bash
npm install wordpaste
```

## Why

Paste from Word into a rich-text editor and you normally get a wall of `mso-`
styles, dead `file://` image links, and every equation flattened into a
screenshot you cannot edit.

Clean Word paste is a paid feature in the big editors — TinyMCE's PowerPaste is
["only available for paid TinyMCE subscriptions"](https://www.tiny.cloud/docs/tinymce/latest/introduction-to-powerpaste/),
and CKEditor's enhanced paste-from-Office is a premium tier. The free options do
not touch equations at all.

This does both parts, in any editor.

## Use

```ts
import { isWordHtml, cleanWordHtml, stripInlineColors } from 'wordpaste';

const clean = isWordHtml(html) ? cleanWordHtml(html) : html;
```

With TipTap:

```ts
editorProps: {
  transformPastedHTML(html) {
    return stripInlineColors(isWordHtml(html) ? cleanWordHtml(html) : html);
  },
},
```

## What `cleanWordHtml` does

1. Unwraps Word's `<!--[if gte msEquation]-->` conditional comments so the math
   inside becomes live content.
2. Converts **OMML** (`<m:oMath>`, `<m:oMathPara>` — Word's default clipboard
   math format) to LaTeX.
3. Converts standalone **MathML** (`<math>`) to LaTeX. LibreOffice pastes this,
   and so does Word when configured to.
4. Strips the leftover downlevel blocks — including the rasterized image Word
   pairs with every equation, so you get the editable equation rather than a
   picture of it.
5. Removes namespaced elements (`<o:p>`, `<w:*>`, `<v:*>`), inline styles,
   `mso-*` classes, dead `file://` images, and empty paragraphs.

## API

| Export | |
| --- | --- |
| `cleanWordHtml(html, options?)` | the main one |
| `isWordHtml(html)` | detect Word/Office clipboard HTML |
| `hasWordMath(html)` | true when equations are recoverable — use it to skip Word's fallback image on a file-paste handler |
| `stripInlineColors(html)` | drop pasted `color` / `background-color` only, keeping `text-align` and friends |
| `ommlToLatex(omml)` | the OMML → LaTeX walker on its own |
| `mathNodeHtml(latex, block)` | the default equation renderer |

### Equation markup

By default equations are emitted as
[`@tiptap/extension-mathematics`](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
markup — a plain span any editor can read:

```html
<span data-type="inline-math" data-latex="\frac{a}{b}"></span>
```

Pass your own renderer for anything else:

```ts
cleanWordHtml(html, {
  renderMath: (latex, block) => (block ? `$$${latex}$$` : `$${latex}$`),
});
```

Equations land **inline** so they flow with the text rather than becoming
full-width centered bands. Switch a specific one to display in your editor.

### Supported OMML

Fractions, sub/superscripts, radicals, delimiters, n-ary operators (∑ ∫ ∏),
named functions, upper and lower limits, overline, accent, and matrices — plus
the unicode maths glyphs Word emits as plain runs (×, ÷, ≥, ⇒, π, θ …), which
KaTeX cannot read raw. Scored 103/103 on a real exam paper of ~100 equations.

## Limits

- **Browser only.** It uses the native `DOMParser` and `querySelector`. In Node,
  set `globalThis.DOMParser` from [jsdom](https://github.com/jsdom/jsdom) —
  `@xmldom/xmldom` has no `querySelector`, so it is not a drop-in.
- **Word's fake bullet lists are not rebuilt.** Word pastes list items as styled
  `<p>` tags; this strips the styles but does not reconstruct `<ul>`/`<ol>`.
  [`tinymce-word-paste-filter`](https://www.npmjs.com/package/tinymce-word-paste-filter)
  does that part if you need it. Open an issue if you want it here.
- This does **not** read `.docx` files. It handles what Word puts on the
  clipboard.

## Licence

MIT
