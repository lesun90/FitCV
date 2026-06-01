import type { ReactNode } from 'react';

export const formatPdfPreviewUrl = (url: string) =>
  url ? `${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH` : '';

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
