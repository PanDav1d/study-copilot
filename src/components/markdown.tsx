import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveDocLink } from "@/lib/cornell";
import { DocLink } from "@/components/doc-link";
import { MarkdownImage } from "@/components/media/markdown-image";
import { cn } from "@/lib/utils";

/**
 * Safe markdown rendering (no raw HTML). `doc:<id>#page=n` links open the
 * in-app PDF viewer beside the current page.
 */
export function Markdown({ children, className, components }: { children: string; className?: string; components?: Components }) {
  return (
    <div className={cn("prose-study text-sm", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("doc:") ? url : /^(https?:|mailto:|\/|#)/i.test(url) ? url : "")}
        components={{
          img({ src, alt }) {
            return <MarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} />;
          },
          a({ href, children }) {
            const internal = resolveDocLink(href);
            if (internal) return <DocLink href={internal}>{children}</DocLink>;
            if (href?.startsWith("/")) return <Link href={href}>{children}</Link>;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          ...components,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
