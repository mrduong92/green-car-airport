// frontend/src/components/admin/TiptapEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import clsx from 'clsx'

const CONTENT_CLASS = '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mb-1.5 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_p]:mb-2'

export { CONTENT_CLASS }

export default function TiptapEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  if (!editor) return null

  const setLink = () => {
    const url = window.prompt('Nhập URL:')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  const btnClass = (active: boolean) =>
    clsx('px-2.5 py-1.5 rounded-input text-sm font-medium transition-colors',
      active ? 'bg-primary text-white' : 'text-navy hover:bg-light-green')

  return (
    <div className="border border-border-gray rounded-input overflow-hidden">
      <div className="flex flex-wrap gap-1 border-b border-border-gray p-2 bg-warm-white">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={clsx(btnClass(editor.isActive('bold')), 'font-bold')}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={clsx(btnClass(editor.isActive('italic')), 'italic')}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive('heading', { level: 2 }))}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnClass(editor.isActive('heading', { level: 3 }))}>H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive('orderedList'))}>1. List</button>
        <button type="button" onClick={setLink}
          className={btnClass(editor.isActive('link'))}>Link</button>
      </div>
      <EditorContent editor={editor} className={clsx('p-3 min-h-[200px] text-sm text-navy outline-none', CONTENT_CLASS)} />
    </div>
  )
}
