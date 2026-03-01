#!/usr/bin/env node

/**
 * spectral-report.mjs
 *
 * Wrapper around Spectral CLI that produces a structured summary
 * optimized for AI coding agents to reason about and act on.
 *
 * Usage:
 *   node scripts/spectral-report.mjs path/to/openapi.yaml
 *   node scripts/spectral-report.mjs  # auto-discovers specs
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SPEC_PATTERNS = [
  /\.openapi\.ya?ml$/,
  /\.openapi\.json$/,
  /^openapi\.ya?ml$/,
  /^openapi\.json$/,
];

function isSpecFile(filename) {
  return SPEC_PATTERNS.some((p) => p.test(filename));
}

function processEntry(dir, entry, depth) {
  if (entry.startsWith(".") || entry === "node_modules") return [];
  const full = join(dir, entry);
  const stat = statSync(full);
  if (stat.isFile() && isSpecFile(entry)) return [full];
  if (stat.isDirectory()) return findSpecs(full, depth - 1);
  return [];
}

function findSpecs(dir, depth = 3) {
  if (depth === 0) return [];
  try {
    return readdirSync(dir).flatMap((entry) => processEntry(dir, entry, depth));
  } catch {
    return [];
  }
}

function lintSpec(specPath) {
  try {
    const raw = execFileSync(
      "spectral",
      ["lint", specPath, "--format=json"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return JSON.parse(raw || "[]");
  } catch (err) {
    // Spectral exits non-zero when there are errors — that's expected
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        return [];
      }
    }
    return [];
  }
}

function summarize(specPath, violations) {
  const errors = violations.filter((v) => v.severity === 0);
  const warnings = violations.filter((v) => v.severity === 1);

  // Group by rule
  const byRule = {};
  for (const v of violations) {
    if (!byRule[v.code]) {
      byRule[v.code] = { count: 0, severity: v.severity, locations: [] };
    }
    byRule[v.code].count++;
    byRule[v.code].locations.push({
      path: v.path.join("."),
      line: v.range?.start?.line + 1,
      message: v.message,
    });
  }

  return {
    spec: specPath,
    pass: errors.length === 0,
    counts: {
      errors: errors.length,
      warnings: warnings.length,
      total: violations.length,
    },
    ruleBreakdown: Object.entries(byRule)
      .sort(([, a], [, b]) => a.severity - b.severity || b.count - a.count)
      .map(([rule, data]) => ({
        rule,
        severity: data.severity === 0 ? "error" : "warning",
        count: data.count,
        locations: data.locations.slice(0, 5),
        ...(data.locations.length > 5 && {
          truncated: `${data.locations.length - 5} more`,
        }),
      })),
  };
}

// --- Main ---
const args = process.argv.slice(2);
const specs = args.length > 0 ? args.map((a) => resolve(a)) : findSpecs(".");

if (specs.length === 0) {
  // biome-ignore lint/suspicious/noConsole: CLI script requires stdout/stderr
  console.error(
    "No OpenAPI spec files found. Pass a path or name files *.openapi.yaml",
  );
  process.exit(1);
}

const results = specs.map((spec) => {
  const violations = lintSpec(spec);
  return summarize(spec, violations);
});

const allPass = results.every((r) => r.pass);

// biome-ignore lint/suspicious/noConsole: CLI script requires stdout/stderr
console.log(JSON.stringify({ allPass, results }, null, 2));

process.exit(allPass ? 0 : 1);
