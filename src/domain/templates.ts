import type { ResumeRecord, SectionKey, TemplateId } from './types';

export interface TemplateSchemaField {
  path: string;
  label: string;
  section: SectionKey | 'profile';
  required?: boolean;
}

export interface TemplateRenderMapping {
  fieldPath: string;
  latexTarget: string;
}

export interface TemplateValidationRule {
  id: string;
  fieldPath: string;
  severity: 'blocked' | 'warning';
  message: string;
}

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
  supportedSections: SectionKey[];
  requiredFields: string[];
  atsNotes: string[];
  schema: {
    fields: TemplateSchemaField[];
  };
  renderMapping: TemplateRenderMapping[];
  validationRules: TemplateValidationRule[];
  browserCompatibility: TemplateBrowserCompatibility;
  fixture: TemplateFixtureReference;
}

const baseFields: TemplateSchemaField[] = [
  { path: 'content.profile.fullName', label: 'Full name', section: 'profile', required: true },
  { path: 'content.profile.email', label: 'Email', section: 'profile', required: true },
  { path: 'content.profile.phone', label: 'Phone', section: 'profile' },
  { path: 'content.profile.location', label: 'Location', section: 'profile' },
  { path: 'content.profile.linkedin', label: 'LinkedIn', section: 'profile' },
  { path: 'content.summary', label: 'Summary', section: 'summary' },
  { path: 'content.experience', label: 'Experience', section: 'experience' },
  { path: 'content.education', label: 'Education', section: 'education' },
  { path: 'content.skills', label: 'Skills', section: 'skills' },
  { path: 'content.awards', label: 'Awards', section: 'awards' }
];

const profileRenderMapping: TemplateRenderMapping[] = [
  { fieldPath: 'content.profile.fullName', latexTarget: 'header.name' },
  { fieldPath: 'content.profile.email', latexTarget: 'header.email' },
  { fieldPath: 'content.profile.phone', latexTarget: 'header.phone' },
  { fieldPath: 'content.profile.location', latexTarget: 'header.location' },
  { fieldPath: 'content.profile.linkedin', latexTarget: 'header.linkedin' },
  { fieldPath: 'content.summary', latexTarget: 'section.summary' }
];

const requiredProfileRules: TemplateValidationRule[] = [
  {
    id: 'required-full-name',
    fieldPath: 'content.profile.fullName',
    severity: 'blocked',
    message: 'Full name is required before exporting this template.'
  },
  {
    id: 'recommended-email',
    fieldPath: 'content.profile.email',
    severity: 'warning',
    message: 'Email should be present for ATS-readable contact information.'
  }
];

export const templates: TemplateRegistryEntry[] = [
  {
    id: 'classic-ats',
    name: 'Classic ATS',
    description: 'A sober one-column layout with standard labels and full section coverage.',
    supportedSections: ['summary', 'experience', 'education', 'projects', 'skills', 'awards', 'customSections'],
    requiredFields: ['content.profile.fullName', 'content.profile.email'],
    atsNotes: ['Uses standard section labels', 'Avoids decorative text boxes'],
    schema: {
      fields: [
        ...baseFields,
        { path: 'content.projects', label: 'Projects', section: 'projects' },
        { path: 'content.customSections', label: 'Custom sections', section: 'customSections' }
      ]
    },
    renderMapping: [
      ...profileRenderMapping,
      { fieldPath: 'content.experience', latexTarget: 'section.experience' },
      { fieldPath: 'content.education', latexTarget: 'section.education' },
      { fieldPath: 'content.projects', latexTarget: 'section.projects' },
      { fieldPath: 'content.skills', latexTarget: 'section.skills' },
      { fieldPath: 'content.awards', latexTarget: 'section.awards' },
      { fieldPath: 'content.customSections', latexTarget: 'section.customSections' }
    ],
    validationRules: requiredProfileRules,
    browserCompatibility: {
      engine: 'pdf-lib',
      notes: ['Generated client-side through the structured resume PDF pipeline.']
    },
    fixture: {
      sampleResumeId: 'sample-classic-ats',
      expectedText: ['Ada Lovelace', 'Experience', 'Skills']
    }
  },
  {
    id: 'modern-compact',
    name: 'Modern Compact',
    description: 'A tighter layout for concise resumes; projects and custom sections are preserved but not shown.',
    supportedSections: ['summary', 'experience', 'education', 'skills', 'awards'],
    requiredFields: ['content.profile.fullName', 'content.profile.email'],
    atsNotes: ['Compact spacing may reduce readability for dense histories', 'Projects are hidden in this template'],
    schema: {
      fields: baseFields
    },
    renderMapping: [
      ...profileRenderMapping,
      { fieldPath: 'content.experience', latexTarget: 'section.experience.compact' },
      { fieldPath: 'content.education', latexTarget: 'section.education.compact' },
      { fieldPath: 'content.skills', latexTarget: 'section.skills.compact' },
      { fieldPath: 'content.awards', latexTarget: 'section.awards.compact' }
    ],
    validationRules: requiredProfileRules,
    browserCompatibility: {
      engine: 'pdf-lib',
      notes: ['Generated client-side through the structured resume PDF pipeline.', 'Projects and custom sections are intentionally hidden.']
    },
    fixture: {
      sampleResumeId: 'sample-modern-compact',
      expectedText: ['Ada Lovelace', 'Experience', 'Skills']
    }
  },
  {
    id: 'awesome-cv',
    name: 'Awesome CV',
    description: 'A polished LaTeX layout with module-based spacing and page breaks.',
    supportedSections: ['summary', 'experience', 'education', 'projects', 'skills', 'awards'],
    requiredFields: ['content.profile.fullName', 'content.profile.email'],
    atsNotes: ['Uses richer visual styling than Classic ATS', 'Custom sections are preserved but not shown in the first adapter'],
    schema: {
      fields: [
        ...baseFields,
        { path: 'content.projects', label: 'Projects', section: 'projects' }
      ]
    },
    renderMapping: [
      ...profileRenderMapping,
      { fieldPath: 'content.experience', latexTarget: 'awesome.section.experience' },
      { fieldPath: 'content.education', latexTarget: 'awesome.section.education' },
      { fieldPath: 'content.projects', latexTarget: 'awesome.section.projects' },
      { fieldPath: 'content.skills', latexTarget: 'awesome.section.skills' },
      { fieldPath: 'content.awards', latexTarget: 'awesome.section.honors' }
    ],
    validationRules: requiredProfileRules,
    browserCompatibility: {
      engine: 'xelatex',
      notes: ['Generated as an adapter-backed BusyTeX project from structured resume data.', 'Uses bundled Awesome CV class, style, and font assets.']
    },
    fixture: {
      sampleResumeId: 'sample-awesome-cv',
      expectedText: ['Ada Lovelace', 'Work Experience', 'Skills']
    }
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

export const validateTemplateRegistry = (registry: TemplateRegistryEntry[]) => {
  const errors: string[] = [];

  for (const template of registry) {
    if (template.schema.fields.length === 0) errors.push(`${template.id}: schema must expose at least one field`);
    if (template.renderMapping.length === 0) errors.push(`${template.id}: render mapping must not be empty`);
    if (template.validationRules.length === 0) errors.push(`${template.id}: validation rules must not be empty`);
    if (!template.browserCompatibility.engine) errors.push(`${template.id}: browser compatibility engine is required`);
    if (!template.fixture.sampleResumeId) errors.push(`${template.id}: sample fixture reference is required`);

    const schemaPaths = new Set(template.schema.fields.map((field) => field.path));
    for (const requiredField of template.requiredFields) {
      if (!schemaPaths.has(requiredField)) errors.push(`${template.id}: required field ${requiredField} is missing from schema`);
    }
    for (const mapping of template.renderMapping) {
      if (!schemaPaths.has(mapping.fieldPath)) errors.push(`${template.id}: render mapping references unknown field ${mapping.fieldPath}`);
    }
  }

  return errors;
};

const readPath = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
