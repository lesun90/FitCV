import type { LayoutModule, LatexProjectRenderResult, ResumeRecord, TemplateAdapter, TemplateKey } from './types';
import { awesomeCvAdapter, clampSpaceValue, defaultSpaceValue, MAX_SPACE_VALUE, MIN_SPACE_VALUE } from '../latex-templates/awesome-resume/adapter';

export type { LatexProjectRenderResult, TemplateAdapter };
export { clampSpaceValue, defaultSpaceValue, MAX_SPACE_VALUE, MIN_SPACE_VALUE };

const templateAdapters: TemplateAdapter[] = [awesomeCvAdapter];

export const getTemplateAdapter = (templateId: TemplateKey): TemplateAdapter | undefined =>
  templateAdapters.find((adapter) => adapter.id === templateId);

export const hasTemplateAdapter = (templateId: TemplateKey): boolean =>
  Boolean(getTemplateAdapter(templateId));

export const defaultLayoutForTemplate = (templateId: TemplateKey, resume: ResumeRecord): LayoutModule[] =>
  getTemplateAdapter(templateId)?.defaultLayout(resume) ?? [
    { id: 'module-summary', kind: 'section', section: 'summary', sectionType: 'summary-default', enabled: true },
  ];

export const normalizeLayoutModule = (module: LayoutModule): LayoutModule => {
  if (module.kind !== 'space') return module;
  return {
    ...module,
    value: clampSpaceValue(Number.isFinite(module.value) ? module.value : (module.size ? ({ small: 6, medium: 12, large: 18 }[module.size] ?? defaultSpaceValue) : defaultSpaceValue)),
  };
};

export const renderAdapterLatexProject = async (resume: ResumeRecord): Promise<LatexProjectRenderResult> => {
  const adapter = getTemplateAdapter(resume.activeTemplateId);
  if (!adapter?.renderLatexProject) throw new Error(`Template ${resume.activeTemplateId} does not provide a LaTeX adapter.`);
  const modules = (resume.templateLayouts[resume.activeTemplateId] ?? adapter.defaultLayout(resume)).map(normalizeLayoutModule);
  return adapter.renderLatexProject(resume, modules);
};
