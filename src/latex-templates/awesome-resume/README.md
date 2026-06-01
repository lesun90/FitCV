# Resume Template (Awesome CV)

A clean, customisable LaTeX resume template built on top of [Awesome CV](https://github.com/posquit0/Awesome-CV). All personal information has been replaced with placeholders — fill in your own details and compile.

---

## Requirements

You need a full XeLaTeX distribution installed.

- **Linux**: `sudo apt-get install texlive-full`
- **macOS**: Install [MacTeX](https://www.tug.org/mactex/)
- **Windows**: Install [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/)
- **Online**: Upload the project to [Overleaf](https://www.overleaf.com) and compile there (no local install needed)

---

## Compile

```bash
xelatex resume.tex
```

This produces `resume.pdf`. Run it twice if the footer page number is off on the first pass.

---

## File Structure

```
resume.tex          ← main file: personal data, accent color, section order
resume/
  highlight.tex     ← top bullet-point summary (shown below the header)
  education.tex     ← degrees
  experience.tex    ← work history
  patents.tex       ← patents (remove \import in resume.tex if unused)
  projects.tex      ← selected projects
  skills.tex        ← skills and tools
  publications.tex  ← publications (remove \import in resume.tex if unused)
  research.tex      ← research summary (disabled by default)
  honors.tex        ← honors and awards (disabled by default)
  activities.tex    ← extracurricular activities (disabled by default)
awesome-cv.cls      ← class file — avoid editing unless necessary
fonts/              ← bundled Roboto and Source Sans Pro fonts
```

---

## Editing Guide

### Personal data — `resume.tex`

```latex
\name{First}{Last}
\mobile{(XXX) XXX-XXXX}
\email{your.email@example.com}
\homepage{yourwebsite.com}
\github{github.com/yourusername}
```

Uncomment any of the optional fields to add them:

```latex
% \address{123 Main Street, City, State, ZIP}
% \linkedin{linkedin.com/in/yourprofile/}
% \position{Your Title{\enskip\cdotp\enskip}Your Specialization}
% \quote{``Your inspiring quote here."}
```

### Accent color — `resume.tex`

Change the `\colorlet` line to one of the built-in options:

```latex
\colorlet{awesome}{awesome-red}       % default
% \colorlet{awesome}{awesome-skyblue}
% \colorlet{awesome}{awesome-emerald}
% \colorlet{awesome}{awesome-orange}
% \colorlet{awesome}{awesome-pink}
% \colorlet{awesome}{awesome-nephritis}
% \colorlet{awesome}{awesome-concrete}
% \colorlet{awesome}{awesome-darknight}
```

### Enable or disable sections — `resume.tex`

Comment out any `\import` line to hide that section, or uncomment a disabled one to show it:

```latex
\import{\sectiondir}{highlight.tex}
\import{\sectiondir}{education.tex}
\import{\sectiondir}{experience.tex}
\newpage
\import{\sectiondir}{patents.tex}       % remove if you have no patents
\import{\sectiondir}{projects.tex}
\import{\sectiondir}{skills.tex}
\newpage
% \import{\sectiondir}{research.tex}    % uncomment to enable
\import{\sectiondir}{publications.tex}
% \import{\sectiondir}{honors.tex}      % uncomment to enable
% \import{\sectiondir}{activities.tex}  % uncomment to enable
```

### Add a work entry — `resume/experience.tex`

Copy this block and fill in your details:

```latex
\cventry
  {Job Title}
  {Company Name}
  {City, State}
  {Month Year -- Month Year}
  {
    \begin{cvitems}
      \item {Description of what you did and the impact it had.}
      \item {Another bullet point.}
    \end{cvitems}
  }
```

### Add an education entry — `resume/education.tex`

```latex
\cventry
  {Degree in Your Field}
  {University Name}
  {City, State}
  {Year}
  {
    \begin{cvitems}
      \item {Thesis Title: Your thesis title here.}
      \item {Advisor: Advisor Name, Ph.D.}
    \end{cvitems}
  }
```

Leave the fifth argument empty `{}` if there is nothing to list below the degree.

### Add a patent — `resume/patents.tex`

```latex
\cvhonor
  {Patent Title}
  {US Patent No. XXXXXXXXX}
  {}
  {Granted Month Year}
```

### Add a publication — `resume/publications.tex`

```latex
\item {\textbf{Your Name} and Co-Author (Year): \textit{"Paper Title."}, Venue Name}
```

Add `\textbf{(Best Paper Award)}` or similar at the end of the line for notable recognition.

---

## Tips

- The template uses **XeLaTeX** specifically — `pdflatex` will not work due to the custom fonts.
- Use `\textbf{...}` to bold keywords inside bullet points.
- Use `\newpage` in `resume.tex` to control where page breaks fall.
- Keep the `\vspace` adjustments in `highlight.tex` — they tune the gap between the header and the first section.
