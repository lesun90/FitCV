import { useEffect, useRef, type ReactNode } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { LATEX_COLORS } from './latexUtils';
import { latexToTiptap, tiptapToLatex } from './latexTiptap';

export const WysiwygEditor = ({ label, ariaLabel, value, placeholder, onChange, showToolbar = true, singleLine = false }: {
  label?: string;
  ariaLabel?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  showToolbar?: boolean;
  singleLine?: boolean;
}) => {
  const lastLatexRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        code: false,
        strike: false,
        underline: false,
      }),
      Underline,
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: latexToTiptap(value),
    editorProps: {
      attributes: { 'aria-label': ariaLabel ?? label ?? '' },
      handleKeyDown: (_view, event) => {
        if (singleLine && event.key === 'Enter') return true;
        return false;
      },
      transformPastedText: singleLine
        ? (text: string) => text.replace(/[\r\n]+/g, ' ').trim()
        : undefined,
    },
    onUpdate: ({ editor }) => {
      const latex = tiptapToLatex(editor.getJSON());
      lastLatexRef.current = latex;
      onChange(latex);
    },
  });

  useEffect(() => {
    if (!editor || value === lastLatexRef.current) return;
    lastLatexRef.current = value;
    editor.commands.setContent(latexToTiptap(value), { emitUpdate: false, parseOptions: { preserveWhitespace: 'full' } });
  }, [editor, value]);

  const toolbar: ReactNode = (editor && showToolbar) ? (
    <div className="rich-toolbar" role="toolbar" aria-label={label ? `Formatting for ${label}` : 'Text formatting'}>
      <button
        type="button"
        className={`rich-btn rich-bold${editor.isActive('bold') ? ' is-active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        title="Bold"
      ><strong>B</strong></button>
      <button
        type="button"
        className={`rich-btn rich-italic${editor.isActive('italic') ? ' is-active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        title="Italic"
      ><em>I</em></button>
      <button
        type="button"
        className={`rich-btn rich-underline${editor.isActive('underline') ? ' is-active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
        title="Underline"
      ><u>U</u></button>
      <span className="rich-sep" />
      {LATEX_COLORS.map((color) => (
        <button
          key={color.name}
          type="button"
          className={`rich-color-swatch${editor.isActive('textStyle', { color: color.hex }) ? ' is-active' : ''}`}
          style={{ background: color.hex }}
          onMouseDown={(e) => {
            e.preventDefault();
            if (editor.isActive('textStyle', { color: color.hex })) {
              editor.chain().focus().unsetColor().run();
            } else {
              editor.chain().focus().setColor(color.hex).run();
            }
          }}
          title={color.label}
        />
      ))}
    </div>
  ) : null;

  const wrapClass = [
    'rich-wrap',
    !showToolbar && 'no-toolbar',
    singleLine && 'single-line',
  ].filter(Boolean).join(' ');

  const inner = (
    <div className={wrapClass}>
      {toolbar}
      <div className="rich-text-frame">
        <EditorContent editor={editor} />
      </div>
    </div>
  );

  if (!label) return inner;
  return (
    <div className="stacked-field">
      <span className="field-label" onClick={() => editor?.commands.focus()}>{label}</span>
      {inner}
    </div>
  );
};
