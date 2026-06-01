%% Start of file `awesome-cv.cls'.
% Awesome CV Class File
%
% This class has been downloaded from:
% https://github.com/posquit0/Awesome-CV
%
% Author:
% Claud D. Park <posquit0.bj@gmail.com>
% http://www.posquit0.com
%
% Notes:
% 1) This class file defines the structure and layout of the template file (cv.tex, resume.tex).
% 2) It has been written in such a way that under most circumstances you 
% should not need to edit it.
%
% Class license:
% LPPL v1.3c (http://www.latex-project.org/lppl)
%


%-------------------------------------------------------------------------------
%                Identification
%-------------------------------------------------------------------------------
\ProvidesClass{awesome-cv}[2015/12/14 v1.3 Awesome Curriculum Vitae Class]
\NeedsTeXFormat{LaTeX2e}


%-------------------------------------------------------------------------------
%                Class options
%
% (need to be done before the external package loading, for example because
% we need \paperwidth, \paperheight and \@ptsize to be defined before loading
% geometry and fancyhdr)
%-------------------------------------------------------------------------------
% Options for draft or final
\DeclareOption{draft}{\setlength\overfullrule{5pt}}
\DeclareOption{final}{\setlength\overfullrule{0pt}}
% Inherit options of article
\DeclareOption*{
  \PassOptionsToClass{\CurrentOption}{article}
}
\ProcessOptions\relax
\LoadClass{article}


%-------------------------------------------------------------------------------
%                3rd party packages
%-------------------------------------------------------------------------------
% Needed to make fixed length table
\RequirePackage{array}
% Needed to handle list environment
\RequirePackage{enumitem}
% Needed to handle text alignment
\RequirePackage{ragged2e}
% Needed to configure page layout
\RequirePackage{geometry}
% Needed to make header & footer effeciently
\RequirePackage{fancyhdr}
% Needed to manage colors
\RequirePackage{xcolor}
% Needed to use \ifxetex-\else-\fi statement
\RequirePackage{ifxetex}
% Needed to use \if-\then-\else statement
\RequirePackage{xifthen}
% Needed to use a toolbox of programming tools
\RequirePackage{etoolbox}
% Needed to change line spacing in specific environment
\RequirePackage{setspace}
% Needed to manage fonts
\ifxetex
  \RequirePackage[quiet]{fontspec}
  % To support LaTeX quoting style
  \defaultfontfeatures{Ligatures=TeX}
\else
  \RequirePackage[T1]{fontenc}
  % Replace by the encoding you are using
  \RequirePackage[utf8]{inputenc}
\fi
% Needed to manage math fonts
\RequirePackage[math-style=TeX]{unicode-math}
% Needed to use icons from font-awesome
% (https://github.com/posquit0/latex-fontawesome)
\RequirePackage{fontawesome}
% Needed to deal a paragraphs
\RequirePackage{parskip}
% Needed to deal hyperlink
\RequirePackage{hyperref}
\hypersetup{
  pdftitle={},
  pdfauthor={},
  pdfsubject={},
  pdfkeywords={},
  colorlinks=false,
  allbordercolors=white
}


%-------------------------------------------------------------------------------
%                Configuration for directory locations
%-------------------------------------------------------------------------------
% Configure a directory location for fonts(default: 'fonts/')
\newcommand*{\fontdir}[1][fonts/]{\def\@fontdir{#1}}
\fontdir


%-------------------------------------------------------------------------------
%                Configuration for layout
%-------------------------------------------------------------------------------
%% Page Layout
% Configure page margins with geometry
\geometry{left=2.0cm, top=1.5cm, right=2.0cm, bottom=2.0cm, footskip=.5cm}

%% Header & Footer
% Set offset to each header and offset
\fancyhfoffset{0em}
% Remove head rule
\renewcommand{\headrulewidth}{0pt}
% Clear all header & footer fields
\fancyhf{}
% Enable if you want to make header or footer using fancyhdr
\pagestyle{fancy}


%-------------------------------------------------------------------------------
%                Configuration for colors
%-------------------------------------------------------------------------------
% Gray-scale colors
\definecolor{white}{HTML}{FFFFFF}
\definecolor{black}{HTML}{000000}
\definecolor{darkgray}{HTML}{333333}
\definecolor{gray}{HTML}{5D5D5D}
\definecolor{lightgray}{HTML}{999999}
% Basic colors
\definecolor{green}{HTML}{C2E15F}
\definecolor{orange}{HTML}{FDA333}
\definecolor{purple}{HTML}{D3A4F9}
\definecolor{red}{HTML}{FB4485}
\definecolor{blue}{HTML}{6CE0F1}
% Text colors
\definecolor{darktext}{HTML}{414141}
\colorlet{text}{darkgray}
\colorlet{graytext}{gray}
\colorlet{lighttext}{lightgray}
% Awesome colors
\definecolor{awesome-emerald}{HTML}{00A388}
\definecolor{awesome-skyblue}{HTML}{0395DE}
\definecolor{awesome-red}{HTML}{DC3522}
\definecolor{awesome-pink}{HTML}{EF4089}
\definecolor{awesome-orange}{HTML}{FF6138}
\definecolor{awesome-nephritis}{HTML}{27AE60}
\definecolor{awesome-concrete}{HTML}{95A5A6}
\definecolor{awesome-darknight}{HTML}{131A28}
\colorlet{awesome}{awesome-red}

% Awesome section color
\newcounter{colorCounter}
\def\@sectioncolor{%
  {%
    \color{%
      \ifcase\value{colorCounter}%
        awesome\or%
        awesome\or%
        awesome\or%
        awesome\or%
        awesome\else%
        awesome\fi%
    }%
  }%
  \stepcounter{colorCounter}%
}


%-------------------------------------------------------------------------------
%                Configuration for fonts
%-------------------------------------------------------------------------------
% Set font for header (default is Roboto)
\newfontfamily\headerfont[
  Path=\@fontdir,
  UprightFont=Roboto-Regular.ttf,
  ItalicFont=Roboto-Italic.ttf,
  BoldFont=Roboto-Bold.ttf,
  BoldItalicFont=Roboto-BoldItalic.ttf,
]{Roboto-Regular.ttf}

\newfontfamily\headerfontlight[
  Path=\@fontdir,
  UprightFont=Roboto-Thin.ttf,
  ItalicFont=Roboto-ThinItalic.ttf,
  BoldFont=Roboto-Medium.ttf,
  BoldItalicFont=Roboto-MediumItalic.ttf,
]{Roboto-Thin.ttf}

% Set font for footer (default is Source Sans Pro)
\newfontfamily\footerfont[
  Path=\@fontdir,
  UprightFont=SourceSansPro-Regular.otf,
  ItalicFont=SourceSansPro-It.otf,
  BoldFont=SourceSansPro-Bold.otf
]{SourceSansPro-Regular.otf}

% Set font for body (default is Source Sans Pro)
\newfontfamily\bodyfont[
  Path=\@fontdir,
  UprightFont=SourceSansPro-Regular.otf,
  ItalicFont=SourceSansPro-It.otf,
  BoldFont=SourceSansPro-Bold.otf,
  BoldItalicFont=SourceSansPro-BoldIt.otf
]{SourceSansPro-Regular.otf}

\newfontfamily\bodyfontlight[
  Path=\@fontdir,
  UprightFont=SourceSansPro-Light.otf,
  ItalicFont=SourceSansPro-LightIt.otf,
  BoldFont=SourceSansPro-Semibold.otf,
  BoldItalicFont=SourceSansPro-SemiboldIt.otf
]{SourceSansPro-Light.otf}


%-------------------------------------------------------------------------------
%                Configuration for styles
%-------------------------------------------------------------------------------
% Configure styles for each CV elements
% For fundamental structures
\newcommand*{\headernamestyle}[1]{{\fontsize{32pt}{1em}\headerfont\color{graytext} #1}}
\newcommand*{\headerpositionstyle}[1]{{\fontsize{7.6pt}{1em}\bodyfont\scshape\color{awesome} #1}}
\newcommand*{\headeraddressstyle}[1]{{\fontsize{9pt}{1em}\headerfont\itshape\color{graytext} #1}}
\newcommand*{\headersocialstyle}[1]{{\fontsize{9pt}{1em}\headerfont\color{text} #1}}
\newcommand*{\headerquotestyle}[1]{{\fontsize{9pt}{1em}\bodyfont\itshape\color{darktext} #1}}
\newcommand*{\footerstyle}[1]{{\fontsize{8pt}{1em}\footerfont\scshape\color{lighttext} #1}}
\newcommand*{\sectionstyle}[1]{{\fontsize{16pt}{1em}\bodyfont\bfseries\color{text}\@sectioncolor #1}}
\newcommand*{\subsectionstyle}[1]{{\fontsize{12pt}{1em}\bodyfont\scshape\textcolor{text}{#1}}}

% For elements of entry
\newcommand*{\entrytitlestyle}[1]{{\fontsize{10pt}{1em}\bodyfont\bfseries\color{darktext} #1}}
\newcommand*{\entrypositionstyle}[1]{{\fontsize{10pt}{1em}\bodyfont\scshape\color{graytext} #1}}
\newcommand*{\entrydatestyle}[1]{{\fontsize{9pt}{1em}\bodyfont\slshape\color{graytext} #1}}
\newcommand*{\entrylocationstyle}[1]{{\fontsize{9pt}{1em}\bodyfont\slshape\color{graytext} #1}}
\newcommand*{\descriptionstyle}[1]{{\fontsize{9pt}{1em}\bodyfont\upshape\color{text} #1}}

% For elements of subentry
\newcommand*{\subentrytitlestyle}[1]{{\fontsize{8pt}{1em}\bodyfont\mdseries\color{graytext} #1}}
\newcommand*{\subentrypositionstyle}[1]{{\fontsize{7pt}{1em}\bodyfont\scshape\color{graytext} #1}}
\newcommand*{\subentrydatestyle}[1]{{\fontsize{7pt}{1em}\bodyfontlight\slshape\color{graytext} #1}}
\newcommand*{\subentrylocationstyle}[1]{{\fontsize{7pt}{1em}\bodyfontlight\slshape\color{awesome} #1}}
\newcommand*{\subdescriptionstyle}[1]{{\fontsize{8pt}{1em}\bodyfontlight\upshape\color{text} #1}}

% For elements of honor
\newcommand*{\honortitlestyle}[1]{{\fontsize{9pt}{1em}\bodyfont\color{graytext} #1}}
\newcommand*{\honorpositionstyle}[1]{{\fontsize{9pt}{1em}\bodyfont\bfseries\color{darktext} #1}}
\newcommand*{\honordatestyle}[1]{{\fontsize{9pt}{1em}\bodyfont\color{graytext} #1}}
\newcommand*{\honorlocationstyle}[1]{{\fontsize{9pt}{1em}\bodyfontlight\slshape\color{awesome} #1}}

% For elements of skill
\newcommand*{\skilltypestyle}[1]{{\fontsize{10pt}{1em}\bodyfont\bfseries\color{darktext} #1}}
\newcommand*{\skillsetstyle}[1]{{\fontsize{9pt}{1em}\bodyfontlight\color{text} #1}}

% For elements of the cover letter
\newcommand*{\paragraphstyle}[1]{{\fontsize{14pt}{1em}\bodyfont\bfseries\color{text}\@sectioncolor #1}}
\newcommand*{\recipientaddressstyle}[1]{{\fontsize{9pt}{1em}\bodyfont\scshape\color{graytext} #1}}
\newcommand*{\recipienttitlestyle}[1]{{\fontsize{11pt}{1em}\bodyfont\bfseries\color{darktext} #1}}
\newcommand*{\lettertitlestyle}[1]{{\fontsize{10pt}{1em}\bodyfontlight\bfseries\color{darktext} \underline{#1}}}
\newcommand*{\letterdatestyle}[1]{{\fontsize{9pt}{1em}\bodyfontlight\slshape\color{graytext} #1}}
\newcommand*{\lettertextstyle}{\fontsize{10pt}{1.4em}\bodyfontlight\upshape\color{graytext}}
\newcommand*{\letternamestyle}[1]{{\fontsize{10pt}{1em}\bodyfont\bfseries\color{darktext} #1}}
\newcommand*{\letterenclosurestyle}[1]{{\fontsize{10pt}{1em}\bodyfontlight\slshape\color{lighttext} #1}}


%-------------------------------------------------------------------------------
%                Commands for personal information
%-------------------------------------------------------------------------------
% Define writer's name
% Usage: \name{<firstname>}{<lastname>}
% Usage: \firstname{<firstname>}
% Usage: \lastname{<lastname>}
% Usage: \familyname{<familyname>}
\newcommand*{\name}[2]{\def\@firstname{#1}\def\@lastname{#2}}
\newcommand*{\firstname}[1]{\def\@firstname{#1}}
\newcommand*{\lastname}[1]{\def\@lastname{#1}}
\newcommand*{\familyname}[1]{\def\@lastname{#1}}
\def\@familyname{\@lastname}

% Define writer's address
% Usage: \address{<address>}
\newcommand*{\address}[1]{\def\@address{#1}}

% Define writer's position
% Usage: \name{<position>}
\newcommand*{\position}[1]{\def\@position{#1}}

% Defines writer's mobile (optional)
% Usage: \mobile{<mobile number>}
\newcommand*{\mobile}[1]{\def\@mobile{#1}}

% Defines writer's email (optional)
% Usage: \email{<email adress>}
\newcommand*{\email}[1]{\def\@email{#1}}

% Defines writer's homepage (optional)
% Usage: \homepage{<url>}
\newcommand*{\homepage}[1]{\def\@homepage{#1}}

% Defines writer's github (optional)
% Usage: \github{<github-nick>}
\newcommand*{\github}[1]{\def\@github{#1}}

% Defines writer's gitlab (optional)
% Usage: \gitlab{<gitlab-nick>}
\newcommand*{\gitlab}[1]{\def\@gitlab{#1}}

% Defines writer's linked-in (optional)
% Usage: \linkedin{<linked-in-nick>}
\newcommand*{\linkedin}[1]{\def\@linkedin{#1}}

% Defines writer's stackoverflow profile (optional)
% Usage: \stackoverflow{<so userid>}{<so username>}
%   e.g.https://stackoverflow.com/users/123456/sam-smith
%       would be \stackoverflow{123456}{sam-smith}
\newcommand*{\stackoverflow}[2]{\def\@stackoverflowid{#1}\def\@stackoverflowname{#2}}

% Defines writer's skype (optional)
% Usage: \skype{<skype account>}
\newcommand*{\skype}[1]{\def\@skype{#1}}

% Defines writer's twitter (optional)
% Usage: \twitter{<twitter handle>}
\newcommand*{\twitter}[1]{\def\@twitter{#1}}

% Defines writer's x (formerly twitter) (optional)
% Usage: \x{<x account>}
\newcommand*{\x}[1]{\def\@x{#1}}

% Defines writer's reddit (optional)
% Usage: \reddit{<reddit account>}
\newcommand*{\reddit}[1]{\def\@reddit{#1}}

% Defines writer's medium profile (optional)
% Usage: \medium{<medium account>}
\newcommand*{\medium}[1]{\def\@medium{#1}}

% Defines writer's kaggle (optional)
% Usage: \kaggle{<kaggle handle>}
\newcommand*{\kaggle}[1]{\def\@kaggle{#1}}

% Defines writer's Hackerrank (optional)
% Usage: \hackerrank{<Hackerrank profile name>}
\newcommand*{\hackerrank}[1]{\def\@hackerrank{#1}}

% Defines writer's Telegram (optional)
% Usage: \telegram{<Telegram username>}
\newcommand*{\telegram}[1]{\def\@telegram{#1}}

% Defines writer's google scholar profile (optional)
% Usage: \googlescholar{<googlescholar userid>}{<googlescholar username>}
% e.g.https://scholar.google.co.uk/citations?user=wpZDx1cAAAAJ
% would be \googlescholar{wpZDx1cAAAAJ}{Name-to-display-next-icon}
% If 'googlescholar-name' is not provided than it defaults to
% '\firstname \lastname'
\newcommand*{\googlescholar}[2]{%
  \def\@googlescholarid{#1}%
  \ifthenelse{\equal{#2}{}}{%
    \def\@googlescholarname{\@firstname~\@lastname}%
  }{%
    \def\@googlescholarname{#2}%
  }%
}

% Defines writer's extra information (optional)
% Usage: \extrainfo{<extra information>}
\newcommand*{\extrainfo}[1]{\def\@extrainfo{#1}}

% Defines writer's quote (optional)
% Usage: \quote{<quote>}
\renewcommand*{\quote}[1]{\def\@quote{#1}}

% Defines recipient's information (cover letter only)
% Usage: \recipient{<recipient name>}{<recipient address>}
% Usage: \recipientname{<recipient name>}
% Usage: \recipientaddress{<recipient address>}
\newcommand*{\recipient}[2]{\def\@recipientname{#1}\def\@recipientaddress{#2}}
\newcommand*{\recipientname}[1]{\def\@recipientname{#1}}
\newcommand*{\recipientaddress}[1]{\def\@recipientaddress{#1}}

% Defines the title for letter (cover letter only, optional)
% Usage: \lettertitle{<title>}
\newcommand*{\lettertitle}[1]{\def\@lettertitle{#1}}

% Defines the date for letter (cover letter only)
% Usage: \letterdate{<date>}
\newcommand*{\letterdate}[1]{\def\@letterdate{#1}}

% Defines a message of opening for letter (cover letter only)
% Usage: \letteropening{<message>}
\newcommand*{\letteropening}[1]{\def\@letteropening{#1}}

% Defines a message of closing for letter (cover letter only)
% Usage: \letterclosing{<message>}
\newcommand*{\letterclosing}[1]{\def\@letterclosing{#1}}

% Defines an enclosure for letter (cover letter only, optional)
% Usage: \letterenclosure[<enclosure name>]{<enclosure>}
\newcommand*{\letterenclname}[1][Enclosure]{\def\@letterenclname{#1}}
\newcommand*{\letterenclosure}[2][]{
  % if an optional argument is provided, use it to redefine \enclname
  \ifthenelse{\equal{#1}{}}{}{\def\@letterenclname{#1}}
  \def\@letterenclosure{#2}
}


%-------------------------------------------------------------------------------
%                Commands for extra
%-------------------------------------------------------------------------------
% Define separator for social informations in header
% Usage: \headersocialsep{<separator>}
% Default: \quad\textbar\quad
\newcommand*{\headersocialsep}[1][\quad\textbar\quad]{\def\@headersocialsep{#1}}
\headersocialsep


%-------------------------------------------------------------------------------
%                Commands for utilities
%-------------------------------------------------------------------------------
% Use to align an element of tabular table
\newcolumntype{L}[1]{>{\raggedright\let\newline\\\arraybackslash\hspace{0pt}}m{#1}}
\newcolumntype{C}[1]{>{\centering\let\newline\\\arraybackslash\hspace{0pt}}m{#1}}
\newcolumntype{R}[1]{>{\raggedleft\let\newline\\\arraybackslash\hspace{0pt}}m{#1}}

% Use to draw horizontal line with specific tickness
\def\vhrulefill#1{\leavevmode\leaders\hrule\@height#1\hfill \kern\z@}

% Use to execute conditional statements by checking empty string
\newcommand*{\ifempty}[3]{\ifthenelse{\isempty{#1}}{#2}{#3}}


%-------------------------------------------------------------------------------
%                Commands for elements of CV structure
%-------------------------------------------------------------------------------
% Define a header for CV
% Usage: \makecvheader
\newcommand*{\makecvheader}{
  \begin{center}
    \headernamestyle{\@firstname\ \@lastname}
    \\
    \vspace{0.4mm}
    \ifthenelse{\isundefined{\@position}}{}{\headerpositionstyle{\@position\\}}
    \vspace{0.4mm}
    \ifthenelse{\isundefined{\@address}}{}{\headeraddressstyle{\@address\\}}
    \vspace{-0.5mm}
    \headersocialstyle{
      \newbool{isstart}
      \setbool{isstart}{true}
      \ifthenelse{\isundefined{\@mobile}}
        {}
        {
          \faMobile\ \@mobile
          \setbool{isstart}{false}
        }
      \ifthenelse{\isundefined{\@email}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{mailto:\@email}{\faEnvelope\ \@email}
        }
      \ifthenelse{\isundefined{\@homepage}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{http://\@homepage}{\faHome\ \@homepage}
        }
      \ifthenelse{\isundefined{\@github}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://\@github}{\faGithubSquare\ \@github}
        }
      \ifthenelse{\isundefined{\@gitlab}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://gitlab.com/\@gitlab}{\faGit\ \@gitlab}
        }
      \ifthenelse{\isundefined{\@stackoverflowid}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://stackoverflow.com/users/\@stackoverflowid}{\faStackOverflow\ \@stackoverflowname}
        }
      \ifthenelse{\isundefined{\@linkedin}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://\@linkedin}{\faLinkedinSquare\ \@linkedin}
        }
      \ifthenelse{\isundefined{\@twitter}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://twitter.com/\@twitter}{\faTwitter\ \@twitter}
        }
      \ifthenelse{\isundefined{\@x}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://x.com/\@x}{\faTwitter\ \@x}
        }
      \ifthenelse{\isundefined{\@skype}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \faSkype\ \@skype
        }
      \ifthenelse{\isundefined{\@reddit}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://www.reddit.com/user/\@reddit}{\faReddit\ \@reddit}
        }
      \ifthenelse{\isundefined{\@medium}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://medium.com/@\@medium}{\faMedium\ \@medium}
        }
      \ifthenelse{\isundefined{\@kaggle}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://kaggle.com/\@kaggle}{\faCode\ \@kaggle}
        }
      \ifthenelse{\isundefined{\@hackerrank}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://www.hackerrank.com/\@hackerrank}{\faTerminal\ \@hackerrank}
        }
      \ifthenelse{\isundefined{\@telegram}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://t.me/\@telegram}{\faPaperPlane\ \@telegram}
        }
      \ifthenelse{\isundefined{\@googlescholarid}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \href{https://scholar.google.com/citations?user=\@googlescholarid}{\faGraduationCap\ \@googlescholarname}
        }
      \ifthenelse{\isundefined{\@extrainfo}}
        {}
        {
          \ifbool{isstart}
            {
              \setbool{isstart}{false}
            }
            {\@headersocialsep}
          \@extrainfo
        }
    } \\
    \ifthenelse{\isundefined{\@quote}}
      {\vspace{4.0mm}}
      {\vspace{6.0mm}\headerquotestyle{\@quote\\}\vspace{5.0mm}}
  \end{center}
}

% Define a footer for CV
% Usage: \makecvfooter{<left>}{<center>}{<right>}
\newcommand*{\makecvfooter}[3]{
  \fancyfoot{}
  \fancyfoot[L]{
    \footerstyle{#1}
  }
  \fancyfoot[C]{
    \footerstyle{#2}
  }
  \fancyfoot[R]{
    \footerstyle{#3}
  } 
}

% Define a section for CV
% Usage: \cvsection{<section-title>}
\newcommand{\cvsection}[1]{
  \par\addvspace{1.5ex}
  \phantomsection{}
  \sectionstyle{#1}
  \color{gray}\vhrulefill{0.9pt}
  \par\nobreak\addvspace{1ex}
}

% Define a subsection for CV
% Usage: \cvsubsection{<subsection-title>}
\newcommand{\cvsubsection}[1]{
  \par\addvspace{0.75ex}
  \phantomsection{}
  \subsectionstyle{#1}
  \par\nobreak\addvspace{0.25ex}
}

% Define an environment for projects
\newenvironment{projects}{
  \begin{center}
}{
  \end{center}
}
% Define an entry of projects information
% Usage: \projectentry{<title>}{}{}{}{<description>}
\newcommand*{\projectentry}[5]{
  \setlength\tabcolsep{0pt}
  \setlength{\extrarowheight}{0pt}
  \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} L{17cm}}
    \entrytitlestyle{#1} \\
    \descriptionstyle{#5} \\
  \end{tabular*}
}

% Define an environment for the top highlight summary block.
% Owns its own vertical spacing since it has no \cvsection header.
\newenvironment{highlights}{
  \setlength{\parskip}{0pt}
  \fontsize{9pt}{1.4em}\bodyfont\upshape\color{text}
  \begin{justify}
  \begin{itemize}[leftmargin=2ex, nosep, noitemsep]
    \setlength{\parskip}{0pt}
    \renewcommand{\labelitemi}{\bullet}
}{
  \end{itemize}
  \end{justify}
}

% Define an environment for experience entries (alias for cventries)
\newenvironment{experience}{
  \begin{center}
}{
  \end{center}
}

% Define an environment for cventry
\newenvironment{cventries}{
  \begin{center}
}{
  \end{center}
}
% Define an entry of cv information
% Usage: \cventry{<position>}{<title>}{<location>}{<date>}{<description>}
\newcommand*{\cventry}[5]{
  \setlength\tabcolsep{0pt}
  \setlength{\extrarowheight}{0pt}
  \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} L{12.5cm} R{4.5cm}}
    \ifempty{#2#3}
      {\entrypositionstyle{#1} & \entrydatestyle{#4} \\}
      {\entrytitlestyle{#2} & \entrylocationstyle{#3} \\
      \entrypositionstyle{#1} & \entrydatestyle{#4} \\}
  \end{tabular*}%
  \ifempty{#5}{}{\noindent\descriptionstyle{#5}}%
}

% Define an environment for researchentries
\newenvironment{researchentries}{
  \begin{center}
}{
  \end{center}
}
% Define an entry of researchentry information
% Usage: \researchentry{<position>}{<title>}
\newcommand*{\researchentry}[2]{
  \setlength{\extrarowheight}{0pt}
  \begin{justify}
  \begin{itemize}[leftmargin=2ex, nosep, noitemsep]
    \setlength{\parskip}{0pt}
    \renewcommand{\labelitemi}{\bullet}
      \item \entrytitlestyle{#1} : \descriptionstyle{#2}
  \end{itemize}
  \end{justify}
}

% Define an environment for cvsubentry
\newenvironment{cvsubentries}{
  \begin{center}
}{
  \end{center}
}
% Define a subentry of cv information
% Usage: \cvsubentry{<position>}{<title>}{<date>}{<description>}
\newcommand*{\cvsubentry}[4]{
  \setlength\tabcolsep{0pt}
  \setlength{\extrarowheight}{0pt}
  \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} L{12.5cm} R{4.5cm}}
    \setlength\leftskip{0.2cm}
    \subentrytitlestyle{#2} & \ifthenelse{\equal{#1}{}}
      {\subentrydatestyle{#3}}{} 
    \ifthenelse{\equal{#1}{}}
      {}
      {\subentrypositionstyle{#1} & \subentrydatestyle{#3} \\}
    \ifthenelse{\equal{#4}{}}
      {}
      {\multicolumn{2}{L{17.0cm}}{\subdescriptionstyle{#4}} \\}
  \end{tabular*}
}

% Define an environment for cvhonor
\newenvironment{cvhonors}{
  \begin{center}
    \setlength\tabcolsep{0pt}
    \setlength{\extrarowheight}{0pt}
    \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} C{1.5cm} L{13.0cm} R{2.5cm}}
}{
    \end{tabular*}
  \end{center}
}

% Define a line of cv information(honor, award or something else)
% Usage: \cvhonor{<position>}{<title>}{<location>}{<date>}
\newcommand*{\cvhonor}[4]{
  \honordatestyle{#4} & \honorpositionstyle{#1}, \honortitlestyle{#2} & \honortitlestyle{#3}
  \\
}

% Define an environment for patents
% Usage: \cvhonor{<title>}{<patent-number>}{}{<granted-date>}
\newenvironment{patents}{
  \begin{center}
    \setlength\tabcolsep{0pt}
    \setlength{\extrarowheight}{0pt}
    \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} L{3cm} L{12cm} R{2cm}}
}{
    \end{tabular*}
  \end{center}
}

% Define an environment for publications
\newenvironment{publications}{
  \begin{justify}
  \begin{enumerate}[leftmargin=4ex, nosep, noitemsep]
    \setlength{\parskip}{0pt}
    \renewcommand{\labelitemi}{\bullet}
}{
  \end{enumerate}
  \end{justify}
}

% Define an environment for cvskill
\newenvironment{cvskills}{
  \begin{center}
    \setlength\tabcolsep{1ex}
    \setlength{\extrarowheight}{0pt}
    \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} r L{15.2cm}}
}{
    \end{tabular*}
  \end{center}
}
% Define a line of cv information(skill)
% Usage: \cvskill{<type>}{<skillset>}
\newcommand*{\cvskill}[2]{
	\skilltypestyle{#1} & \skillsetstyle{#2} 
  \\
}

% Define an environment for cvitems(for cventry)
\newenvironment{cvitems}{
  \setlength{\parskip}{0pt}
  \begin{justify}
  \begin{itemize}[leftmargin=2ex, nosep, noitemsep]
    \setlength{\parskip}{0pt}
    \renewcommand{\labelitemi}{\bullet}
}{
  \end{itemize}
  \end{justify}
}

\newenvironment{highlightitems}{
  \setlength{\parskip}{0pt}
  \begin{justify}
  \begin{itemize}[leftmargin=2ex, nosep, noitemsep]
    \setlength{\parskip}{0pt}
    \renewcommand{\labelitemi}{\bullet}
}{
  \end{itemize}
  \end{justify}
}


%-------------------------------------------------------------------------------
%                Commands for elements of Cover Letter
%-------------------------------------------------------------------------------
% Define an environment for cvletter
\newenvironment{cvletter}{
  \lettertextstyle
}{
}

% Define a paragraph for cvletter
% Usage: \cvparagraph{<paragraph-title>}
\newenvironment{cvparagraph}{%
  \vspace{\acvSectionContentTopSkip}
  \vspace{-3mm}
  \paragraphstyle
}{%
  \par
  \vspace{2mm}
}

% Define a title of the cover letter
% Usage: \makelettertitle
\newcommand*{\makelettertitle}{
  \vspace{8.4mm}
  \setlength\tabcolsep{0pt}
  \setlength{\extrarowheight}{0pt}
  \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}} L{12.5cm} R{4.5cm}}
    \recipienttitlestyle{\@recipientname} & \letterdatestyle{\@letterdate}
  \end{tabular*}
  \begin{singlespace}
    \recipientaddressstyle{\@recipientaddress} \\\\
  \end{singlespace}
  \ifthenelse{\isundefined{\@lettertitle}}
    {}
    {\lettertitlestyle{\@lettertitle} \\}
  \lettertextstyle{\@letteropening} 
}

% Define a closing of the cover letter
% Usage: \makeletterclosing
\newcommand*{\makeletterclosing}{
  \vspace{3.4mm}
  \lettertextstyle{\@letterclosing} \\\\
  \letternamestyle{\@firstname \@lastname}
  \ifthenelse{\isundefined{\@letterenclosure}}
    {\\}
    {
      \\\\\\
      \letterenclosurestyle{\@letterenclname:  \@letterenclosure} \\
    }
}
