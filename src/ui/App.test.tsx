import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { formatPdfPreviewUrl, highlightLatexSource, renderRichLatexText } from './latexUtils';

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
  })),
  generateThumbnailDataUrl: vi.fn(async () => undefined)
}));

vi.mock('../services/latexCompiler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/latexCompiler')>();
  return {
    ...actual,
    warmUpLatexRunner: vi.fn()
  };
});

vi.mock('../services/latexTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/latexTemplates')>();
  return {
    ...actual,
    loadBundledLatexProject: vi.fn(async () => ({
      id: 'awesome-resume',
      displayName: 'Awesome Resume',
      rootPath: 'src/latex-templates/awesome-resume',
      readOnly: false,
      mainFileCandidates: ['resume.tex'],
      files: [
        { kind: 'text', path: 'resume.tex', contents: '\\documentclass{article}\\begin{document}Ada\\end{document}' },
        { kind: 'text', path: 'resume/projects.tex', contents: '\\cvsection{Projects}' }
      ]
    }))
  };
});

describe('FitCV UI shell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    window.history.pushState({}, '', '/');
    indexedDB.deleteDatabase('fitcv-local-workbench');
  });

  it('presents the dashboard first, then opens the editor workbench and browser preview', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'My Resumes' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resume groups' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Library summaries' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All resumes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    expect(screen.getByRole('region', { name: 'Editor workbench' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Browser PDF preview' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Preview actions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show compile logs' })).toBeInTheDocument();
  });

  it('shows Awesome CV as a FitCV layout with module controls in the editor', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));

    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('awesome-cv');
    expect(screen.getByRole('option', { name: 'Awesome CV' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Classic ATS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Modern Compact' })).not.toBeInTheDocument();

    // Summary is a pinned module — always present, no drag/delete/eye controls
    expect(await screen.findByRole('button', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Disable Summary/ })).not.toBeInTheDocument();

    // Flex sections from sampleResume
    expect(screen.getByRole('button', { name: 'WORK EXPERIENCE' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Space' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move WORK EXPERIENCE/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Space' }));
    const spaceInput = screen.getByRole('spinbutton', { name: 'Space value in points' });
    expect(spaceInput).toHaveValue(12);
    fireEvent.change(spaceInput, { target: { value: '24' } });
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Space value in points' })).toHaveValue(24));

    fireEvent.click(screen.getByRole('button', { name: 'New page' }));

    expect(screen.getByRole('heading', { name: 'New page' })).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('adds modules from a single Add Module menu', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    const initialWorkExpCount = screen.getAllByRole('button', { name: 'WORK EXPERIENCE' }).length;

    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));

    expect(screen.getByRole('menu', { name: 'Add module options' })).toBeInTheDocument();
    expect(screen.queryByText('Sections')).not.toBeInTheDocument();
    expect(screen.queryByText('Layout controls')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'New section' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Space' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'New page' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'New section' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'NEW SECTION' })).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'WORK EXPERIENCE' })).toHaveLength(initialWorkExpCount);
  });

  it('edits flex section names from the editor column header', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'WORK EXPERIENCE' }));

    expect(screen.queryByRole('button', { name: 'Rename WORK EXPERIENCE' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit section name' }));
    const sectionNameInput = screen.getByRole('textbox', { name: 'Section name' });
    fireEvent.change(sectionNameInput, { target: { value: 'Selected Experience' } });
    fireEvent.blur(sectionNameInput);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Selected Experience' })).toBeInTheDocument());
    expect(screen.getAllByText('Selected Experience').length).toBeGreaterThan(1);
  });

  it('edits Summary as one-row profile fields and itemized profile highlights', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Summary' }));

    expect(screen.getByRole('textbox', { name: 'GitLab' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'LinkedIn' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Stack Overflow ID' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Google Scholar name' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Profile summary')).not.toBeInTheDocument();
    expect(screen.getByText('Profile highlights')).toBeInTheDocument();
    expect(screen.getByText(/visible on resume/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add profile highlight' }));

    await waitFor(() => expect(screen.getAllByLabelText('Profile highlight item').length).toBeGreaterThan(1));
    expect(screen.getAllByRole('button', { name: /Hide profile highlight \d+|Show profile highlight \d+/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Remove profile highlight \d+/ }).length).toBeGreaterThan(0);
  });

  it('shows the flex section editor when a flex section module is selected', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'WORK EXPERIENCE' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: /sub-section/i }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: /entry/i }).length).toBeGreaterThan(0);
  });

  it('clears compile busy state and surfaces errors when PDF compile throws', async () => {
    const { compileResumeToPdf } = await import('../services/pdf');
    vi.mocked(compileResumeToPdf).mockRejectedValueOnce(new Error('BusyTeX unavailable'));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Compile' })[0]);

    expect(await screen.findByText('BusyTeX unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Compiling in browser')).not.toBeInTheDocument();
  });

  it('manual compile uses the active resume instead of the click event', async () => {
    const { compileResumeToPdf } = await import('../services/pdf');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    const compileButton = screen.getAllByRole('button', { name: 'Compile' })[0];
    await waitFor(() => expect(compileButton).not.toBeDisabled());
    vi.mocked(compileResumeToPdf).mockClear();
    fireEvent.click(compileButton);

    await waitFor(() => expect(compileResumeToPdf).toHaveBeenCalled());
    expect(vi.mocked(compileResumeToPdf).mock.calls.at(-1)?.[0]).toMatchObject({
      activeTemplateId: 'awesome-cv',
      content: expect.any(Object),
      id: expect.any(String)
    });
  });

  it('shows a real dashboard thumbnail after a clean compile generates one', async () => {
    const { generateThumbnailDataUrl } = await import('../services/pdf');
    vi.mocked(generateThumbnailDataUrl).mockResolvedValueOnce('data:image/jpeg;base64,fitcv-preview');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Compile' })[0]);
    await waitFor(() => expect(generateThumbnailDataUrl).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    const thumbnail = await waitFor(() => {
      const element = document.querySelector('.mini-preview-thumb');
      expect(element).toBeInstanceOf(HTMLImageElement);
      return element as HTMLImageElement;
    });
    expect(thumbnail).toHaveAttribute('src', 'data:image/jpeg;base64,fitcv-preview');
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

  it('opens the standalone LaTeX workbench with document-studio landmarks', async () => {
    window.history.pushState({}, '', '/latexeditor');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Awesome Resume/i }));

    expect(await screen.findByRole('complementary', { name: 'Template files' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Source workspace' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'PDF output and compiler drawer' })).toBeInTheDocument();
    expect(screen.getByText('Studio route')).toBeInTheDocument();
    expect(screen.getByText(/Ready for first compile/i)).toBeInTheDocument();
  });

  it('formats LaTeX source and PDF preview URLs for the focused editor UI', () => {
    const { container } = render(<pre>{highlightLatexSource('\\documentclass{article}\n% note')}</pre>);

    expect(container.querySelector('.latex-syntax-command')?.textContent).toBe('\\documentclass');
    expect(container.querySelector('.latex-syntax-brace')?.textContent).toBe('{');
    expect(container.querySelector('.latex-syntax-comment')?.textContent).toBe('% note');
    expect(formatPdfPreviewUrl('blob:fitcv-pdf')).toBe('blob:fitcv-pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitH');
  });

  it('renders rich text fields as formatted text instead of visible LaTeX commands', () => {
    const { container } = render(
      <pre>{renderRichLatexText('\\textbf{Bold} \\textit{Italic} \\underline{Under} \\textcolor{red}{Red}')}</pre>
    );

    expect(container.textContent).toBe('Bold Italic Under Red');
    expect(container.querySelector('.rich-preview-bold')?.textContent).toBe('Bold');
    expect(container.querySelector('.rich-preview-italic')?.textContent).toBe('Italic');
    expect(container.querySelector('.rich-preview-underline')?.textContent).toBe('Under');
    expect(container.querySelector('.rich-preview-color')?.textContent).toBe('Red');
    expect(container.querySelector('.rich-preview-color')).toHaveStyle({ color: '#cc2222' });
  });
});
