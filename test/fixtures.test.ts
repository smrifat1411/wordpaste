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
});
