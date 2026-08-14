import { describe, it, expect } from 'vitest';

import {
  cleanWordHtml,
  isWordHtml,
  hasWordMath,
  stripInlineColors,
  transformPastedHTML,
} from '../src/word-paste-cleaner.js';

// LaTeX appears twice: in `data-latex`, and as text so it degrades readably.
const inlineMath = (latex: string, text = latex) =>
  `<span data-type="inline-math" data-latex="${latex}">${text}</span>`;

describe('isWordHtml', () => {
  it('matches Word/Office clipboard markers', () => {
    expect(isWordHtml('<html xmlns:o="urn:schemas-microsoft-com:office">')).toBe(
      true,
    );
    expect(isWordHtml('<p style="mso-bidi-font-size:11pt">x</p>')).toBe(true);
    expect(isWordHtml('<!--[if gte mso 9]><xml><![endif]-->')).toBe(true);
  });

  it('does not match ordinary HTML', () => {
    expect(isWordHtml('<p>hello <b>world</b></p>')).toBe(false);
  });
});

describe('hasWordMath', () => {
  it('is true for OMML and for the msEquation fallback block', () => {
    expect(hasWordMath('<m:oMath><m:r>x</m:r></m:oMath>')).toBe(true);
    expect(hasWordMath('<!--[if gte msEquation 12]><math/><![endif]-->')).toBe(
      true,
    );
  });

  it('is true for bare MathML, which carries no mso- markers at all', () => {
    // LibreOffice pastes this; `isWordHtml` cannot see it.
    expect(isWordHtml('<math><mi>x</mi></math>')).toBe(false);
    expect(hasWordMath('<math><mi>x</mi></math>')).toBe(true);
    expect(hasWordMath('<math xmlns="http://www.w3.org/1998/Math/MathML"/>')).toBe(true);
  });

  it('is false for a Word paste with no equations', () => {
    expect(hasWordMath('<p class="MsoNormal">plain text</p>')).toBe(false);
  });

  it('does not match words that merely start with "math"', () => {
    expect(hasWordMath('<p>mathematics is hard</p>')).toBe(false);
    expect(hasWordMath('<div class="mathjax">x</div>')).toBe(false);
  });
});

describe('cleanWordHtml', () => {
  it('converts OMML to an editable math node', () => {
    expect(cleanWordHtml('<p><m:oMath><m:r>x</m:r></m:oMath></p>')).toBe(
      `<p>${inlineMath('x')}</p>`,
    );
  });

  it('converts a display equation (oMathPara) inline, not as a block band', () => {
    expect(
      cleanWordHtml('<m:oMathPara><m:oMath><m:r>x</m:r></m:oMath></m:oMathPara>'),
    ).toBe(inlineMath('x'));
  });

  it('converts standalone MathML', () => {
    expect(
      cleanWordHtml('<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>'),
    ).toBe(inlineMath('\\frac{a}{b}'));
  });

  it('unwraps the msEquation conditional comment so its math is converted', () => {
    expect(
      cleanWordHtml(
        '<!--[if gte msEquation 12]><math><mi>x</mi></math><![endif]-->',
      ),
    ).toBe(inlineMath('x'));
  });

  it("drops Word's rasterized equation fallback instead of keeping a picture", () => {
    // Word pairs every equation with a downlevel <![if !msEquation]> image.
    const html =
      '<m:oMath><m:r>x</m:r></m:oMath>' +
      '<![if !msEquation]><img src="https://cdn/equation.png"><![endif]>';
    expect(cleanWordHtml(html)).toBe(inlineMath('x'));
  });

  it('strips inline styles and mso-* classes', () => {
    expect(
      cleanWordHtml(
        '<p class="MsoNormal" style="mso-bidi-font-size:11pt">hi</p>',
      ),
    ).toBe('<p>hi</p>');
  });

  it('keeps text-align, which is layout the author chose', () => {
    expect(
      cleanWordHtml(
        '<p class="MsoNormal" style="text-align:center;mso-pagination:widow-orphan">title</p>',
      ),
    ).toBe('<p style="text-align:center">title</p>');
  });

  it('drops colour, font and size even when they sit beside text-align', () => {
    const out = cleanWordHtml(
      '<p style="text-align:right;color:red;font-family:Calibri;font-size:20pt">x</p>',
    );

    expect(out).toContain('text-align:right');
    expect(out).not.toMatch(/color|font-family|font-size/);
  });

  it('removes the attribute entirely when nothing survives', () => {
    expect(cleanWordHtml('<p style="mso-pagination:widow-orphan">x</p>')).toBe(
      '<p>x</p>',
    );
  });

  it('keeps a non-mso class', () => {
    expect(cleanWordHtml('<p class="intro">hi</p>')).toBe(
      '<p class="intro">hi</p>',
    );
  });

  it('removes namespace-prefixed leftovers such as <o:p>', () => {
    expect(cleanWordHtml('<p>a<o:p></o:p></p>')).toBe('<p>a</p>');
  });

  it('drops dead file:// images but keeps real ones', () => {
    expect(
      cleanWordHtml(
        '<img src="file:///C:/Users/x/clip.png"><img src="https://cdn/real.png">',
      ),
    ).toBe('<img src="https://cdn/real.png">');
  });

  it('escapes a LaTeX "<" so the fallback text cannot open a bogus tag', () => {
    // Assert the parsed result, not the raw string: HTML attribute
    // serialisation does not escape "<", so a DOM round-trip rewrites it back.
    const out = cleanWordHtml('<m:oMath><m:r>x&lt;y</m:r></m:oMath>');
    const el = new DOMParser()
      .parseFromString(out, 'text/html')
      .querySelector('[data-latex]');

    expect(el?.getAttribute('data-latex')).toBe('x<y');
    expect(el?.textContent).toBe('x<y');
    expect(el?.children.length).toBe(0);
  });

  it('honours a custom renderMath so non-TipTap editors can use it', () => {
    expect(
      cleanWordHtml('<m:oMath><m:r>x</m:r></m:oMath>', {
        renderMath: (latex, block) => (block ? `$$${latex}$$` : `$${latex}$`),
      }),
    ).toBe('$x$');
  });
});

describe('stripInlineColors', () => {
  it('drops colour but keeps the other declarations', () => {
    expect(
      stripInlineColors('<p style="color: rgb(0,0,0); text-align: center">x</p>'),
    ).toBe('<p style="text-align: center">x</p>');
  });

  it('drops background-color too', () => {
    expect(stripInlineColors('<p style="background-color: #fff">x</p>')).toBe(
      '<p>x</p>',
    );
  });

  it('returns HTML with no style attribute untouched', () => {
    expect(stripInlineColors('<p>x</p>')).toBe('<p>x</p>');
  });
});

describe('transformPastedHTML', () => {
  it('cleans a Word paste', () => {
    expect(
      transformPastedHTML(
        '<p class="MsoNormal" style="mso-bidi-font-size:11pt">hi<o:p></o:p></p>',
      ),
    ).toBe('<p>hi</p>');
  });

  it('converts equations', () => {
    expect(transformPastedHTML('<m:oMath><m:r>x</m:r></m:oMath>')).toBe(
      inlineMath('x'),
    );
  });

  it('catches bare MathML, which isWordHtml alone would miss', () => {
    expect(
      transformPastedHTML('<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>'),
    ).toBe(inlineMath('\\frac{a}{b}'));
  });

  it('leaves ordinary HTML alone apart from colour', () => {
    expect(
      transformPastedHTML('<p style="color:red;text-align:center">hi</p>'),
    ).toBe('<p style="text-align:center">hi</p>');
    expect(transformPastedHTML('<p><b>hi</b></p>')).toBe('<p><b>hi</b></p>');
  });

  it('ignores the second argument ProseMirror passes it', () => {
    const asProseMirrorCallsIt = transformPastedHTML as (
      html: string,
      view?: unknown,
    ) => string;

    expect(asProseMirrorCallsIt('<p>hi</p>', { some: 'view' })).toBe('<p>hi</p>');
  });
});
