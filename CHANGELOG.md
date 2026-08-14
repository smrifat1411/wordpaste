# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html); while the major
version is `0`, minor versions may change behaviour.

## Unreleased

### Changed

- Releases now publish from GitHub Actions using npm **trusted publishing**
  (OIDC). No token is stored anywhere, and npm attaches a provenance attestation
  linking each published version to the commit and workflow run that built it.
  Publishing is triggered by creating a GitHub Release; a release tag that
  disagrees with `package.json` fails the run.

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
