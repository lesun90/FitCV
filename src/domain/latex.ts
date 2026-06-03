import type { ProfileFieldKey, ResumeRecord } from './types';

const replacements: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

export const escapeLatex = (value: string) =>
  value.replace(/[\\&%$#_{}~^]/g, (match) => replacements[match]);

// For rich-text fields: leaves \ { } intact so LaTeX commands pass through,
// but still escapes & % $ # _ ~ ^ which appear in everyday text.
export const escapeLatexRichText = (value: string) =>
  value.replace(/[&%$#_~^]/g, (match) => replacements[match]);

export const renderLatexSource = (resume: ResumeRecord): string => {
  const profile = resume.content.profile;
  const visible = (field: ProfileFieldKey) => !(profile.hiddenFields ?? []).includes(field);

  return [
    '\\documentclass[10pt]{article}',
    '\\usepackage[margin=0.65in]{geometry}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\begin{document}',
    `\\begin{center}{\\LARGE ${escapeLatex(visible('fullName') ? profile.fullName || resume.title : resume.title)}}\\\\`,
    escapeLatex(
      [
        visible('email') ? profile.email : '',
        visible('phone') ? profile.phone : '',
        visible('location') ? profile.location : '',
      ]
        .filter(Boolean)
        .join(' | ')
    ),
    '\\end{center}',
    renderSummarySection(resume),
    '\\end{document}',
  ]
    .filter(Boolean)
    .join('\n');
};

const renderSummarySection = (resume: ResumeRecord): string => {
  const highlights = visibleProfileHighlights(resume);
  if (!highlights.length) return '';
  return [
    '\\section*{Profile}',
    ...highlights.map((line) => `\\item ${escapeLatexRichText(line)}`),
  ].join('\n');
};

export const visibleProfileHighlights = (resume: ResumeRecord) => {
  const highlights = resume.content.profileHighlights ?? [];
  if (highlights.length)
    return highlights.filter((item) => !item.hidden && item.text.trim()).map((item) => item.text.trim());
  return resume.content.summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
};
