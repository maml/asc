import { getAllArticles } from "@/lib/articles";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";
import { ArticleCard } from "./components/article-card";

export const metadata = {
  title: "Blog | ASC",
  description:
    "Articles on multi-agent coordination, AI infrastructure, and building ASC.",
};

export default function BlogIndex() {
  const articles = getAllArticles();

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-24 pb-16 px-6">
        <div className="mx-auto max-w-[720px]">
          <h1 className="font-mono text-xs uppercase tracking-widest text-amber mb-2">
            Blog
          </h1>
          <p className="text-light text-lg mb-12">
            Building the coordination layer for AI agents.
          </p>

          {articles.length === 0 ? (
            <p className="text-gray">No articles yet. Check back soon.</p>
          ) : (
            <div className="space-y-8">
              {articles.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
