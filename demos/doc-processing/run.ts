// Single entry point: starts provider servers, seeds ASC, runs the pipeline.
// Usage: npx tsx demos/doc-processing/run.ts
// Requires: ASC backend running on port 3100 (npm run dev)

import { startDocAIServer } from "./providers/docai-server.js";
import { startLegalAIServer } from "./providers/legalai-server.js";
import { seed } from "./seed.js";
import { runPipeline } from "./pipeline.js";

async function main() {
  console.log("\n🔧 Starting provider servers...\n");

  // Start both provider servers
  const docaiServer = await startDocAIServer();
  console.log("  DocAI Labs     → http://127.0.0.1:4400");
  const legalaiServer = await startLegalAIServer();
  console.log("  LegalAI Inc    → http://127.0.0.1:4500");

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log("\nShutting down...");
    await Promise.all([docaiServer.close(), legalaiServer.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    // Register everything with ASC
    const ids = await seed();

    // Run the 4-stage pipeline
    await runPipeline(ids);
  } catch (err) {
    console.error("\n❌ Pipeline failed:", (err as Error).message);
    process.exit(1);
  }

  // Clean exit
  await Promise.all([docaiServer.close(), legalaiServer.close()]);
}

main();
