import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { formatPdfPreviewUrl, highlightLatexSource } from './latexUtils';

vi.mock('../services/pdf', () => ({
  compileResumeToPdf: vi.fn(async () => ({
    id: 'artifact-test',
    schemaVersion: 1,
    resumeId: 'resume-test',
    templateId: 'awesome-cv',
    resumeVersion: 1,
    status: 'clean',
    logs: ['ok'],
    latexSource: '\\documentclass{article}',
    pdfBlob: new Blob(['pdf'], { type: 'application/pdf' }),
    generatedText: 'Ada Lovelace',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z'
  }))
}));

describe('FitCV UI shell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    window.history.pushState({}, '', '/');
    await indexedDB.deleteDatabase('fitcv-local-workbench');
  });

  it('presents the dashboard first, then opens the editor workbench and browser preview', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'My Resumes' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resume groups' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open Editor/i }));

    expect(screen.getByRole('region', { name: 'Editor workbench' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Browser PDF preview' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Preview actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grammar check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse panels' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GitHub help' })).toBeInTheDocument();
  });

  it('shows Awesome CV as a FitCV layout with module controls in the editor', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Editor/i }));

    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('awesome-cv');
    expect(screen.getByRole('option', { name: 'Awesome CV' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Classic ATS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Modern Compact' })).not.toBeInTheDocument();

    expect(await screen.findByRole('button', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Experience' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Space' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New page' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New page' }));

    expect(screen.getByRole('heading', { name: 'New page' })).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('clears compile busy state and surfaces errors when PDF compile throws', async () => {
    const { compileResumeToPdf } = await import('../services/pdf');
    vi.mocked(compileResumeToPdf).mockRejectedValueOnce(new Error('BusyTeX unavailable'));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Editor/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Compile' })[0]);

    expect(await screen.findByText('BusyTeX unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Compiling in browser')).not.toBeInTheDocument();
  });

  it('shows the standalone LaTeX editor route without linking from the main dashboard', async () => {
    window.history.pushState({}, '', '/latexeditor');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'LaTeX Workbench' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bundled LaTeX projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Awesome Resume/i })).toBeInTheDocument();
    expect(screen.getByText(/AGPL obligations accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My Resumes' })).not.toBeInTheDocument();
  });

  it('formats LaTeX source and PDF preview URLs for the focused editor UI', () => {
    const { container } = render(<pre>{highlightLatexSource('\\documentclass{article}\n% note')}</pre>);

    expect(container.querySelector('.latex-syntax-command')?.textContent).toBe('\\documentclass');
    expect(container.querySelector('.latex-syntax-brace')?.textContent).toBe('{');
    expect(container.querySelector('.latex-syntax-comment')?.textContent).toBe('% note');
    expect(formatPdfPreviewUrl('blob:fitcv-pdf')).toBe('blob:fitcv-pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitH');
  });
});
