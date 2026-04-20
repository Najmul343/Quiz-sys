import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MathRendererProps {
  content: string;
  className?: string;
}

export default function MathRenderer({ content, className = '' }: MathRendererProps) {
  // Automatically convert standalone image URLs to markdown images
  // Improved regex to catch more Google Drive formats and standard images
  const processedContent = content.replace(
    /(^|\s)(https?:\/\/[^\s]+\.(?:jpeg|jpg|gif|png|webp|svg)(?:\?[^\s]*)?|https?:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)[^\s]+)/gi,
    (match, p1, p2) => {
      let finalUrl = p2;
      // Transform Drive link to direct link for rendering if needed
      if (p2.includes('drive.google.com')) {
        const fileIdMatch = p2.match(/\/d\/([^/]+)/) || p2.match(/id=([^&]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
          finalUrl = `https://drive.google.com/uc?id=${fileIdMatch[1]}&export=download`;
        }
      }
      return `${p1}![Asset](${finalUrl})`;
    }
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
