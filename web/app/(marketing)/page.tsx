import { Nav } from "./components/nav";
import { Hero } from "./components/hero";
import { Problem } from "./components/problem";
import { HowItWorks } from "./components/how-it-works";
import { McpSection } from "./components/mcp-section";
import { TrustSettlement } from "./components/trust-settlement";
import { GetStarted } from "./components/get-started";
import { Footer } from "./components/footer";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <McpSection />
        <TrustSettlement />
        <GetStarted />
      </main>
      <Footer />
    </>
  );
}
