import { JetBrains_Mono, Inter } from "next/font/google";

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${jetbrains.variable} ${inter.variable} marketing`}>
      {children}
    </div>
  );
}
