import type { MDXComponents } from "mdx/types";

export const mdxComponents: MDXComponents = {
  h2: (props) => (
    <h2
      className="text-xl font-semibold text-light mt-10 mb-4"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="text-lg font-semibold text-light mt-8 mb-3"
      {...props}
    />
  ),
  p: (props) => <p className="text-gray leading-relaxed mb-4" {...props} />,
  a: (props) => (
    <a
      className="text-amber hover:text-amber/80 underline underline-offset-2"
      {...props}
    />
  ),
  ul: (props) => <ul className="list-disc list-inside text-gray mb-4 space-y-1" {...props} />,
  ol: (props) => <ol className="list-decimal list-inside text-gray mb-4 space-y-1" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="text-light font-semibold" {...props} />,
  code: (props) => (
    <code
      className="font-mono text-sm bg-navy-light px-1.5 py-0.5 rounded text-amber/90"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="bg-[#0d1117] border border-navy-light rounded-lg p-4 overflow-x-auto mb-6 text-sm"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="border-l-2 border-amber/40 pl-4 text-gray italic mb-4"
      {...props}
    />
  ),
  hr: () => <hr className="border-navy-light my-8" />,
};
