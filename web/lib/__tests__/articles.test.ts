import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAllArticles, getArticleBySlug, getArticleSlugs } from "../articles";

// Mock fs to avoid filesystem dependency in tests
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => [
      "second-post.mdx",
      "first-post.mdx",
      "README.md", // should be filtered out
    ]),
    readFileSync: vi.fn((filePath: string) => {
      if (filePath.includes("first-post")) {
        return [
          "---",
          'title: "First Post"',
          'description: "The first post"',
          'date: "2026-01-01"',
          "tags: [alpha]",
          "---",
          "",
          "First post content.",
        ].join("\n");
      }
      if (filePath.includes("second-post")) {
        return [
          "---",
          'title: "Second Post"',
          'description: "The second post"',
          'date: "2026-02-15"',
          "tags: [beta, update]",
          "---",
          "",
          "Second post content.",
        ].join("\n");
      }
      throw new Error("File not found");
    }),
  },
}));

describe("articles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getArticleSlugs", () => {
    it("returns slugs for .mdx files only", () => {
      const slugs = getArticleSlugs();
      expect(slugs).toEqual(["second-post", "first-post"]);
      expect(slugs).not.toContain("README");
    });
  });

  describe("getArticleBySlug", () => {
    it("parses frontmatter and content", () => {
      const article = getArticleBySlug("first-post");
      expect(article.title).toBe("First Post");
      expect(article.description).toBe("The first post");
      expect(article.date).toBe("2026-01-01");
      expect(article.tags).toEqual(["alpha"]);
      expect(article.slug).toBe("first-post");
      expect(article.content.trim()).toBe("First post content.");
    });

    it("handles multiple tags", () => {
      const article = getArticleBySlug("second-post");
      expect(article.tags).toEqual(["beta", "update"]);
    });
  });

  describe("getAllArticles", () => {
    it("returns articles sorted newest first", () => {
      const articles = getAllArticles();
      expect(articles).toHaveLength(2);
      expect(articles[0].slug).toBe("second-post"); // Feb 2026
      expect(articles[1].slug).toBe("first-post"); // Jan 2026
    });

    it("excludes content from metadata", () => {
      const articles = getAllArticles();
      // content should not be in the returned metadata
      expect("content" in articles[0]).toBe(false);
    });
  });
});
