import type { EntryTypeDefinition, SectionEnvDefinition, SectionKey, TemplateId } from './types';
import { awesomeCvTemplate } from '../latex-templates/awesome-resume/adapter';

export interface TemplateBrowserCompatibility {
  engine: 'xelatex' | 'pdflatex' | 'lualatex';
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
  awesomeCvTemplate,
];

export const getTemplate = (templateId: TemplateId): TemplateRegistryEntry => {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);
  return template;
};
