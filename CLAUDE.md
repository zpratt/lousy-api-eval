# Project Instructions

Evaluation tooling for measuring the impact of GitHub Copilot instructions on REST API code quality. This repo contains the **E2E acceptance tests, static analysis configuration, and scorecard** — not the API implementations being evaluated. API implementations are generated separately by coding agents; this repo validates them.

See `.github/specs/lousy-init-api-eval-spec.md` for the full evaluation spec, task prompts, and scorecard.

---

## Commands

```bash
# Core commands
npm test                    # Run unit tests (vitest)
npm run test:e2e            # Run E2E acceptance tests against an API implementation
npx @biomejs/biome lint .   # Lint this repo's code

# File-scoped (faster feedback)
npx biome check path/to/file.ts
npm test path/to/file.test.ts

# Validation suite (run before commits)
npm test && npx @biomejs/biome lint .
```

---

## Workflow: TDD Required

Follow this sequence for ALL code changes. Work in small increments — one change at a time, validate before proceeding.

1. **Research**: Search codebase for existing patterns.
2. **Write failing test**: Create test describing desired behavior
3. **Verify failure**: Run `npm test` — confirm clear failure message
4. **Implement minimal code**: Write just enough to pass
5. **Verify pass**: Run `npm test` — confirm pass
6. **Refactor**: Clean up, remove duplication, keep tests green
7. **Validate**: `npm test && npx @biomejs/biome lint .`

Task is NOT complete until all validation passes.

---

## Tech Stack

- **Runtime**: Node.js (see `.nvmrc` for version)
- **Language**: TypeScript (strict mode)
- **E2E Testing**: Vitest + Testcontainers — tests build and run the API under test from a Dockerfile, then make real HTTP requests
- **Unit Testing**: Vitest, Chance.js for test data generation
- **Static Analysis**: Biome (configured to report code quality metrics on evaluated implementations)
- **Linting**: Biome for this repo's own code

---

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

---

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

---

## E2E Test Design

E2E tests are the primary deliverable of this repo. They serve as the acceptance test suite that scores API implementations.

**Mandatory**: Run `npm run test:e2e` after modifying or creating E2E tests.

See @.github/instructions/e2e-test.instructions.md for Testcontainers patterns, container lifecycle, fixture handling, and E2E-specific test design rules.

Key principles:
- Tests make **real HTTP requests** to a containerized API — no mocking
- Group tests by **scorecard dimension** (e.g., compatibility enforcement, pricing calculation, lifecycle) so results map directly to evaluation criteria
- Each test should verify a **behavioral scenario** described in the scorecard, not individual endpoints
- Assert on **business outcomes** (pricing totals, rejection messages, state transitions), not implementation details

---

## Unit Testing

When writing or modifying unit test files (`*.test.ts`, `*.spec.ts`):

**Mandatory**: Run `npm test` after modifying or creating tests.

See @.github/instructions/test.instructions.md for detailed conventions including test file structure, Chance.js usage, and all test design rules.

---

## Spec Development

When working with spec files (`*.spec.md`):

See @.github/instructions/spec.instructions.md for the full spec development workflow.

---

## CI/CD Pipelines

When modifying GitHub workflows (`.github/workflows/*.yml`, `.github/workflows/*.yaml`):

**Mandatory**: Run `mise lint` after modifying workflows.

See @.github/instructions/pipeline.instructions.md for workflow structure requirements, action SHA pinning format, and runner requirements.

---

## Code Style

- Always use TypeScript type hints
- Use descriptive names for variables, functions, and modules
- Functions must be small with single responsibility
- Favor immutability and pure functions
- Keep cyclomatic complexity low
- Remove all unused imports and variables
- Run lint and tests after EVERY change

---

## Dependencies

- Pin ALL dependencies to exact versions (no `^` or `~`)
- Search npm for latest stable version before adding
- Use explicit version numbers: `npm install <package>@<exact-version>`
- Run `npm audit` after any dependency change
- Ensure `package-lock.json` is updated correctly

---

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
| `operation-description` | Add multi-sentence description of behavior and side effects |
| `operation-tags` | Add at least one tag for doc grouping |
| `operation-success-response` | Define a `200`, `201`, or `204` response |
| `oas3-operation-security-defined` | Reference a security scheme or use `security: []` for public |
| `path-params` | Ensure every `{param}` in the path has a matching parameter definition |
| `oas3-server-trailing-slash` | Remove trailing `/` from server URLs |

### Quality standards

- Extract shared schemas to `components/schemas` using `$ref`
- Provide `example` values on schemas, parameters, and response bodies
- Define `4xx`/`5xx` error responses with proper schemas
- Use semver for `info.version`
- Maintain consistent naming: camelCase for JSON properties, kebab-case for URL paths

### CI

Spectral runs in CI via `.github/workflows/api-lint.yml` on every PR touching spec files. Configuration is in `.spectral.yaml` at the repo root.

---

## Boundaries

**Always do:**
- Write tests before implementation (TDD)
- Run lint and tests after every change
- Run full validation before commits
- Map E2E tests to scorecard dimensions
- Use existing patterns from codebase
- Work in small increments

**Ask first:**
- Adding new dependencies
- Changing project structure
- Modifying GitHub Actions workflows

**Never do:**
- Skip the TDD workflow
- Store secrets in code (use environment variables)
- Use Jest (use Vitest)
- Use mocking in E2E tests (all services must be real containers)
- Modify tests to pass without fixing root cause
- Add dependencies without explicit version numbers
