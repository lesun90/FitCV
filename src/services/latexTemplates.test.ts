import { describe, expect, it } from 'vitest';
import classFile from '../latex-templates/awesome-resume/awesome-cv.cls?raw';
import fontAwesomeFile from '../latex-templates/awesome-resume/fontawesome.sty?raw';
import resumeFile from '../latex-templates/awesome-resume/resume.tex?raw';

describe('bundled LaTeX templates', () => {
  it('loads local Awesome CV fonts by explicit filename for BusyTeX', () => {
    expect(classFile).toContain('UprightFont=Roboto-Regular.ttf');
    expect(classFile).toContain('UprightFont=SourceSansPro-Regular.otf');
    expect(fontAwesomeFile).toContain('FontAwesome.otf');
  });

  it('uses unicode-math options supported by BusyTeX xelatex', () => {
    expect(classFile).toContain('math-style=TeX');
    expect(classFile).not.toContain('vargreek-shape');
  });

  it('does not load amssymb after unicode-math', () => {
    expect(classFile).toContain('unicode-math');
    expect(resumeFile).not.toContain('\\usepackage{amssymb}');
  });
});
