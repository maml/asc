#!/usr/bin/env node
// Counts tests, endpoints, and MCP tools from source code.
// Runs as a prebuild step — writes web/app/stats.json.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/** Recursively collect all files matching a predicate */
function walk(dir: string, test: (f: string) => boolean): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...walk(full, test));
    else if (test(full)) results.push(full);
  }
  return results;
}

/** Count regex matches across files */
function countMatches(files: string[], pattern: RegExp): number {
  let total = 0;
  for (const f of files) {
    const content = readFileSync(f, "utf-8");
    const matches = content.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

// --- Tests: count it( and test( calls in *.test.ts files ---
const testFiles = walk(ROOT, (f) => f.endsWith(".test.ts"));
const testCount = countMatches(testFiles, /\bit\(/g) + countMatches(testFiles, /\btest\(/g);

// --- MCP tools: count server.tool( in packages/mcp-server/src/tools/ ---
const mcpToolDir = join(ROOT, "packages/mcp-server/src/tools");
const mcpToolFiles = walk(mcpToolDir, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const mcpToolCount = countMatches(mcpToolFiles, /server\.tool\(/g);

// --- Endpoints: count route registrations in src/ ---
// Routes use app.get(, app.post(, app.patch(, app.delete( or fastify equivalents
const srcDir = join(ROOT, "src");
const routeFiles = walk(srcDir, (f) => f.includes("route") && f.endsWith(".ts") && !f.endsWith(".test.ts"));
const endpointCount = countMatches(routeFiles, /\.(get|post|put|patch|delete)\s*\(/g);

const stats = { tests: testCount, endpoints: endpointCount, mcpTools: mcpToolCount };

writeFileSync(join(ROOT, "web/app/stats.json"), JSON.stringify(stats, null, 2) + "\n");
console.log(`Stats collected: ${stats.tests} tests, ${stats.endpoints} endpoints, ${stats.mcpTools} MCP tools`);
