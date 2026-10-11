import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { transformPastedHTML } from '../src/index.js';

// Real clipboard dumps, not hand-written markup. Sources in fixtures/NOTICE.
// cwd-relative: under vitest's jsdom environment import.meta.url is not a file URL.
const fixture = (name: string) => readFileSync(`test/fixtures/${name}.html`, 'utf8');

const wordJunk = /mso-|<o:p|xmlns|class="Mso|<!\[if|<\?xml|<v:|<w:/i;

describe('real clipboard dumps', () => {
  it('Word 15 for Mac: three lists come back as real, nested lists', () => {
    const out = transformPastedHTML(fixture('word15-mac-lists'));
    expect(out).not.toMatch(wordJunk);
    expect(out.match(/<li>/g)).toHaveLength(10);
    expect(out).toContain(
      '<ol><li>Outline numbered 1<ol type="a"><li>Outline numbered 1.a</li>',
    );
    expect(out).toContain('<ul><li>Bulleted list 1</li>');
    expect(out).toContain('<p>This is normal text</p>');
  });

  it('Word 2007 for Windows: a table keeps its cells and loses the styling', () => {
    const out = transformPastedHTML(fixture('word12-win-table'));
    expect(out).not.toMatch(wordJunk);
    expect(out.match(/<td/g)).toHaveLength(4);
    expect(out).toContain('<p>Cell 1</p>');
    expect(out).not.toMatch(/ style=| class=/);
  });

  it('Word 2007 through Firefox: the junk goes, the items stay readable', () => {
    // Firefox rewrites style attributes through its CSS parser and drops every
    // mso-* property, so the list markers only survive as HTML comments and
    // there is no mso-list left to rebuild from. Known gap: these stay <p>.
    const out = transformPastedHTML(fixture('word12-win-lists'));
    expect(out).not.toMatch(wordJunk);
    expect(out.match(/<p>/g)).toHaveLength(6);
    expect(out).toContain('Item 1');
    expect(out).toContain('Item 6');
  });

  it('Excel 16 for Mac: formatting hidden in .xlNN classes becomes real tags', () => {
    const out = transformPastedHTML(fixture('excel16-mac-table'));
    expect(out).not.toMatch(wordJunk);
    expect(out).not.toMatch(/class=|xl\d|color|yellow|font-/);
    expect(out).toContain('<td height="21" width="87"><strong>Item</strong></td>');
    expect(out).toContain('<td width="87"><strong>Note</strong></td>');
    expect(out).toContain('<em>Apple</em>');
    expect(out).toContain('<u>Banana</u>');
    expect(out).toContain('<s>discontinued</s>');
    expect(out).toContain('line one<br> line two');
    expect(out).toContain('colspan="4" height="21" style="text-align:center">Merged across');
    expect(out.match(/<td/g)).toHaveLength(17);
  });

  it('Google Sheets: wrapper, stylesheet and bookkeeping go; formatting and the link stay', () => {
    const out = transformPastedHTML(fixture('google-sheets-table'));
    expect(out).not.toMatch(wordJunk);
    expect(out).not.toMatch(/<style|google-sheets|data-sheets|<div|class=|color|padding:/);
    expect(out).toContain('<td><strong>Item</strong></td>');
    expect(out).toContain('<td><em>Apple</em></td>');
    expect(out).toContain('<td><u>Banana</u></td>');
    expect(out).toContain('<td><s>discontinued</s></td>');
    expect(out).toContain('<td style="text-align:right">3</td>');
    expect(out).toContain('line one<br>line two');
    expect(out).toContain('style="text-align:center" rowspan="1" colspan="4">Merged across');
    expect(out).toContain(
      '<td><a href="https://example.com/" target="_blank">https://example.com</a></td>',
    );
  });
});
