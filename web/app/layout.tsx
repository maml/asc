import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { PostHogProvider } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://asc.so"),
  title: "ASC — Agentic Services Coordinator",
  description:
    "The coordination layer for AI agent services. Discovery, routing, billing, and settlement for agents working across organizational boundaries.",
  authors: [{ name: "Matt Loseke" }],
  openGraph: {
    title: "ASC — The Coordination Layer for AI Agent Services",
    description:
      "Discovery, routing, billing, and settlement for agents working across organizational boundaries. Open source.",
    url: "https://asc.so",
    siteName: "ASC",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ASC — The Coordination Layer for AI Agent Services",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetbrains.variable} font-sans antialiased`}
      >
        <Suspense fallback={null}>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
