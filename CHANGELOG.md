# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html); while the major
version is `0`, minor versions may change behaviour.

## 0.10.1

### Fixed

- **The `hasWordMath` example lost pasted figures.** The documented `onPaste`
  handler bailed out of the entire paste whenever the content carried math, to
  dodge Word's rasterised copy of an equation. It discarded *every* picture to
  avoid one, so a question pasted out of Word arrived with its diagrams missing
  and nothing said so. Found in a real exam paper where the math-heavy questions
  had lost their figures.

  Nothing in the clipboard identifies which file is the equation screenshot:
  [`DataTransfer.files`](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files)
  documents no ordering and no relationship to the `text/html` flavour. So the
  README now says to upload every pasted file — an extra picture of an equation
  is visible and takes one click to remove, while a missing figure is invisible
  until someone sits the exam.

  Documentation only; no code changed. `hasWordMath` still does its real job,
  which is deciding whether to run the OMML conversion.

## 0.10.0

### Fixed

- **Word's line wrapping no longer becomes real line breaks.** Word pretty-prints
  the HTML it puts on the clipboard, so a sentence that merely *wraps* in the
  document window arrives with newlines inside a single text node. A browser
  collapses those when it renders, which is why this stayed invisible — until
  the editor is styled `white-space: pre-wrap`, which is Quill's default and
  common in Tiptap setups. There the author sees line breaks they never typed
  ([quill#1979](https://github.com/slab/quill/issues/1979)).

  Runs of whitespace in text nodes now collapse to a single space. `&nbsp;` is
  left alone — Word uses it for genuine spacing, and `\s` would have eaten it —
  and `<pre>`/`<textarea>` keep their whitespace, being the one place a source
  newline was meant to be a newline.

- **Server-side use needs only `DOMParser` again.** The documented Next.js setup
  supplies `globalThis.DOMParser` and nothing else, but the code also read
  `Node.TEXT_NODE`. Since `Node` is not a global there, every list or math paste
  threw `ReferenceError: Node is not defined` before any parsing began. The node
  type constants are now plain values.

## 0.9.0

### Changed

- **Lists become real lists.** Word does not paste a list as a list — every item
  is a `<p>` carrying `mso-list` styles, with the bullet or number sitting in the
  text as literal characters. Stripping the styling naively kept `1.` and `2.`
  frozen into the paragraph, so reordering or inserting an item left the
  numbering permanently wrong.

  wordpaste now reads those markers before discarding them and rebuilds
  `<ul>`/`<ol>`: ordered vs bulleted from the marker, the sequence read from the
  whole run so `i.` `ii.` is roman rather than alpha, nesting by `mso-list`
  level, and `start` preserved when a list does not begin at 1. `mso-list` also
  joined `isWordHtml`, which had been missing list-only fragments.

## 0.8.0

### Removed

- The public API is three functions instead of eleven. `isWordHtml`,
  `isGoogleDocsHtml`, `cleanWordHtml`, `cleanGoogleDocsHtml`,
  `stripInlineColors`, `mathNodeHtml`, `escapeLatexAttr` and `escapeLatexText`
  are now internal.

  Working out whether a paste came from Word or Google Docs was never the
  caller's job — `transformPastedHTML` does it. Exposing the routing made
  eleven decisions out of one, and every export is a promise to keep forever.

  `cleanWordHtml` went too: it took a `renderMath` option for custom equation
  markup, but being Word-only it silently skipped the Google Docs handling.
  If you need custom markup, open an issue and it comes back properly.

  Breaking, and deliberately done now — the package is days old and nothing
  depends on the old surface yet.

### Changed

- README leads with the one function. The two remaining extras are under
  Advanced, where a first-time reader will not trip over them.

## 0.7.0

### Added

- Google Docs now gets a real clean instead of only a colour fix.
  `isGoogleDocsHtml` and `cleanGoogleDocsHtml` are exported, and
  `transformPastedHTML` routes to them automatically.

  Docs wraps every paste in `<b style="font-weight:normal">`. Strip that style
  and the whole paste turns bold — the most common Docs paste bug there is. It
  is unwrapped before anything else touches it.

  Docs also carries bold and italic as inline styles rather than tags, so a
  blind style strip would have destroyed the formatting. Those become real
  `<strong>`, `<em>`, `<u>` and `<s>` first.

  A Docs paste now comes out around 64% smaller, against 12% before.

## 0.6.1

### Documentation

- The size badge on the npm page read "rate limited by upstream service" —
  bundlephobia has been unreliable. Switched to bundlejs, which reports the size.
- That badge says 2.5 kB while everything written said 2.4 kB. Both were true
  under different measurements, but they disagreed in public. Now 2.5 kB
  everywhere, matching what the badge shows.

## 0.6.0

### Fixed

- Units and words inside an equation now render upright instead of italic. Word
  marks these runs with `<m:nor/>` — `2.5 m`, `and`, `m/s` — and without it the
  metre in `y₁ = 2.5 m` came out as an italic variable. Those runs are now
  wrapped in `\text{}`.

  Found by running the converter over a real Word exam paper rather than
  hand-written samples: 8 of its 98 equations were affected.

## 0.5.1

### Documentation

- Added `SECURITY.md` and a Security section to the README. wordpaste removes
  Word's formatting junk, **not** dangerous markup — `<script>`, `<iframe>`,
  inline event handlers and `javascript:` URLs pass through. That is safe inside
  Tiptap, ProseMirror or Lexical, whose schemas drop them, but not if you insert
  the output with `innerHTML` yourself. Sanitise with DOMPurify in that case.

  No behaviour changed; this was always true and was simply undocumented.

## 0.5.0

### Added

- `transformPastedHTML(html)` — a ready-made paste handler that cleans Word and
  LibreOffice HTML and strips pasted colour from everything else. Named after
  ProseMirror's editor prop, so Tiptap and ProseMirror take it directly:
  `editorProps: { transformPastedHTML }`. Integration is now one line instead of
  a ten-line extension.
- Runnable single-file examples for React and Vue, alongside Tiptap,
  ProseMirror, Lexical and vanilla JavaScript.
- `npm run audit:docs`, run in CI: fails the build if a README anchor, relative
  link, example page or documented export does not match the code.

### Changed

- Documentation now separates **editors** (Tiptap, ProseMirror, Lexical,
  vanilla) from **frameworks** (React, Next.js, Vue). They are not alternatives
  to each other — wordpaste plugs into the editor, and the framework does not
  change the code.
- The playground's right-hand panel is a real Tiptap editor; equations can be
  clicked and edited.
- `examples/plain.html` is now `examples/vanilla.html`. The old path redirects.

### Note

The low-level exports (`cleanWordHtml`, `isWordHtml`, `hasWordMath`,
`stripInlineColors`) are unchanged. `transformPastedHTML` composes them; use
them directly when you need `renderMath` or a different guard.

## 0.4.0

### Changed

- `text-align` now survives a Word paste. Everything else in the `style`
  attribute is still removed. Alignment is layout the author chose, not Word
  decoration, and `stripInlineColors` already preserved it — the two disagreed.

  Word writes `text-align:justify` on justified paragraphs, so justified
  documents now arrive justified.

  Your editor must also understand the style: Tiptap drops it without
  [`@tiptap/extension-text-align`](https://tiptap.dev/docs/editor/extensions/functionality/textalign).

## 0.3.0

### Changed

- An equation now degrades to readable LaTeX instead of an empty element. The
  LaTeX is written as the element's text as well as into `data-latex`, so a
  project with no maths renderer sees `\frac{a}{b}` rather than a blank gap.
  Tiptap's maths nodes are atoms that read the attribute, so nothing changes
  when a renderer is installed.

### Fixed

- `escapeLatexAttr` did not escape `<` or `>`. LaTeX contains both (`x < y`,
  `\langle`). Both escapers now share `escapeLatexText`.

### Added

- `escapeLatexText` is exported.

## 0.2.0

### Fixed

- `hasWordMath` now matches bare `<math>`. LibreOffice pastes MathML with no
  `mso-` markers, so the documented guard
  `isWordHtml(html) ? cleanWordHtml(html) : html` silently skipped it and the
  MathML conversion never ran.

## 0.1.0

Initial release. `cleanWordHtml`, `isWordHtml`, `hasWordMath`,
`stripInlineColors`, `ommlToLatex`, `mathNodeHtml`.
