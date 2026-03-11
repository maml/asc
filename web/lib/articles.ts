import fs from "fs";
import path from "path";
import matter from "gray-matter";

export interface ArticleMeta {
  title: string;
  description: string;
  date: string;
  tags: string[];
  slug: string;
  author?: string;
}

export interface Article extends ArticleMeta {
  content: string;
  schemaArticle?: string;
  schemaFaq?: string;
}

const ARTICLES_DIR = path.join(process.cwd(), "content/articles");

export function getArticleSlugs(): string[] {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getArticleBySlug(slug: string): Article {
  const filePath = path.join(ARTICLES_DIR, `${slug}.mdx`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    title: data.title,
    description: data.meta_description ?? data.description,
    date: data.date_created ?? data.date,
    tags: data.tags ?? data.secondary_keywords ?? [],
    slug,
    author: data.author,
    content,
    schemaArticle: data.schema_article,
    schemaFaq: data.schema_faq,
  };
}

export function getAllArticles(): ArticleMeta[] {
  return getArticleSlugs()
    .map((slug) => {
      const { content: _, ...meta } = getArticleBySlug(slug);
      return meta;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
