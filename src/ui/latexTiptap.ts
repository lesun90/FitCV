import type { JSONContent } from '@tiptap/react';
import { LATEX_COLORS } from './latexUtils';

type Mark = { type: string; attrs?: Record<string, unknown> };

function hexForColorName(name: string): string | undefined {
  return LATEX_COLORS.find(c => c.name === name)?.hex;
}

export function colorNameForHex(hex: string): string | undefined {
  return LATEX_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

function applyMark(nodes: JSONContent[], mark: Mark): JSONContent[] {
  return nodes.map(node => ({
    ...node,
    marks: [...((node.marks as Mark[] | undefined) ?? []), mark],
  }));
}

function parseInlineNodes(source: string, start: number, stopAtBrace: boolean): { nodes: JSONContent[]; index: number } {
  const nodes: JSONContent[] = [];
  let cursor = start;
  let text = '';

  const flushText = () => {
    if (text) { nodes.push({ type: 'text', text }); text = ''; }
  };

  while (cursor < source.length) {
    const char = source[cursor];

    if (char === '}' && stopAtBrace) {
      flushText();
      return { nodes, index: cursor + 1 };
    }

    if (char !== '\\') {
      text += char;
      cursor += 1;
      continue;
    }

    const commandMatch = source.slice(cursor).match(/^\\([a-zA-Z]+|.)/);
    if (!commandMatch) { text += char; cursor += 1; continue; }

    const command = commandMatch[1];
    const afterCommand = cursor + commandMatch[0].length;

    if ((command === 'textbf' || command === 'textit' || command === 'underline') && source[afterCommand] === '{') {
      flushText();
      const group = parseInlineNodes(source, afterCommand + 1, true);
      const markType = command === 'textbf' ? 'bold' : command === 'textit' ? 'italic' : 'underline';
      nodes.push(...applyMark(group.nodes, { type: markType }));
      cursor = group.index;
      continue;
    }

    if (command === 'textcolor' && source[afterCommand] === '{') {
      const colorGroup = parseInlineNodes(source, afterCommand + 1, true);
      const colorName = colorGroup.nodes.map(n => (n.text as string | undefined) ?? '').join('').trim();
      const hex = hexForColorName(colorName);
      if (hex && source[colorGroup.index] === '{') {
        flushText();
        const contentGroup = parseInlineNodes(source, colorGroup.index + 1, true);
        nodes.push(...applyMark(contentGroup.nodes, { type: 'textStyle', attrs: { color: hex } }));
        cursor = contentGroup.index;
        continue;
      }
    }

    text += commandMatch[0];
    cursor = afterCommand;
  }

  flushText();
  return { nodes, index: cursor };
}

export function latexToTiptap(source: string): JSONContent {
  if (!source) return { type: 'doc', content: [{ type: 'paragraph' }] };
  const paragraphs = source.split('\n').map(line => {
    const { nodes } = parseInlineNodes(line, 0, false);
    return { type: 'paragraph', content: nodes.length ? nodes : undefined };
  });
  return { type: 'doc', content: paragraphs };
}

function serializeNode(node: JSONContent): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type !== 'text') return '';

  let result = (node.text as string | undefined) ?? '';
  for (const mark of (node.marks as Mark[] | undefined) ?? []) {
    if (mark.type === 'bold') result = `\\textbf{${result}}`;
    else if (mark.type === 'italic') result = `\\textit{${result}}`;
    else if (mark.type === 'underline') result = `\\underline{${result}}`;
    else if (mark.type === 'textStyle' && mark.attrs?.color) {
      const name = colorNameForHex(mark.attrs.color as string);
      if (name) result = `\\textcolor{${name}}{${result}}`;
    }
  }
  return result;
}

export function tiptapToLatex(doc: JSONContent): string {
  return (doc.content ?? [])
    .map(para => {
      if (para.type !== 'paragraph') return '';
      return (para.content ?? []).map(serializeNode).join('');
    })
    .join('\n');
}
