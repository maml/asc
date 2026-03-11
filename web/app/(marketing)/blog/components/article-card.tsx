import Link from "next/link";
import type { ArticleMeta } from "@/lib/articles";

export function ArticleCard({ article }: { article: ArticleMeta }) {
  const date = new Date(article.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Link
      href={`/blog/${article.slug}`}
      className="block group border border-navy-light rounded-lg p-6 hover:border-amber/30 transition-colors"
    >
      <div className="flex items-center gap-3 mb-2">
        <time className="font-mono text-xs text-gray">{date}</time>
        {article.tags.map((tag) => (
          <span
            key={tag}
            className="font-mono text-[10px] uppercase tracking-widest text-amber/70"
          >
            {tag}
          </span>
        ))}
      </div>
      <h2 className="text-lg font-semibold text-light group-hover:text-amber transition-colors">
        {article.title}
      </h2>
      <p className="text-gray text-sm mt-2">{article.description}</p>
    </Link>
  );
}
