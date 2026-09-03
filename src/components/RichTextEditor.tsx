'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Heading2, Heading3, Quote, ImageIcon, Link as LinkIcon, Highlighter, Undo, Redo } from 'lucide-react';
import { useEffect, useRef } from 'react';

const MenuBar = ({ editor }: { editor: any }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) {
    return null;
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
      } else {
        alert('Ошибка при загрузке фото');
      }
    } catch (e) {
      alert('Ошибка при соединении с сервером');
    }
  };

  const addLink = () => {
    const url = window.prompt('URL ссылки:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.25rem', padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.1)', flexWrap: 'wrap', backgroundColor: '#f8fafc' }}>
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`editor-btn ${editor.isActive('bold') ? 'active' : ''}`} title="Жирный">
        <Bold size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`editor-btn ${editor.isActive('italic') ? 'active' : ''}`} title="Курсив">
        <Italic size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`editor-btn ${editor.isActive('underline') ? 'active' : ''}`} title="Подчеркнутый">
        <UnderlineIcon size={16} />
      </button>
      
      <div className="divider" />
      
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`editor-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}>
        <AlignLeft size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`editor-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}>
        <AlignCenter size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`editor-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}>
        <AlignRight size={16} />
      </button>

      <div className="divider" />
      
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`editor-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}>
        <Heading2 size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`editor-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}>
        <Heading3 size={16} />
      </button>
      
      <div className="divider" />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`editor-btn ${editor.isActive('bulletList') ? 'active' : ''}`}>
        <List size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`editor-btn ${editor.isActive('orderedList') ? 'active' : ''}`}>
        <ListOrdered size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`editor-btn ${editor.isActive('blockquote') ? 'active' : ''}`}>
        <Quote size={16} />
      </button>

      <div className="divider" />

      <button type="button" onClick={() => fileInputRef.current?.click()} className="editor-btn" title="Загрузить картинку">
        <ImageIcon size={16} />
      </button>
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" style={{ display: 'none' }} />
      
      <button type="button" onClick={addLink} className={`editor-btn ${editor.isActive('link') ? 'active' : ''}`} title="Добавить ссылку">
        <LinkIcon size={16} />
      </button>
      
      <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={`editor-btn ${editor.isActive('highlight') ? 'active' : ''}`} title="Выделить маркером">
        <Highlighter size={16} />
      </button>

      <div style={{ flexGrow: 1 }} />

      <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()} className="editor-btn">
        <Undo size={16} />
      </button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()} className="editor-btn">
        <Redo size={16} />
      </button>

      <style>{`
        .editor-btn {
          padding: 0.4rem;
          border-radius: 4px;
          color: var(--muted);
          background: transparent;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          cursor: pointer;
        }
        .editor-btn:hover:not(:disabled) {
          background: rgba(0,0,0,0.05);
          color: var(--foreground);
        }
        .editor-btn.active {
          background: var(--primary);
          color: white;
        }
        .editor-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .divider {
          width: 1px;
          backgroundColor: rgba(0,0,0,0.1);
          margin: 0 0.5rem;
        }
        .ProseMirror {
          padding: 1rem;
          min-height: 400px;
          outline: none;
          font-size: 1.05rem;
          line-height: 1.7;
        }
        .ProseMirror p {
          margin-bottom: 0.75rem;
        }
        .ProseMirror h2 {
          font-size: 1.75rem;
          font-weight: 800;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror h3 {
          font-size: 1.35rem;
          font-weight: 700;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror blockquote {
          border-left: 3px solid var(--primary);
          padding-left: 1rem;
          color: var(--muted);
          font-style: italic;
          background-color: rgba(0,0,0,0.02);
          padding: 0.5rem 1rem;
          border-radius: 4px;
        }
        .ProseMirror img {
          max-width: 100%;
          border-radius: 12px;
          margin: 1rem 0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .ProseMirror a {
          color: var(--primary);
          text-decoration: underline;
        }
        .ProseMirror mark {
          background-color: rgba(250, 204, 21, 0.4);
          border-radius: 2px;
          padding: 0.1rem 0.2rem;
        }
      `}</style>
    </div>
  );
};

export default function RichTextEditor({ content, onChange }: { content: string, onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Link.configure({ openOnClick: false }),
      Highlight,
      TextStyle,
      Color,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: 'white' }}>
      <MenuBar editor={editor} />
      <div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
