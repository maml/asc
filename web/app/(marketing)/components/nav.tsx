"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { label: "Problem", href: "#problem" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "MCP Server", href: "#mcp" },
  { label: "Trust & Settlement", href: "#trust" },
  { label: "Get Started", href: "#get-started" },
  { label: "Blog", href: "/blog" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-navy/95 backdrop-blur-md border-b border-navy-light"
          : "bg-transparent border-b border-white/10"
      }`}
    >
      <div className="mx-auto max-w-[1200px] flex items-center justify-between px-6 h-14">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold tracking-widest uppercase text-light">
            ASC
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-6">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="font-mono text-[11px] uppercase tracking-widest text-gray hover:text-light transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            href="/canvas"
            className="font-mono text-[11px] uppercase tracking-widest text-gray hover:text-light transition-colors"
          >
            Dashboard &rarr;
          </Link>
          <a
            href="#get-started"
            className="font-mono text-[11px] uppercase tracking-widest bg-amber text-navy px-3 py-1.5 rounded hover:bg-amber/90 transition-colors"
          >
            Get Started
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="lg:hidden text-gray hover:text-light"
          aria-label="Menu"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden bg-navy border-t border-navy-light px-6 py-4 space-y-3">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block font-mono text-xs uppercase tracking-widest text-gray hover:text-light"
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/canvas"
            onClick={() => setMenuOpen(false)}
            className="block font-mono text-xs uppercase tracking-widest text-gray hover:text-light"
          >
            Dashboard &rarr;
          </Link>
        </div>
      )}
    </nav>
  );
}
