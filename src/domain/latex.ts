import { getTemplate } from './templates';
import type { ProfileFieldKey, ResumeRecord, SectionKey } from './types';

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
  '^': '\\textasciicircum{}'
};

export const escapeLatex = (value: string) => value.replace(/[\\&%$#_{}~^]/g, (match) => replacements[match]);

export const renderLatexSource = (resume: ResumeRecord): string => {
  const template = getTemplate(resume.activeTemplateId);
  const profile = resume.content.profile;
  const visible = (field: ProfileFieldKey) => !(profile.hiddenFields ?? []).includes(field);
  const sections = resume.sectionOrder
    .filter((section) => !resume.hiddenSections.includes(section))
    .filter((section) => template.supportedSections.includes(section))
    .map((section) => renderSection(resume, section))
    .filter(Boolean)
    .join('\n\n');

  return [
    '\\documentclass[10pt]{article}',
    '\\usepackage[margin=0.65in]{geometry}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\begin{document}',
    `\\begin{center}{\\LARGE ${escapeLatex(visible('fullName') ? profile.fullName || resume.title : resume.title)}}\\\\`,
    escapeLatex([
      visible('email') ? profile.email : '',
      visible('phone') ? profile.phone : '',
      visible('location') ? profile.location : ''
    ].filter(Boolean).join(' | ')),
    '\\end{center}',
    sections,
    '\\end{document}'
  ].join('\n');
};

const renderSection = (resume: ResumeRecord, section: SectionKey) => {
  const content = resume.content;
  if (section === 'summary') {
    const highlights = visibleProfileHighlights(resume);
    if (!highlights.length) return '';
    return namedSection('Profile Highlight', highlights.map((line) => `\\item ${escapeLatex(line)}`).join('\n'));
  }
  if (section === 'experience' && content.experience.length) {
    return namedSection(
      'Experience',
      content.experience
        .map((item) => `\\textbf{${escapeLatex(item.role)}} -- ${escapeLatex(item.company)}\\\\\n${item.highlights.map((line) => `\\item ${escapeLatex(line)}`).join('\n')}`)
        .join('\n')
    );
  }
  if (section === 'education' && content.education.length) {
    return namedSection('Education', content.education.map((item) => `\\textbf{${escapeLatex(item.degree)}} -- ${escapeLatex(item.school)}`).join('\\\\\n'));
  }
  if (section === 'projects' && content.projects.length) {
    return namedSection('Projects', content.projects.map((item) => `\\textbf{${escapeLatex(item.name)}} -- ${escapeLatex(item.description)}`).join('\\\\\n'));
  }
  if (section === 'skills' && content.skills.length) {
    return namedSection('Skills', escapeLatex(content.skills.join(', ')));
  }
  if (section === 'awards' && content.awards.length) {
    return namedSection('Awards', escapeLatex(content.awards.join('; ')));
  }
  if (section === 'customSections' && content.customSections.length) {
    return content.customSections.map((item) => namedSection(item.title, escapeLatex(item.body))).join('\n');
  }
  return '';
};

const namedSection = (title: string, body: string) => `\\section*{${escapeLatex(title)}}\n${body}`;

export const visibleProfileHighlights = (resume: ResumeRecord) => {
  const highlights = resume.content.profileHighlights ?? [];
  if (highlights.length) return highlights.filter((item) => !item.hidden && item.text.trim()).map((item) => item.text.trim());
  return resume.content.summary.split(/\n+/).map((line) => line.trim()).filter(Boolean);
};
