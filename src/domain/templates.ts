import type { EntryTypeDefinition, SectionEnvDefinition, SectionKey, TemplateId } from './types';
import { awesomeCvTemplate } from '../latex-templates/awesome-resume/adapter';

export interface TemplateBrowserCompatibility {
  engine: 'pdf-lib' | 'xelatex' | 'pdflatex' | 'lualatex';
  notes: string[];
}

export interface TemplateFixtureReference {
  sampleResumeId: string;
  expectedText: string[];
}

export interface TemplateRegistryEntry {
  id: TemplateId;
  name: string;
  description: string;
  browserCompatibility: TemplateBrowserCompatibility;
  fixture: TemplateFixtureReference;
  pinnedSections?: SectionKey[];
  sectionEnvs?: SectionEnvDefinition[];
  entryTypes?: EntryTypeDefinition[];
}

export const templates: TemplateRegistryEntry[] = [
  {
    id: 'classic-ats',
    name: 'Classic ATS',
    description: 'A sober one-column layout with standard labels. Generated client-side via the PDF pipeline.',
    browserCompatibility: { engine: 'pdf-lib', notes: ['Generated client-side through the structured resume PDF pipeline.'] },
    fixture: { sampleResumeId: 'sample-classic-ats', expectedText: ['Ada Lovelace'] },
  },
  {
    id: 'modern-compact',
    name: 'Modern Compact',
    description: 'A tighter layout for concise resumes. Generated client-side via the PDF pipeline.',
    browserCompatibility: { engine: 'pdf-lib', notes: ['Generated client-side through the structured resume PDF pipeline.'] },
    fixture: { sampleResumeId: 'sample-modern-compact', expectedText: ['Ada Lovelace'] },
  },
  awesomeCvTemplate,
];

export const getTemplate = (templateId: TemplateId): TemplateRegistryEntry => {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);
  return template;
};
