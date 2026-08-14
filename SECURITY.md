# Security

## wordpaste is not a sanitiser

This is the most important thing to know before using it.

`cleanWordHtml` and `transformPastedHTML` remove **Word's formatting junk**.
They do not remove dangerous markup. `<script>`, `<iframe>`, `<form>`, inline
event handlers such as `onclick` and `onerror`, and `javascript:` URLs all pass
through untouched.

That is deliberate — sanitising is a separate, hard problem that
[DOMPurify](https://github.com/cure53/DOMPurify) and
[sanitize-html](https://github.com/apostrophecms/sanitize-html) already solve
properly. Doing it badly here would be worse than not doing it.

### When this does not matter

If the output goes into **Tiptap, ProseMirror or Lexical**, their schema only
keeps nodes it knows about, so script tags and event handlers are dropped before
anything is rendered. This is the common case.

### When this matters

If you insert the output into the page yourself — `innerHTML`,
`insertAdjacentHTML`, `document.execCommand('insertHTML', …)`, or
`dangerouslySetInnerHTML` — you must sanitise first:

```js
import DOMPurify from 'dompurify';
import { transformPastedHTML } from 'wordpaste';

element.innerHTML = DOMPurify.sanitize(transformPastedHTML(html), {
  ADD_ATTR: ['data-latex', 'data-type'],
});
```

The `ADD_ATTR` entry keeps the equation attributes, which DOMPurify strips by
default.

This matters most when the pasted content is **stored and shown to other
people**. A payload someone pastes into their own browser is only self-XSS; the
same payload saved to a database and rendered for other users is stored XSS.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/smrifat1411/wordpaste/security/advisories/new)
on GitHub. Please do not open a public issue for a security problem.

Include the raw clipboard HTML that reproduces it — that is almost always enough
to confirm the behaviour.

## Supported versions

The latest published version is the only supported one. This package is small
enough that upgrading is cheap, and there are no long-term support branches.
