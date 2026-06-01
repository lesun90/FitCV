import { describe, expect, it } from 'vitest';
import classFile from '../latex-templates/awesome-resume/awesome-cv.cls?raw';
import fontAwesomeFile from '../latex-templates/awesome-resume/fontawesome.sty?raw';

describe('bundled LaTeX templates', () => {
  it('loads local Awesome CV fonts by explicit filename for BusyTeX', () => {
    expect(classFile).toContain('UprightFont=Roboto-Regular.ttf');
    expect(classFile).toContain('UprightFont=SourceSansPro-Regular.otf');
    expect(fontAwesomeFile).toContain('FontAwesome.otf');
  });
});
