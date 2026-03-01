# Spectral OpenAPI Linting — Complete Setup Guide

This document contains everything needed to add Spectral API linting to your project with full AI coding agent support (GitHub Copilot coding agent and Claude Code). Each section is a separate file to create in your repo.

---

## Overview

| File | Purpose |
|------|---------|
| `.spectral.yaml` | Spectral rule configuration |
| `.github/workflows/api-lint.yml` | CI workflow — runs on PRs touching specs |
| `.github/copilot-instructions.md` | GitHub Copilot coding agent instructions |
| `CLAUDE.md` | Claude Code agent instructions |
| `scripts/spectral-report.mjs` | Structured lint reporter optimized for AI agents |

### Quick start

```bash
# Install Spectral globally
npm install -g @stoplight/spectral-cli

# Or add as a dev dependency
npm install --save-dev @stoplight/spectral-cli

# Lint your spec
spectral lint openapi.yaml

# Use the structured reporter (better for agents)
node scripts/spectral-report.mjs openapi.yaml
```

### Optional npm scripts for `package.json`

```json
{
  "scripts": {
    "lint:api": "spectral lint openapi.yaml",
    "lint:api:json": "spectral lint openapi.yaml --format=json",
    "lint:api:report": "node scripts/spectral-report.mjs"
  }
}
```

### Customization checklist

Before merging these files into your project:

1. **`.spectral.yaml`** — Enable/disable rules and adjust severities to match your API style guide. Uncomment the path-casing rule if you want to enforce kebab-case paths.
2. **`.github/workflows/api-lint.yml`** — Update the `paths` trigger filter to match where your OpenAPI specs actually live in the repo.
3. **`.github/copilot-instructions.md`** — If you already have one, merge the Spectral section into your existing file.
4. **`CLAUDE.md`** — Same as above; merge into existing if you have one.
5. **`scripts/spectral-report.mjs`** — Update the `SPEC_PATTERNS` regex array if your spec files use different naming conventions.

### How agents use this

Both GitHub Copilot coding agent and Claude Code will:

1. **Discover the rules** by reading the instructions file (`.github/copilot-instructions.md` or `CLAUDE.md`).
2. **Run Spectral** using the commands documented in those files.
3. **Parse structured output** (JSON format) to understand what's wrong and where.
4. **Apply fixes** guided by the rule-specific remediation table.
5. **Re-run lint** to verify fixes and catch regressions.

The `scripts/spectral-report.mjs` helper gives agents a cleaner summary grouped by rule with truncated locations, reducing token usage while preserving actionability.

---

## File: `.spectral.yaml`

Spectral rule configuration. Place at the repo root.

```yaml
extends:
  - "spectral:oas"

rules:
  # --- Structural Quality ---
  operation-operationId: error
  operation-operationId-unique: error
  operation-summary: warn
  operation-description: warn
  operation-tags: warn
  path-params: error
  no-eval-in-markdown: error
  no-script-tags-in-markdown: error
  typed-enum: warn
  oas3-valid-media-example: warn
  oas3-valid-schema-example: warn

  # --- Security ---
  oas3-operation-security-defined: error

  # --- Naming Conventions (customize to your style) ---
  # Uncomment and adjust as needed:
  # path-casing:
  #   severity: error
  #   given: "$.paths"
  #   then:
  #     function: pattern
  #     functionOptions:
  #       match: "^\/[a-z][a-z0-9-\/{}]*$"

  # --- Response Quality ---
  operation-2xx-response:
    severity: error
    description: "Every operation must define at least one 2xx response."

  # --- Description Quality ---
  info-description: warn
  info-contact: warn
  info-license: off

  # --- Server Configuration ---
  oas3-api-servers: warn
  no-server-trailing-slash: error
```

---

## File: `.github/workflows/api-lint.yml`

CI workflow that runs Spectral on every PR touching OpenAPI spec files.

```yaml
name: API Lint

on:
  pull_request:
    paths:
      # Adjust these paths to match where your OpenAPI specs live
      - "**/*.openapi.yaml"
      - "**/*.openapi.json"
      - "openapi/**"
      - "specs/**"
      - ".spectral.yaml"

jobs:
  spectral-lint:
    name: Spectral OpenAPI Lint
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.7

      - name: Setup Node
        uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8  # v4.0.4
        with:
          node-version-file: .nvmrc

      - name: Install Spectral
        run: npm install -g @stoplight/spectral-cli@6.15.0

      - name: Find OpenAPI specs
        id: find-specs
        run: |
          # Adjust the find pattern to match your project structure
          SPECS=$(find . -type f \( -name "*.openapi.yaml" -o -name "*.openapi.json" -o -name "openapi.yaml" -o -name "openapi.json" \) | head -20)
          if [ -z "$SPECS" ]; then
            echo "No OpenAPI spec files found"
            echo "found=false" >> "$GITHUB_OUTPUT"
          else
            echo "Found specs:"
            echo "$SPECS"
            echo "found=true" >> "$GITHUB_OUTPUT"
            # Store newline-delimited list
            EOF=$(dd if=/dev/urandom bs=15 count=1 status=none | base64)
            echo "specs<<$EOF" >> "$GITHUB_OUTPUT"
            echo "$SPECS" >> "$GITHUB_OUTPUT"
            echo "$EOF" >> "$GITHUB_OUTPUT"
          fi

      - name: Lint OpenAPI specs
        if: steps.find-specs.outputs.found == 'true'
        run: |
          EXIT_CODE=0
          while IFS= read -r spec; do
            echo "::group::Linting $spec"
            spectral lint "$spec" \
              --format=github-actions \
              --format=pretty \
              --fail-severity=error || EXIT_CODE=$?
            echo "::endgroup::"
          done <<< "${{ steps.find-specs.outputs.specs }}"
          exit $EXIT_CODE

      - name: Lint summary (JSON artifact)
        if: steps.find-specs.outputs.found == 'true' && always()
        run: |
          mkdir -p lint-results
          while IFS= read -r spec; do
            BASENAME=$(echo "$spec" | sed 's/[\/.]/_/g')
            spectral lint "$spec" \
              --format=json \
              --output="lint-results/${BASENAME}.json" || true
          done <<< "${{ steps.find-specs.outputs.specs }}"

      - name: Upload lint results
        if: steps.find-specs.outputs.found == 'true' && always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02  # v4.6.2
        with:
          name: spectral-lint-results
          path: lint-results/
          retention-days: 5
```

---

## File: `.github/copilot-instructions.md`

Instructions for the GitHub Copilot coding agent. If you already have this file, merge the content below into it.

````markdown
# Copilot Agent Instructions

## OpenAPI Specification Linting with Spectral

This project uses [Spectral](https://github.com/stoplightio/spectral) to lint and validate OpenAPI specifications. Any changes to OpenAPI spec files **must** pass Spectral linting before merge.

### Running Spectral

```bash
# Install (if not already available)
npm install -g @stoplight/spectral-cli

# Lint a single spec
spectral lint path/to/openapi.yaml

# Lint with JSON output for structured analysis
spectral lint path/to/openapi.yaml --format=json

# Lint with specific severity threshold
spectral lint path/to/openapi.yaml --fail-severity=error
```

### When modifying or creating OpenAPI specs

1. **Always run Spectral before committing.** Execute `spectral lint <spec-file>` and resolve all errors. Warnings should be addressed when practical.
2. **Read the full Spectral output.** Each violation includes a rule name (e.g. `operation-operationId`), severity, file path, line number, and a human-readable message. Use these to understand _why_ something is wrong, not just _what_ is wrong.
3. **Fix violations at the source.** Do not suppress rules unless there is a documented, legitimate reason. If a rule must be suppressed, add a comment in the spec explaining why.

### Interpreting Spectral results

Spectral JSON output is an array of objects with this structure:

```json
{
  "code": "rule-name",
  "path": ["paths", "/example", "get", "responses"],
  "message": "Human-readable description of the problem",
  "severity": 0,
  "range": { "start": { "line": 10, "character": 6 }, "end": { "line": 10, "character": 20 } },
  "source": "path/to/openapi.yaml"
}
```

Severity levels: `0` = error, `1` = warning, `2` = info, `3` = hint.

**When reasoning about how to fix a violation:**

- `operation-operationId`: Every operation needs a unique `operationId`. Use camelCase, derived from the HTTP method and path (e.g. `GET /users/{id}` → `getUserById`).
- `operation-summary`: Add a concise, human-readable summary to every operation.
- `operation-description`: Add a longer description explaining what the operation does, when to use it, and any side effects.
- `operation-tags`: Tag every operation for logical grouping in generated docs.
- `operation-2xx-response`: Every operation must define at least one success response (200, 201, 204, etc.).
- `oas3-operation-security-defined`: If the API uses security schemes, every operation should reference one or declare an empty security array for public endpoints.
- `no-server-trailing-slash`: Server URLs must not end with `/`.
- `path-params`: Every path parameter in the URL template must have a corresponding parameter definition.
- `oas3-valid-media-example`: Examples must validate against their schema.
- `typed-enum`: Enum values should match the declared type of the property.

### Iterative refinement workflow

When asked to improve or fix an OpenAPI spec:

1. Run `spectral lint <file> --format=json` and capture the output.
2. Group violations by rule name to understand systemic issues vs one-off mistakes.
3. Fix errors first (severity 0), then warnings (severity 1).
4. After making fixes, re-run Spectral to verify the fix didn't introduce new violations.
5. Repeat until clean or until only intentionally-suppressed warnings remain.

### Spec quality guidelines beyond linting

Spectral catches structural issues, but also apply these principles:

- **Use `$ref` for reusable schemas.** Don't duplicate schema definitions. Extract shared models into `components/schemas`.
- **Provide examples.** Add `example` or `examples` to schemas, parameters, and response bodies. These power documentation and mocking.
- **Use descriptive error responses.** Define `4xx` and `5xx` responses with schema definitions, not just status codes.
- **Semantic versioning.** The `info.version` field should follow semver (e.g. `1.2.0`).
- **Consistent naming.** Use camelCase for JSON property names, kebab-case for URL paths, and UPPER_SNAKE_CASE for enum values (or match whatever convention is already established in the spec).

### CI integration

The `.github/workflows/api-lint.yml` workflow runs Spectral on every PR that touches OpenAPI spec files. It:
- Produces GitHub Actions annotations on the PR (inline error/warning markers)
- Uploads JSON lint results as a build artifact
- Fails the check if any errors are found

The Spectral configuration lives in `.spectral.yaml` at the repo root.
````

---

## File: `CLAUDE.md`

Instructions for Claude Code. If you already have this file, merge the content below into it.

````markdown
# CLAUDE.md

## OpenAPI Linting with Spectral

This project enforces OpenAPI spec quality using Spectral. All OpenAPI specifications must pass `spectral lint` with zero errors before being committed.

### Commands

```bash
# Lint a spec (human-readable output)
spectral lint path/to/openapi.yaml

# Lint a spec (structured JSON for programmatic analysis)
spectral lint path/to/openapi.yaml --format=json

# Lint all specs in a directory
find . -name "*.openapi.yaml" -exec spectral lint {} \;
```

### Workflow for modifying OpenAPI specs

1. Run `spectral lint <file> --format=json` BEFORE and AFTER any changes.
2. Parse the JSON output. Each item has `code` (rule name), `message`, `severity` (0=error, 1=warn), `path` (JSONPath to the violation), and `range` (line/column).
3. Fix all severity 0 (error) violations. Address severity 1 (warning) violations when practical.
4. Re-run lint after fixes to confirm resolution and catch regressions.
5. If a rule must be skipped for a legitimate reason, document the rationale in a code comment adjacent to the suppressed element.

### Common rule fixes

| Rule | Fix |
|------|-----|
| `operation-operationId` | Add unique camelCase `operationId` derived from method + path |
| `operation-summary` | Add short summary string to the operation |
| `operation-description` | Add multi-sentence description of behavior and side effects |
| `operation-tags` | Add at least one tag for doc grouping |
| `operation-2xx-response` | Define a `200`, `201`, or `204` response |
| `oas3-operation-security-defined` | Reference a security scheme or use `security: []` for public |
| `path-params` | Ensure every `{param}` in the path has a matching parameter definition |
| `no-server-trailing-slash` | Remove trailing `/` from server URLs |

### Quality standards

- Extract shared schemas to `components/schemas` using `$ref`
- Provide `example` values on schemas, parameters, and response bodies
- Define `4xx`/`5xx` error responses with proper schemas
- Use semver for `info.version`
- Maintain consistent naming: camelCase for JSON properties, kebab-case for URL paths

### CI

Spectral runs in CI via `.github/workflows/api-lint.yml` on every PR touching spec files. Configuration is in `.spectral.yaml` at the repo root.
````

---

## File: `scripts/spectral-report.mjs`

Wrapper around Spectral CLI that produces structured, grouped output optimized for AI coding agents. Raw `spectral lint --format=json` dumps every violation as a flat array which burns tokens and obscures patterns. This script groups violations by rule, caps output per rule to 5 locations, and gives a clear pass/fail with counts.

```javascript
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
        locations: data.locations.slice(0, 5), // cap to avoid huge output
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
```

---

## Design notes

**Why two separate agent instruction files?** Copilot coding agent reads `.github/copilot-instructions.md` and Claude Code reads `CLAUDE.md` — they don't share a config path. The Copilot version is more verbose with explanatory context (Copilot agents benefit from more scaffolding), while the Claude Code version is more concise with a table-driven rule reference (Claude Code works better with dense, structured instructions).

**Why the `spectral-report.mjs` wrapper?** Raw `spectral lint --format=json` dumps every violation as a flat array. If you have 12 operations missing `operationId`, that's 12 separate JSON objects the agent has to parse. The report script groups them into one entry with `"count": 12`, reducing token usage and helping agents see systemic issues vs one-off mistakes. It also provides a clear `pass`/`fail` boolean at the top level.

**Why `--format=github-actions` in CI?** This format produces `::error` and `::warning` annotations that GitHub renders as inline comments on the PR diff, so reviewers see lint violations exactly where they occur without opening a separate report.