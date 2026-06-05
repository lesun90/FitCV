import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { formatPdfPreviewUrl, highlightLatexSource, parseLatexDiagnostics, renderRichLatexText } from './latexUtils';

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
    compileLatexProject: vi.fn(async () => ({
      status: 'success',
      pdfBlob: new Blob(['pdf'], { type: 'application/pdf' }),
      logs: ['ok'],
      diagnostics: [],
      elapsedMs: 120,
      cacheState: 'cached'
    })),
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

vi.mock('../services/aiProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/aiProvider')>();
  return {
    ...actual,
    requestAiSuggestion: vi.fn(async () => ({
      replacement: 'Led Q4 launch for 12 vehicles.',
      rationale: 'Sharper impact.'
    })),
    requestFitToJdDraft: vi.fn(async () => ({
      proposedChanges: [{
        targetField: 'content.summary',
        before: 'Structured technical leader who turns ambiguous systems into readable, durable programs.',
        after: 'Frontend platform leader who turns ambiguous systems into accessible browser tools.',
        rationale: 'Aligns the summary to the JD platform focus.',
        jdEvidence: 'Frontend platform engineer building accessible browser tools.',
        riskFlags: ['verify-scope']
      }]
    })),
    requestJdMatchReport: vi.fn(async () => ({
      readinessPercent: 88,
      reasons: [{
        id: 'keyword-coverage',
        severity: 'info',
        field: 'content.summary',
        message: 'Strong platform and accessibility keyword coverage.',
        impact: 0
      }]
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

  it('shows separate readiness lanes without a combined score or JD match before a JD exists', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'My Resumes' })).toBeInTheDocument();
    expect(screen.queryByLabelText('System status')).not.toBeInTheDocument();
    expect(screen.getByText(/^ATS \d+%$/)).toBeInTheDocument();
    expect(screen.getByText('CV Quality Not run')).toBeInTheDocument();
    expect(screen.queryByText('Browser storage')).not.toBeInTheDocument();
    expect(screen.queryByText('Review Clear')).not.toBeInTheDocument();
    expect(screen.queryByText('Combined Score')).not.toBeInTheDocument();
    expect(screen.queryByText('JD Match Readiness')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    // Pills appear in the chrome for ATS and CV; JD pill only appears once a JD exists
    expect(await screen.findByRole('button', { name: /ATS Readiness/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CV Quality/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /JD Match/ })).not.toBeInTheDocument();

    // Clicking a pill opens the drawer with the run button inside
    fireEvent.click(screen.getByRole('button', { name: /ATS Readiness/ }));
    expect(await screen.findByRole('button', { name: 'Run ATS Check' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run JD Match' })).not.toBeInTheDocument();
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

  it('requires AI setup before sending selected editor field content', async () => {
    const { requestAiSuggestion } = await import('../services/aiProvider');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Summary' }));
    expect(screen.queryByRole('button', { name: 'AI assist Name' })).not.toBeInTheDocument();
    const nameInput = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    nameInput.setSelectionRange(0, nameInput.value.length);
    fireEvent.select(nameInput);
    fireEvent.mouseUp(nameInput, { clientX: 120, clientY: 36 });
    expect(screen.getByRole('button', { name: 'AI assist Name' }).parentElement).toHaveStyle({ left: '120px' });
    fireEvent.click(screen.getByRole('button', { name: 'AI assist Name' }));

    expect(await screen.findByText('AI setup required')).toBeInTheDocument();
    expect(requestAiSuggestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Set up AI' }));

    expect(screen.getByRole('dialog', { name: 'AI settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('');
    expect(screen.getByLabelText('Remember API key on this device')).not.toBeChecked();
  });

  it('reviews AI suggestions before applying them to a selected editor field', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'AI settings' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://ai.example.test/v1/chat/completions' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'cv-model' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'session-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Summary' }));
    const nameInput = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Led Q4 launch for 12 vehicles across multiple teams.' } });
    nameInput.setSelectionRange(0, nameInput.value.length);
    fireEvent.select(nameInput);
    fireEvent.click(screen.getByRole('button', { name: 'AI assist Name' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Shorten' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send to provider' }));

    expect(await screen.findByText('Led Q4 launch for 12 vehicles.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Led Q4 launch for 12 vehicles.');
  });

  it('creates a fitted CV from a JD and blocks export until AI changes are reviewed', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'AI settings' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://ai.example.test/v1/chat/completions' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'cv-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI settings' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Fit to JD' }));
    expect(await screen.findByRole('dialog', { name: 'Fit to job description' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fitted CV title'), { target: { value: 'Ada - Frontend Platform' } });
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Frontend platform engineer building accessible browser tools.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create fitted CV' }));

    expect(await screen.findByText('Fitted CV')).toBeInTheDocument();
    expect(screen.getByText(/Based on:/)).toBeInTheDocument();
    expect(screen.getByText('AI change review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getAllByText(/1 unreviewed change/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));

    await waitFor(() => expect(screen.queryByText(/1 unreviewed change/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'JD Match: 88%' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(await screen.findByText('Ada - Frontend Platform')).toBeInTheDocument();
    expect(screen.getByText('JD Match 88%')).toBeInTheDocument();
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

  it('shows actionable LaTeX errors in the main FitCV editor preview', async () => {
    const { compileResumeToPdf } = await import('../services/pdf');
    vi.mocked(compileResumeToPdf).mockResolvedValueOnce({
      id: 'artifact-failed',
      schemaVersion: 1,
      resumeId: 'resume-test',
      templateId: 'awesome-cv',
      resumeVersion: 1,
      status: 'failed',
      logs: [
        '(./resume.tex',
        '(./resume/experience.tex',
        '! Undefined control sequence.',
        'l.12 \\badMacro',
        ')'
      ],
      latexSource: '\\documentclass{article}',
      generatedText: 'Ada Lovelace',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Compile' })[0]);

    expect(await screen.findByRole('heading', { name: 'Compile needs attention' })).toBeInTheDocument();
    expect(screen.getAllByText('Undefined command').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/LaTeX does not recognize/).length).toBeGreaterThan(0);
    expect(screen.getByText('resume/experience.tex:12')).toBeInTheDocument();
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

  it('shows actionable LaTeX compile issues and opens the source file', async () => {
    window.history.pushState({}, '', '/latexeditor');
    const { compileLatexProject } = await import('../services/latexCompiler');
    vi.mocked(compileLatexProject).mockResolvedValueOnce({
      status: 'failed',
      logs: [
        '(./resume.tex',
        '(./resume/projects.tex',
        '! Undefined control sequence.',
        'l.2 \\missingCommand',
        ')'
      ],
      diagnostics: ['! Undefined control sequence.', 'l.2 \\missingCommand'],
      elapsedMs: 88,
      cacheState: 'cached'
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Awesome Resume/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Compile' }));

    const issue = await screen.findByRole('button', { name: /Open resume\/projects\.tex line 2/i });
    expect(screen.getByRole('heading', { name: 'Compile needs attention' })).toBeInTheDocument();
    expect(screen.getAllByText('Undefined command')).toHaveLength(2);
    expect(screen.getAllByText(/LaTeX does not recognize/)).toHaveLength(2);

    fireEvent.click(issue);

    expect(await screen.findByRole('textbox', { name: 'Editing resume/projects.tex' })).toBeInTheDocument();
  });

  it('supports keyboard undo and redo in the standalone LaTeX source editor', async () => {
    window.history.pushState({}, '', '/latexeditor');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Awesome Resume/i }));
    const editor = await screen.findByRole('textbox', { name: 'Editing resume.tex' });

    fireEvent.change(editor, { target: { value: 'first edit' } });
    fireEvent.change(editor, { target: { value: 'second edit' } });
    expect(editor).toHaveValue('second edit');

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
    expect(editor).toHaveValue('first edit');

    fireEvent.keyDown(editor, { key: 'y', ctrlKey: true });
    expect(editor).toHaveValue('second edit');
  });

  it('supports keyboard formatting shortcuts in the standalone LaTeX source editor', async () => {
    window.history.pushState({}, '', '/latexeditor');

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Awesome Resume/i }));
    const editor = await screen.findByRole('textbox', { name: 'Editing resume.tex' }) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: 'Ada' } });
    editor.setSelectionRange(0, 3);
    fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
    expect(editor).toHaveValue('\\textbf{Ada}');

    fireEvent.change(editor, { target: { value: 'Ada' } });
    editor.setSelectionRange(0, 3);
    fireEvent.keyDown(editor, { key: 'i', ctrlKey: true });
    expect(editor).toHaveValue('\\textit{Ada}');

    fireEvent.change(editor, { target: { value: 'Ada' } });
    editor.setSelectionRange(0, 3);
    fireEvent.keyDown(editor, { key: 'u', ctrlKey: true });
    expect(editor).toHaveValue('\\underline{Ada}');
  });

  it('reviews AI suggestions before applying them to LaTeX source selections', async () => {
    window.history.pushState({}, '', '/latexeditor');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Open Awesome Resume/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'AI settings' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://ai.example.test/v1/chat/completions' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'cv-model' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'session-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' }));

    const editor = await screen.findByRole('textbox', { name: 'Editing resume.tex' }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '\\item Led Q4 launch for 12 vehicles across multiple teams.' } });
    editor.setSelectionRange(6, editor.value.length);
    fireEvent.select(editor);
    fireEvent.click(screen.getByRole('button', { name: 'AI assist LaTeX source' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Shorten' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send to provider' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggestion' }));

    expect(editor).toHaveValue('\\item Led Q4 launch for 12 vehicles.');
  });

  it('formats LaTeX source and PDF preview URLs for the focused editor UI', () => {
    const { container } = render(<pre>{highlightLatexSource('\\documentclass{article}\n% note')}</pre>);

    expect(container.querySelector('.latex-syntax-command')?.textContent).toBe('\\documentclass');
    expect(container.querySelector('.latex-syntax-brace')?.textContent).toBe('{');
    expect(container.querySelector('.latex-syntax-comment')?.textContent).toBe('% note');
    expect(formatPdfPreviewUrl('blob:fitcv-pdf')).toBe('blob:fitcv-pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitH');
  });

  it('keeps LaTeX source text readable while editing and selecting', () => {
    const styles = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

    expect(styles).toMatch(/\.latex-code-editor\s*{[^}]*color:\s*#152033;/s);
    expect(styles).not.toMatch(/\.latex-code-editor\s*{[^}]*color:\s*transparent;/s);
    expect(styles).toMatch(/\.latex-code-editor::selection\s*{[^}]*color:\s*#1d252c;/s);
    expect(styles).not.toMatch(/\.latex-code-editor::selection\s*{[^}]*color:\s*transparent;/s);
  });

  it('parses LaTeX logs into actionable diagnostics', () => {
    const issues = parseLatexDiagnostics({
      diagnostics: ['! Undefined control sequence.', 'l.12 \\badMacro'],
      logs: [
        '(./resume.tex',
        '(./resume/experience.tex',
        '! Undefined control sequence.',
        'l.12 \\badMacro',
        ')'
      ]
    });

    expect(issues[0]).toMatchObject({
      title: 'Undefined command',
      filePath: 'resume/experience.tex',
      line: 12,
      excerpt: '\\badMacro'
    });
    expect(issues[0]?.hint).toContain('LaTeX does not recognize');
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
