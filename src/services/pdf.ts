import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { renderLatexSource } from '../domain/latex';
import { runAtsChecks } from '../domain/checks';
import type { CompileArtifact, ResumeRecord, SectionKey } from '../domain/types';
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

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const template = getTemplate(resume.activeTemplateId);
  let y = 744;

  const draw = (text: string, x = 54, size = 10, useBold = false) => {
    page.drawText(text.slice(0, 112), { x, y, size, font: useBold ? bold : font, color: rgb(0.08, 0.09, 0.1) });
    y -= size + 7;
  };

  draw(resume.content.profile.fullName || resume.title, 54, 18, true);
  draw([resume.content.profile.email, resume.content.profile.phone, resume.content.profile.location].filter(Boolean).join(' | '), 54, 9);
  y -= 8;
  for (const section of resume.sectionOrder) {
    if (resume.hiddenSections.includes(section) || !template.supportedSections.includes(section)) continue;
    drawSection(section, resume, draw);
    y -= 5;
  }

  const bytes = await pdf.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    id: createId('artifact'),
    schemaVersion: 1,
    resumeId: resume.id,
    templateId: resume.activeTemplateId,
    resumeVersion: resume.version,
    status: 'clean',
    logs: ['Generated browser PDF from structured resume data.', `Rendered LaTeX source for ${template.name}.`],
    latexSource,
    pdfBlob: new Blob([buffer], { type: 'application/pdf' }),
    generatedText: flattenResumeText(resume),
    createdAt: timestamp,
    updatedAt: timestamp
  };
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

const drawSection = (section: SectionKey, resume: ResumeRecord, draw: (text: string, x?: number, size?: number, bold?: boolean) => void) => {
  const title = section === 'customSections' ? 'Custom' : section[0].toUpperCase() + section.slice(1);
  const value = resume.content[section];
  if (Array.isArray(value) && value.length === 0) return;
  if (typeof value === 'string' && !value.trim()) return;
  draw(title, 54, 11, true);
  if (typeof value === 'string') draw(value, 62, 9);
  if (section === 'skills' || section === 'awards') draw((value as string[]).join(', '), 62, 9);
  if (section === 'experience') {
    resume.content.experience.forEach((item) => {
      draw(`${item.role} - ${item.company}`, 62, 9, true);
      item.highlights.forEach((line) => draw(`- ${line}`, 72, 8));
    });
  }
  if (section === 'education') resume.content.education.forEach((item) => draw(`${item.degree} - ${item.school}`, 62, 9, true));
  if (section === 'projects') resume.content.projects.forEach((item) => draw(`${item.name}: ${item.description}`, 62, 9, true));
  if (section === 'customSections') resume.content.customSections.forEach((item) => draw(`${item.title}: ${item.body}`, 62, 9, true));
};

const flattenResumeText = (resume: ResumeRecord) =>
  [
    resume.content.profile.fullName,
    resume.content.profile.email,
    resume.content.summary,
    ...resume.content.experience.flatMap((item) => [item.role, item.company, ...item.highlights]),
    ...resume.content.education.flatMap((item) => [item.degree, item.school]),
    ...resume.content.projects.flatMap((item) => [item.name, item.description]),
    ...resume.content.skills,
    ...resume.content.awards
  ]
    .filter(Boolean)
    .join('\n');
