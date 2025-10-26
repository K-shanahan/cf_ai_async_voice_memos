/**
 * MarkdownContent - Safe markdown renderer for AI-generated content
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-invert max-w-none text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mb-3 mt-3 text-white">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mb-2 mt-3 text-white">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mb-2 mt-2 text-white">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1 text-slate-100">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1 text-slate-100">{children}</ol>
          ),
          li: ({ children }) => <li className="text-slate-100">{children}</li>,
          p: ({ children }) => <p className="mb-2 text-slate-100 leading-relaxed">{children}</p>,
          code: ({ children, className }) => {
            const isInline = !className?.includes('language-')
            return isInline ? (
              <code className="bg-slate-700/50 px-1.5 py-0.5 rounded text-xs text-slate-100 font-mono">
                {children}
              </code>
            ) : (
              <code className="text-slate-100 font-mono">{children}</code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-slate-700/50 p-3 rounded mb-2 overflow-x-auto border border-slate-600">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-slate-500 pl-3 my-2 text-slate-300 italic bg-slate-700/20 py-1 pr-3">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table className="border-collapse border border-slate-600 mb-2 text-xs">{children}</table>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-700/50">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-slate-600">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-slate-600 px-2 py-1 text-left text-white">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-600 px-2 py-1 text-slate-100">{children}</td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
