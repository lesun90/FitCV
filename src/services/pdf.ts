import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { renderLatexSource } from '../domain/latex';
import { runAtsChecks } from '../domain/checks';
import type { CompileArtifact, CvSubsectionHeading, FlexEntry, FlexSubSection, ResumeRecord } from '../domain/types';
import { getTemplate } from '../domain/templates';
import { getTemplateAdapter, renderAdapterLatexProject } from '../domain/templateAdapters';
import { createId } from '../domain/ids';
import { compileLatexProject as defaultCompileLatexProject, type LatexCompileResult } from './latexCompiler';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const compileResumeToPdf = async (
  resume: ResumeRecord,
  deps: { compileLatexProject?: typeof defaultCompileLatexProject } = {}
): Promise<CompileArtifact> => {
  const timestamp = new Date().toISOString();
  const adapter = getTemplateAdapter(resume.activeTemplateId);
  const latexProject = adapter?.renderLatexProject ? await renderAdapterLatexProject(resume) : undefined;
  const latexSource = latexProject?.latexSource ?? renderLatexSource(resume);
  const checks = runAtsChecks(resume);
  const blocked = checks.filter((check) => check.status === 'blocked');
  if (blocked.length > 0) {
    return {
      id: createId('artifact'),
      schemaVersion: 1,
      resumeId: resume.id,
      templateId: resume.activeTemplateId,
      resumeVersion: resume.version,
      status: 'failed',
      logs: blocked.map((check) => `${check.field}: ${check.message}`),
      latexSource,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  if (latexProject) {
    const template = getTemplate(resume.activeTemplateId);
    const compileLatexProject = deps.compileLatexProject ?? defaultCompileLatexProject;
    const result: LatexCompileResult = await compileLatexProject({
      files: latexProject.files,
      mainFile: latexProject.mainFile,
      engine: latexProject.engine
    });

    return {
      id: createId('artifact'),
      schemaVersion: 1,
      resumeId: resume.id,
      templateId: resume.activeTemplateId,
      resumeVersion: resume.version,
      status: result.status === 'success' ? 'clean' : 'failed',
      logs: [
        `Rendered adapter-backed LaTeX project for ${template.name}.`,
        ...latexProject.warnings,
        ...result.logs,
        ...result.diagnostics
      ],
      latexSource,
      pdfBlob: result.pdfBlob,
      generatedText: flattenResumeText(resume),
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  return {
    id: createId('artifact'),
    schemaVersion: 1,
    resumeId: resume.id,
    templateId: resume.activeTemplateId,
    resumeVersion: resume.version,
    status: 'failed',
    logs: ['No adapter available for this template.'],
    latexSource,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const generateThumbnailDataUrl = async (pdfBlob: Blob): Promise<string | undefined> => {
  if (typeof document === 'undefined') return undefined;
  try {
    const data = await pdfBlob.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch {
    return undefined;
  }
};

export const extractPdfText = async (file: File) => {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return pages.join('\n').trim();
};

const flattenResumeText = (resume: ResumeRecord) =>
  [
    resume.content.profile.fullName,
    resume.content.profile.email,
    resume.content.summary,
    ...resume.content.flexSections.flatMap((section) =>
      section.items.flatMap((item) => {
        if ('kind' in item) return [(item as CvSubsectionHeading).text];
        if ('environment' in item) {
          return (item as FlexSubSection).items.flatMap((entry) => {
            if ('kind' in entry) return [(entry as CvSubsectionHeading).text];
            return Object.values((entry as FlexEntry).fields).flatMap((v) => Array.isArray(v) ? v : [v]);
          });
        }
        return Object.values((item as FlexEntry).fields).flatMap((v) => Array.isArray(v) ? v : [v]);
      })
    ),
  ]
    .filter(Boolean)
    .join('\n');
