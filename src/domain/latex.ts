import { getTemplate } from './templates';
import type { ResumeRecord, SectionKey } from './types';

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
    `\\begin{center}{\\LARGE ${escapeLatex(resume.content.profile.fullName || resume.title)}}\\\\`,
    escapeLatex([resume.content.profile.email, resume.content.profile.phone, resume.content.profile.location].filter(Boolean).join(' | ')),
    '\\end{center}',
    sections,
    '\\end{document}'
  ].join('\n');
};

const renderSection = (resume: ResumeRecord, section: SectionKey) => {
  const content = resume.content;
  if (section === 'summary' && content.summary.trim()) {
    return namedSection('Summary', escapeLatex(content.summary));
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
