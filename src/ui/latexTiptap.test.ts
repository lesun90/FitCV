import { describe, expect, it } from 'vitest';
import { colorNameForHex, latexToTiptap, tiptapToLatex } from './latexTiptap';

describe('latexTiptap conversion', () => {
  it('colorNameForHex maps known hex codes to LaTeX color names', () => {
    expect(colorNameForHex('#cc2222')).toBe('red');
    expect(colorNameForHex('#888888')).toBe('gray');
    expect(colorNameForHex('#CC2222')).toBe('red');
    expect(colorNameForHex('#ffffff')).toBeUndefined();
  });

  it('latexToTiptap returns an empty paragraph doc for empty input', () => {
    const doc = latexToTiptap('');
    expect(doc.type).toBe('doc');
    expect(doc.content?.[0]).toMatchObject({ type: 'paragraph' });
  });

  it('latexToTiptap parses plain text into a single paragraph node', () => {
    const doc = latexToTiptap('Hello world');
    expect(doc.type).toBe('doc');
    expect(doc.content?.[0].type).toBe('paragraph');
    expect(doc.content?.[0].content?.[0]).toMatchObject({ type: 'text', text: 'Hello world' });
  });

  it('latexToTiptap converts bold, italic, and underline to Tiptap marks', () => {
    const doc = latexToTiptap('\\textbf{Bold} \\textit{Italic} \\underline{Under}');
    const nodes = doc.content?.[0].content ?? [];
    const bold = nodes.find((n) => (n.marks as { type: string }[] | undefined)?.some((m) => m.type === 'bold'));
    const italic = nodes.find((n) => (n.marks as { type: string }[] | undefined)?.some((m) => m.type === 'italic'));
    const underline = nodes.find((n) => (n.marks as { type: string }[] | undefined)?.some((m) => m.type === 'underline'));
    expect(bold?.text).toBe('Bold');
    expect(italic?.text).toBe('Italic');
    expect(underline?.text).toBe('Under');
  });

  it('latexToTiptap converts textcolor to a textStyle mark with the hex value', () => {
    const doc = latexToTiptap('\\textcolor{red}{Colored}');
    const nodes = doc.content?.[0].content ?? [];
    const colored = nodes.find((n) => (n.marks as { type: string; attrs?: Record<string, unknown> }[] | undefined)?.some((m) => m.type === 'textStyle'));
    const mark = (colored?.marks as { type: string; attrs?: Record<string, unknown> }[] | undefined)?.find((m) => m.type === 'textStyle');
    expect(colored?.text).toBe('Colored');
    expect(mark?.attrs?.color).toBe('#cc2222');
  });

  it('tiptapToLatex serializes marks back to LaTeX commands', () => {
    const doc = latexToTiptap('\\textbf{Bold} and \\textit{Italic}');
    expect(tiptapToLatex(doc)).toBe('\\textbf{Bold} and \\textit{Italic}');
  });

  it('tiptapToLatex round-trips plain text without changes', () => {
    const source = 'Led Q4 launch for 12 vehicles.';
    expect(tiptapToLatex(latexToTiptap(source))).toBe(source);
  });

  it('tiptapToLatex serializes multi-line input across paragraph nodes', () => {
    const doc = latexToTiptap('Line one\nLine two');
    expect(tiptapToLatex(doc)).toBe('Line one\nLine two');
  });
});
