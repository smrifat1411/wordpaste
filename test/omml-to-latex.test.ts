import { describe, it, expect } from 'vitest';

import { ommlToLatex } from '../src/omml-to-latex.js';

describe('ommlToLatex', () => {
  it('reads run text wrapped in <m:t> (the .docx form)', () => {
    const omml =
      '<m:oMath><m:sSub><m:e><m:r><m:t>Z</m:t></m:r></m:e>' +
      '<m:sub><m:r><m:t>A</m:t></m:r></m:sub></m:sSub></m:oMath>';
    expect(ommlToLatex(omml)).toBe('{Z}_{A}');
  });

  it('reads run text stored directly in <m:r> (Word HTML-clipboard form, no <m:t>)', () => {
    const omml =
      '<m:oMath><m:sSub><m:e><m:r>Z</m:r></m:e>' +
      '<m:sub><m:r>A</m:r></m:sub></m:sSub></m:oMath>';
    expect(ommlToLatex(omml)).toBe('{Z}_{A}');
  });

  it('reads run text wrapped in HTML formatting (Word italicizes math vars → <i>)', () => {
    // Real Mac Word clipboard OMML wraps run text in <i>/<b>/<span>; the walker
    // must read it, not just <m:t> / direct text.
    const omml =
      '<m:oMath><m:sSub><m:e><m:r><i>Z</i></m:r></m:e>' +
      '<m:sub><m:r><i>A</i></m:r></m:sub></m:sSub></m:oMath>';
    expect(ommlToLatex(omml)).toBe('{Z}_{A}');
  });

  it('converts a real Mac Word clipboard equation (fraction + sub/sup, no <m:t>)', () => {
    const omml =
      '<m:oMath>' +
      '<m:sSub><m:e><m:r>Z</m:r></m:e><m:sub><m:r>A</m:r></m:sub></m:sSub>' +
      '<m:r>-</m:r>' +
      '<m:sSub><m:e><m:r>Z</m:r></m:e><m:sub><m:r>B</m:r></m:sub></m:sSub>' +
      '<m:r>=f</m:r>' +
      '<m:f><m:num><m:r>L</m:r>' +
      '<m:sSup><m:e><m:r>V</m:r></m:e><m:sup><m:r>2</m:r></m:sup></m:sSup>' +
      '</m:num><m:den><m:r>2gD</m:r></m:den></m:f>' +
      '</m:oMath>';
    expect(ommlToLatex(omml)).toBe('{Z}_{A}-{Z}_{B}=f\\frac{L{V}^{2}}{2gD}');
  });

  it('returns empty string for unparseable input', () => {
    expect(ommlToLatex('<m:oMath><m:r>x')).toBe('');
  });
});

// One case per branch of the `conv` switch. This is a parser shipped to
// strangers — every construct it claims to handle needs a check.
describe('ommlToLatex constructs', () => {
  const math = (inner: string) => `<m:oMath>${inner}</m:oMath>`;
  const run = (t: string) => `<m:r>${t}</m:r>`;

  it('f — fraction', () => {
    expect(
      ommlToLatex(
        math(`<m:f><m:num>${run('a')}</m:num><m:den>${run('b')}</m:den></m:f>`),
      ),
    ).toBe('\\frac{a}{b}');
  });

  it('sSubSup — subscript and superscript together', () => {
    expect(
      ommlToLatex(
        math(
          `<m:sSubSup><m:e>${run('x')}</m:e><m:sub>${run('a')}</m:sub><m:sup>${run('b')}</m:sup></m:sSubSup>`,
        ),
      ),
    ).toBe('{x}_{a}^{b}');
  });

  it('rad — square root when the degree is empty', () => {
    expect(
      ommlToLatex(math(`<m:rad><m:deg/><m:e>${run('x')}</m:e></m:rad>`)),
    ).toBe('\\sqrt{x}');
  });

  it('rad — n-th root when the degree is set', () => {
    expect(
      ommlToLatex(
        math(
          `<m:rad><m:deg>${run('3')}</m:deg><m:e>${run('x')}</m:e></m:rad>`,
        ),
      ),
    ).toBe('\\sqrt[3]{x}');
  });

  it('d — delimiter, default parentheses, arguments comma-joined', () => {
    expect(
      ommlToLatex(
        math(`<m:d><m:e>${run('a')}</m:e><m:e>${run('b')}</m:e></m:d>`),
      ),
    ).toBe('\\left( a,b \\right)');
  });

  it('d — braces are escaped for LaTeX', () => {
    expect(
      ommlToLatex(
        math(
          `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val="}"/></m:dPr><m:e>${run('x')}</m:e></m:d>`,
        ),
      ),
    ).toBe('\\left\\{ x \\right\\}');
  });

  it('nary — summation with limits', () => {
    expect(
      ommlToLatex(
        math(
          `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr>` +
            `<m:sub>${run('i=1')}</m:sub><m:sup>${run('n')}</m:sup><m:e>${run('x')}</m:e></m:nary>`,
        ),
      ),
    ).toBe('\\sum _{i=1}^{n}{x}');
  });

  it('nary — falls back to an integral when no operator is given', () => {
    expect(
      ommlToLatex(math(`<m:nary><m:e>${run('x')}</m:e></m:nary>`)),
    ).toBe('\\int {x}');
  });

  it('func — named function with its argument', () => {
    expect(
      ommlToLatex(
        math(
          `<m:func><m:fName>${run('sin')}</m:fName><m:e>${run('x')}</m:e></m:func>`,
        ),
      ),
    ).toBe('sin\\left(x\\right)');
  });

  it('limLow / limUpp — limit below and above', () => {
    expect(
      ommlToLatex(
        math(
          `<m:limLow><m:e>${run('lim')}</m:e><m:lim>${run('n')}</m:lim></m:limLow>`,
        ),
      ),
    ).toBe('lim_{n}');
    expect(
      ommlToLatex(
        math(
          `<m:limUpp><m:e>${run('lim')}</m:e><m:lim>${run('n')}</m:lim></m:limUpp>`,
        ),
      ),
    ).toBe('lim^{n}');
  });

  it('bar / acc — overline and hat', () => {
    expect(ommlToLatex(math(`<m:bar><m:e>${run('x')}</m:e></m:bar>`))).toBe(
      '\\overline{x}',
    );
    expect(ommlToLatex(math(`<m:acc><m:e>${run('x')}</m:e></m:acc>`))).toBe(
      '\\hat{x}',
    );
  });

  it('m — matrix rows and cells', () => {
    expect(
      ommlToLatex(
        math(
          `<m:m><m:mr><m:e>${run('a')}</m:e><m:e>${run('b')}</m:e></m:mr>` +
            `<m:mr><m:e>${run('c')}</m:e><m:e>${run('d')}</m:e></m:mr></m:m>`,
        ),
      ),
    ).toBe('\\begin{matrix} a & b \\\\ c & d \\end{matrix}');
  });

  it('m:nor — a run marked normal becomes upright text, not a variable', () => {
    // Units and words inside equations: "2.5 m" must not render as 2.5 times m.
    const omml = math(
      `${run('2.5')}<m:r><m:rPr><m:nor/></m:rPr><m:t xml:space="preserve"> m</m:t></m:r>`,
    );

    expect(ommlToLatex(omml)).toBe('2.5\\text{ m}');
  });

  it('leaves an ordinary run as a variable', () => {
    expect(ommlToLatex(math(run('x')))).toBe('x');
  });

  it('maps unicode maths glyphs KaTeX cannot read raw', () => {
    expect(ommlToLatex(math(run('a×b≥c')))).toBe('a\\times b\\geq c');
  });
});
