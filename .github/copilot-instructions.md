---
applyTo: "**"
---

# Project Overview

Evaluation tooling for measuring the impact of GitHub Copilot instructions on REST API code quality. This repo contains the **E2E acceptance tests, static analysis configuration, and scorecard** — not the API implementations being evaluated. API implementations are generated separately by coding agents; this repo validates them.

**Mandatory**: Read `.github/specs/lousy-init-api-eval-spec.md` for the full evaluation spec, task prompts, and scorecard.

## Commands

```bash
# Core commands
npm test                    # Run unit tests (vitest)
npm run test:e2e            # Run E2E acceptance tests against an API implementation
npm run lint                # Lint this repo's code (Biome)
npm run lint:spectral -- path/to/openapi.yaml  # MANDATORY: Lint OpenAPI specs (OWASP + structural rules)
npm run lint:api            # MANDATORY: Structured Spectral report (auto-discovers specs)

# File-scoped (faster feedback)
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Validation suite (run before commits)
npm test && npm run lint
# If OpenAPI specs exist or were modified:
npm run lint:spectral -- path/to/openapi.yaml
```

## Workflow: TDD Required

Follow this exact sequence for ALL code changes. Work in small increments — make one change at a time and validate before proceeding.

1. **Research**: Search codebase for existing patterns.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `npm test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `npm test` — confirm pass
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Validate**: `npm test && npx @biomejs/biome lint .`
8. **Validate OpenAPI specs** (if any exist or were modified): `npm run lint:spectral -- <spec-file>` — this is **mandatory**, not optional. All OWASP API Security Top 10 rules are enforced at error severity.

Task is NOT complete until all validation passes.

## Tech Stack

- **Runtime**: Node.js (see `.nvmrc` for version)
- **Language**: TypeScript (strict mode)
- **E2E Testing**: Vitest + Testcontainers — tests build and run the API under test from a Dockerfile, then make real HTTP requests
- **Unit Testing**: Vitest, Chance.js for test data generation
- **Static Analysis**: Biome (configured to report code quality metrics on evaluated implementations)
- **Linting**: Biome for this repo's own code

## Project Structure

```
.github/
  specs/             Evaluation spec (task prompts, scorecard)
  instructions/      Instruction files for Copilot and Claude Code
  prompts/           Reusable prompt files
tests/
  e2e/               E2E acceptance tests run against API implementations
    fixtures/        Seed data, config files, Dockerfiles
  unit/              Unit tests for any shared utilities
biome.json           Static analysis config (applied to evaluated implementations)
```

## Domain Context (What the Tests Validate)

The E2E tests validate an automotive dealership vehicle quoting API. Understanding the domain is essential for writing correct acceptance tests.

### Task A — Greenfield API

Tests verify these behaviors in the generated API:

- **Vehicle & option CRUD** — standard create/retrieve for models, trims, options, categories
- **Option compatibility enforcement** — dependency rules (option A requires option B), exclusion rules (A excludes B), and trim-level restrictions must be enforced when adding options to a quote; violations must be rejected with specific error messages
- **Transitive dependencies** — if C requires B and B requires A, adding C without A must fail
- **Pricing calculation** — base MSRP + additive options + percentage-based options (calculated dynamically from MSRP) + package discounts (only when all member options are selected) + destination charge (flat fee, separate from options)
- **Quote status lifecycle** — draft → presented → accepted → expired; only draft quotes can be modified; accepted quotes cannot be reverted

### Task B — Expansion (Incentive Programs)

Tests verify these additional behaviors layered onto the Task A API:

- **Program eligibility** — rules evaluated dynamically against quote state (vehicle model list, minimum trim level, quote total threshold, option/category inclusion, date range)
- **Benefit types** — flat dollar discount, percentage off base MSRP, percentage off options in a category
- **Stacking rules** — exclusive programs (best single discount wins by dollar impact), non-exclusive programs stack additively with a configurable cap
- **Pricing breakdown** — fully itemized response: base MSRP, options, packages, destination, subtotal, each applied incentive, final price
- **What-if evaluation** — check eligibility without mutating state

### Required API Routes

Tests target these exact paths (defined in the eval spec):

```
POST /vehicles, GET /vehicles, GET /vehicles/:id
POST /vehicles/:vehicleId/trims, GET /vehicles/:vehicleId/trims
POST /options, GET /options, GET /options/:id
POST /option-categories, GET /option-categories
POST /quotes, GET /quotes, GET /quotes/:id
POST /quotes/:id/options, DELETE /quotes/:id/options/:optionId
POST /quotes/:id/calculate
POST /quotes/:id/transition
POST /incentive-programs, GET /incentive-programs, GET /incentive-programs/:id
POST /incentive-programs/:id/rules
POST /incentive-programs/:id/benefits
POST /quotes/:id/evaluate-incentives
POST /quotes/:id/apply-incentives
GET /quotes/:id/pricing-breakdown
```

## E2E Test Design

E2E tests are the primary deliverable of this repo. They serve as the acceptance test suite that scores API implementations.

See `.github/instructions/e2e-test.instructions.md` for Testcontainers patterns, container lifecycle, fixture handling, and E2E-specific test design rules.

Key principles:
- Tests make **real HTTP requests** to a containerized API — no mocking
- Group tests by **scorecard dimension** (e.g., compatibility enforcement, pricing calculation, lifecycle) so results map directly to evaluation criteria
- Each test should verify a **behavioral scenario** described in the scorecard, not individual endpoints
- Assert on **business outcomes** (pricing totals, rejection messages, state transitions), not implementation details

## Unit Testing

When writing or modifying unit test files (`*.test.ts`, `*.spec.ts`):

**Mandatory**: Run `npm test` after modifying or creating tests.

See `.github/instructions/test.instructions.md` for detailed conventions including test file structure, Chance.js usage, and all test design rules.

## Code Style

- Always use TypeScript type hints
- Use descriptive names for variables, functions, and modules
- Functions must be small with single responsibility
- Favor immutability and pure functions
- Keep cyclomatic complexity low
- Remove all unused imports and variables
- Run lint and tests after EVERY change

## Dependencies

- Pin ALL dependencies to exact versions (no `^` or `~`)
- Search npm for latest stable version before adding
- Use explicit version numbers: `npm install <package>@<exact-version>`
- Run `npm audit` after any dependency change

## OpenAPI Specification Linting with Spectral

This project uses [Spectral](https://github.com/stoplightio/spectral) to lint and validate OpenAPI specifications. Spectral enforces both structural quality rules and **OWASP API Security Top 10 (2023)** rules — all at error severity.

**⚠️ MANDATORY: Running Spectral is not optional.** Any time you create or modify an OpenAPI spec file, you **must** run `npm run lint:spectral -- <spec-file>` and resolve all errors before considering the task complete. This applies to every coding workflow — not just commits.

### Running Spectral

```bash
# Lint a specific spec (fails on errors)
npm run lint:spectral -- path/to/openapi.yaml

# Lint with JSON output for structured analysis
npm run lint:spectral -- path/to/openapi.yaml --format=json

# Auto-discover and lint all specs with structured report
npm run lint:api
```

### When modifying or creating OpenAPI specs

1. **Always run Spectral before committing.** Execute `npm run lint:spectral -- <spec-file>` and resolve all errors. Warnings should be addressed when practical.
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
- `operation-description`: Add a longer description explaining what the operation does, when to use it, and any side effects.
- `operation-tags`: Tag every operation for logical grouping in generated docs.
- `operation-success-response`: Every operation must define at least one success response (200, 201, 204, etc.).
- `oas3-operation-security-defined`: If the API uses security schemes, every operation should reference one or declare an empty security array for public endpoints.
- `oas3-server-trailing-slash`: Server URLs must not end with `/`.
- `path-params`: Every path parameter in the URL template must have a corresponding parameter definition.
- `oas3-valid-media-example`: Examples must validate against their schema.
- `typed-enum`: Enum values should match the declared type of the property.

### Iterative refinement workflow

When asked to improve or fix an OpenAPI spec:

1. Run `npm run lint:spectral -- <file> --format=json` and capture the output.
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

## Boundaries

**✅ Always do:**
- Write tests before implementation (TDD)
- Run lint and tests after every change
- Run `npm run lint:spectral` on any OpenAPI spec file after every change — this is mandatory
- Run full validation before commits
- Map E2E tests to scorecard dimensions
- Use existing patterns from codebase
- Work in small increments

**⚠️ Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows

**🚫 Never do:**
- Skip the TDD workflow
- Skip Spectral linting on OpenAPI spec files
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Use mocking in E2E tests (all services must be real containers)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
