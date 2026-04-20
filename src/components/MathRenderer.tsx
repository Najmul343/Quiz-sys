import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MathRendererProps {
  content: string;
  className?: string;
}

export default function MathRenderer({ content, className = '' }: MathRendererProps) {
  // Automatically convert standalone image URLs to markdown images
  const processedContent = content.replace(
    /(^|\s)(https?:\/\/[^\s]+\.(?:jpeg|jpg|gif|png|webp|svg)(?:\?[^\s]*)?|https?:\/\/drive\.google\.com\/uc[^\s]+)/gi,
    (match, p1, p2) => `${p1}![Asset](${p2})`
  );

  return (
    <div className={`prose-math ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ node, ...props }) => (
            <img 
              {...props} 
              className="max-w-full h-auto rounded-lg shadow-sm inline-block my-2" 
              referrerPolicy="no-referrer"
            />
          )
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
