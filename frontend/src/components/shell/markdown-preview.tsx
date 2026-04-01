import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownPreviewProps {
    content: string
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
    return (
        <div className="h-full w-full overflow-auto bg-card p-8">
            <div className="max-w-4xl mx-auto prose prose-invert prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-border">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                </ReactMarkdown>
            </div>
        </div>
    )
}
