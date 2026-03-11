import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import { getArticleBySlug, getArticleSlugs } from "@/lib/articles";
import { Nav } from "../../components/nav";
import { Footer } from "../../components/footer";
import { mdxComponents } from "../components/mdx-components";

export function generateStaticParams() {
  return getArticleSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Next.js 16 params are async but generateMetadata can return sync
  // We need to handle this with a workaround for static generation
  return params.then(({ slug }) => {
    try {
      const article = getArticleBySlug(slug);
      return {
        title: `${article.title} | ASC`,
        description: article.description,
      };
    } catch {
      return { title: "Not Found | ASC" };
    }
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let article;
  try {
    article = getArticleBySlug(slug);
  } catch {
    notFound();
  }

  const date = new Date(article.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-24 pb-16 px-6">
        <article className="mx-auto max-w-[720px]">
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <time className="font-mono text-xs text-gray">{date}</time>
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[10px] uppercase tracking-widest text-amber/70 bg-amber/10 px-2 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-3xl font-bold text-light leading-tight">
              {article.title}
            </h1>
            <p className="text-gray mt-3">{article.description}</p>
          </header>

          <div className="prose-asc">
            <MDXRemote
              source={article.content}
              components={mdxComponents}
              options={{
                mdxOptions: {
                  rehypePlugins: [
                    [rehypePrettyCode, { theme: "github-dark-default" }],
                  ],
                },
              }}
            />
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
