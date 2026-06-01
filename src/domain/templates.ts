import type { ResumeRecord, SectionKey, TemplateId } from './types';

export interface TemplateRegistryEntry {
  id: TemplateId;
  name: string;
  description: string;
  supportedSections: SectionKey[];
  requiredFields: string[];
  atsNotes: string[];
}

export const templates: TemplateRegistryEntry[] = [
  {
    id: 'classic-ats',
    name: 'Classic ATS',
    description: 'A sober one-column layout with standard labels and full section coverage.',
    supportedSections: ['summary', 'experience', 'education', 'projects', 'skills', 'awards', 'customSections'],
    requiredFields: ['content.profile.fullName', 'content.profile.email'],
    atsNotes: ['Uses standard section labels', 'Avoids decorative text boxes']
  },
  {
    id: 'modern-compact',
    name: 'Modern Compact',
    description: 'A tighter layout for concise resumes; projects and custom sections are preserved but not shown.',
    supportedSections: ['summary', 'experience', 'education', 'skills', 'awards'],
    requiredFields: ['content.profile.fullName', 'content.profile.email'],
    atsNotes: ['Compact spacing may reduce readability for dense histories', 'Projects are hidden in this template']
  }
];

export const getTemplate = (templateId: TemplateId) => {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return template;
};

export const analyzeTemplateCompatibility = (resume: ResumeRecord, templateId: TemplateId) => {
  const template = getTemplate(templateId);
  const unsupportedSections = resume.sectionOrder.filter((section) => !template.supportedSections.includes(section));
  const unsupportedWithContent = unsupportedSections.filter((section) => {
    const value = resume.content[section];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  return {
    template,
    unsupportedSections: unsupportedWithContent,
    missingRequiredFields: template.requiredFields.filter((field) => !readPath(resume, field))
  };
};

const readPath = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
