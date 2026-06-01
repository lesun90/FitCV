import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { formatPdfPreviewUrl, highlightLatexSource } from './latexUtils';

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
    expect(screen.getByRole('button', { name: 'Template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grammar check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse panels' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GitHub help' })).toBeInTheDocument();
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
