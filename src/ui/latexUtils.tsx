import type { CSSProperties, ReactNode } from 'react';

export const LATEX_COLORS: Array<{ label: string; name: string; hex: string }> = [
  { label: 'Gray', name: 'gray', hex: '#888888' },
  { label: 'Red', name: 'red', hex: '#cc2222' },
  { label: 'Blue', name: 'blue', hex: '#2255cc' },
  { label: 'Teal', name: 'teal', hex: '#007f7f' },
  { label: 'Orange', name: 'orange', hex: '#cc5500' },
  { label: 'Violet', name: 'violet', hex: '#7700cc' },
  { label: 'Olive', name: 'olive', hex: '#5a7000' },
];

export const formatPdfPreviewUrl = (url: string) =>
  url ? `${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH` : '';

export type LatexDiagnosticIssue = {
  id: string;
  title: string;
  detail: string;
  hint: string;
  filePath?: string;
  line?: number;
  excerpt?: string;
};

export const parseLatexDiagnostics = (input: { diagnostics: string[]; logs: string[] }): LatexDiagnosticIssue[] => {
  const issues: LatexDiagnosticIssue[] = [];
  const logs = input.logs.length ? input.logs : input.diagnostics;
  let activeFile: string | undefined;

  for (let index = 0; index < logs.length; index += 1) {
    const line = logs[index].trim();
    const filePath = extractLatexPath(line);
    if (filePath) activeFile = filePath;
    if (!line.startsWith('!')) continue;

    const nextLine = logs[index + 1]?.trim() ?? '';
    const lineMatch = nextLine.match(/^l\.(\d+)\s*(.*)$/);
    const lineNumber = lineMatch ? Number(lineMatch[1]) : undefined;
    const excerpt = lineMatch?.[2]?.trim() || undefined;
    const kind = classifyLatexError(line);

    issues.push({
      id: `${activeFile ?? 'unknown'}-${lineNumber ?? index}-${line}`,
      ...kind,
      detail: line.replace(/^!\s*/, ''),
      filePath: activeFile,
      line: lineNumber,
      excerpt
    });
  }

  if (!issues.length && input.diagnostics.length) {
    const joined = input.diagnostics.join('\n');
    const lineMatch = joined.match(/l\.(\d+)\s*([^\n]*)/);
    const first = input.diagnostics.find((item) => item.trim().startsWith('!')) ?? input.diagnostics[0];
    const kind = classifyLatexError(first);
    issues.push({
      id: `diagnostic-${first}`,
      ...kind,
      detail: first.replace(/^!\s*/, ''),
      line: lineMatch ? Number(lineMatch[1]) : undefined,
      excerpt: lineMatch?.[2]?.trim() || undefined
    });
  }

  return issues;
};

const extractLatexPath = (line: string): string | undefined => {
  const matches = [...line.matchAll(/\((?:\.\/)?([^()\s]+\.tex)\b/g)];
  return matches.at(-1)?.[1];
};

const classifyLatexError = (message: string): Pick<LatexDiagnosticIssue, 'title' | 'hint'> => {
  const normalized = message.toLowerCase();
  if (normalized.includes('undefined control sequence')) {
    return {
      title: 'Undefined command',
      hint: 'LaTeX does not recognize this command. Check for a typo, missing package, or command from the wrong template.'
    };
  }
  if (normalized.includes('file') && normalized.includes('not found')) {
    return {
      title: 'Missing file or package',
      hint: 'A referenced file, image, class, style, or package is missing. Check the path or include the required asset.'
    };
  }
  if (normalized.includes('missing }') || normalized.includes('extra }')) {
    return {
      title: 'Brace mismatch',
      hint: 'A command argument is not balanced. Count opening and closing braces near the reported line.'
    };
  }
  if (normalized.includes('runaway argument')) {
    return {
      title: 'Unclosed argument',
      hint: 'LaTeX kept reading because an argument was not closed. Look for a missing brace before this line.'
    };
  }
  return {
    title: 'LaTeX compile error',
    hint: 'Start at the reported line, then check the few lines above it. LaTeX often reports the failure just after the real typo.'
  };
};

export const highlightLatexSource = (source: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(\\[a-zA-Z@]+|\\.|%.*|[{}[\]]|\$+|&)/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));

    const token = match[0];
    const className = token.startsWith('%')
      ? 'latex-syntax-comment'
      : token.startsWith('\\')
        ? 'latex-syntax-command'
        : token === '{' || token === '}' || token === '[' || token === ']'
          ? 'latex-syntax-brace'
          : token.startsWith('$')
            ? 'latex-syntax-math'
            : 'latex-syntax-marker';

    nodes.push(<span className={className} key={`${className}-${index}`}>{token}</span>);
    cursor = match.index + token.length;
    index += 1;
  }

  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
};

export const renderRichLatexText = (source: string): ReactNode[] => {
  let key = 0;

  const nextKey = () => {
    key += 1;
    return `rich-preview-${key}`;
  };

  const colorForName = (name: string) => LATEX_COLORS.find((color) => color.name === name)?.hex;

  const parseGroup = (value: string, start: number): { nodes: ReactNode[]; index: number } | undefined => {
    if (value[start] !== '{') return undefined;
    return parse(value, start + 1, true);
  };

  const styledSpan = (
    className: string,
    nodes: ReactNode[],
    style?: CSSProperties
  ) => <span className={className} key={nextKey()} style={style}>{nodes}</span>;

  const parse = (value: string, start: number, stopAtClosingBrace: boolean): { nodes: ReactNode[]; index: number } => {
    const nodes: ReactNode[] = [];
    let cursor = start;

    while (cursor < value.length) {
      const char = value[cursor];
      if (char === '}' && stopAtClosingBrace) return { nodes, index: cursor + 1 };

      if (char !== '\\') {
        nodes.push(char);
        cursor += 1;
        continue;
      }

      const commandMatch = value.slice(cursor).match(/^\\([a-zA-Z]+|.)/);
      if (!commandMatch) {
        nodes.push(char);
        cursor += 1;
        continue;
      }

      const command = commandMatch[1];
      const afterCommand = cursor + commandMatch[0].length;

      if (command === 'textbf' || command === 'textit' || command === 'underline') {
        const group = parseGroup(value, afterCommand);
        if (!group) {
          nodes.push(commandMatch[0]);
          cursor = afterCommand;
          continue;
        }

        const className = command === 'textbf'
          ? 'rich-preview-bold'
          : command === 'textit'
            ? 'rich-preview-italic'
            : 'rich-preview-underline';
        nodes.push(styledSpan(className, group.nodes));
        cursor = group.index;
        continue;
      }

      if (command === 'textcolor') {
        const colorGroup = parseGroup(value, afterCommand);
        const contentGroup = colorGroup ? parseGroup(value, colorGroup.index) : undefined;
        if (!colorGroup || !contentGroup) {
          nodes.push(commandMatch[0]);
          cursor = afterCommand;
          continue;
        }

        const colorName = colorGroup.nodes.join('').trim();
        nodes.push(styledSpan('rich-preview-color', contentGroup.nodes, { color: colorForName(colorName) ?? colorName }));
        cursor = contentGroup.index;
        continue;
      }

      if (command.length === 1) {
        nodes.push(command);
      } else {
        nodes.push(commandMatch[0]);
      }
      cursor = afterCommand;
    }

    return { nodes, index: cursor };
  };

  return parse(source, 0, false).nodes;
};
