---
applyTo: "tests/e2e/**/*.e2e.test.ts"
---

# End-to-End Test Conventions

## MANDATORY: After Test Changes

Run `npm run test:e2e` after modifying or creating e2e tests to verify all tests pass.

## Vitest E2E Config

E2E tests use a dedicated Vitest config separate from unit tests. Create `vitest.e2e.config.ts` at the project root:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
```

Add a corresponding npm script in `package.json`:

```json
{
  "scripts": {
    "test:e2e": "vitest run --config vitest.e2e.config.ts"
  }
}
```

## Directory Structure

```
tests/
  e2e/
    quoting.e2e.test.ts          # Feature-area test files
    pricing.e2e.test.ts
    fixtures/
      seed-data.json             # Static input data and seed payloads
      config.json                # Config files for test scenarios
      Dockerfile                 # Dockerfile for the app under test (if not at project root)
```

- Place all e2e tests under `tests/e2e/`.
- Place static input data, seed payloads, and config files under `tests/e2e/fixtures/`.
- Name test files after feature areas (e.g., `quoting.e2e.test.ts`), not module names.

## File Naming

All e2e test files use the `*.e2e.test.ts` suffix to distinguish them from unit and integration tests.

## Application Container Setup

Build and start the API under test using `GenericContainer.fromDockerfile()`. This ensures the test exercises the same image that CI and production use.

```typescript
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

const APP_PORT = 3000;

let appContainer: StartedTestContainer;

beforeAll(async () => {
  appContainer = await GenericContainer.fromDockerfile(".")
    .build();

  appContainer = await appContainer
    .withExposedPorts(APP_PORT)
    .withWaitStrategy(
      Wait.forHttp("/health", APP_PORT).forStatusCode(200),
    )
    .start();
});

afterAll(async () => {
  await appContainer?.stop();
});

const baseUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(APP_PORT)}`;
```

Key points:

- Build from the project root Dockerfile (pass `"."` to `fromDockerfile()`).
- Expose the app port and wait for a health endpoint before tests run.
- Retrieve the mapped port via `container.getMappedPort()` — Testcontainers assigns a random host port.
- Start once in `beforeAll`; stop in `afterAll`.

## Backing Service Containers

Use `Network` to connect the app container to any backing service containers (database, cache, message broker, etc.).

```typescript
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

let network: StartedNetwork;
let dbContainer: StartedTestContainer;
let appContainer: StartedTestContainer;

beforeAll(async () => {
  network = await new Network().start();

  // Start backing service first
  dbContainer = await new GenericContainer("postgres:16-alpine")
    .withNetwork(network)
    .withNetworkAliases("db")
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "testdb",
    })
    .withWaitStrategy(Wait.forLogMessage("ready to accept connections"))
    .start();

  // Start app container, connecting to backing service via network alias
  const image = await GenericContainer.fromDockerfile(".").build();
  appContainer = await image
    .withNetwork(network)
    .withExposedPorts(APP_PORT)
    .withEnvironment({
      DATABASE_URL: "postgresql://test:test@db:5432/testdb",
    })
    .withWaitStrategy(
      Wait.forHttp("/health", APP_PORT).forStatusCode(200),
    )
    .start();
});

afterAll(async () => {
  // Stop in reverse order
  await appContainer?.stop();
  await dbContainer?.stop();
  await network?.stop();
});
```

Pattern summary:

- Use `.withNetwork()` and `.withNetworkAliases()` so containers resolve each other by alias.
- Pass connection config to the app container via `.withEnvironment()`.
- Start backing services **before** the app container.
- Stop in **reverse** order in `afterAll`.

## Test Structure

Tests follow the same Arrange-Act-Assert pattern and spec-style `describe`/`it` blocks as unit tests, with these differences:

- **Group by feature/behavior area**, not by route or endpoint.
- Use nested `describe` blocks for "given" context (e.g., `"given a draft quote with incompatible options"`).
- Tests make **real HTTP requests** using `fetch` — no MSW, no mocked HTTP.
- Extract a `baseUrl` variable from the container host + mapped port; construct request URLs from it.

```typescript
describe("quoting", () => {
  let baseUrl: string;

  beforeAll(async () => {
    // ... container setup ...
    baseUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(APP_PORT)}`;
  });

  describe("given a valid quote request", () => {
    it("creates the quote and returns the quote ID", async () => {
      // Arrange
      const payload = { customerName: chance.name(), items: [{ sku: chance.guid() }] };

      // Act
      const response = await fetch(`${baseUrl}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.id).toBeDefined();
    });
  });
});
```

## Test Data & Fixtures

- Use **Chance.js** to generate request payloads (customer names, option names, IDs, etc.) when specific values don't matter.
- Use **static fixture files** for seed data or complex setup payloads that must be internally consistent.
- Load fixtures via `readFileSync` from `tests/e2e/fixtures/`.

```typescript
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";

const chance = new Chance();
const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// Generated data for fields where exact values don't matter
const customerName = chance.name();

// Static fixture for complex, internally-consistent seed data
const seedPayload = JSON.parse(
  readFileSync(resolve(FIXTURES_DIR, "seed-data.json"), "utf-8"),
);
```

## No Mocking Rule

E2E tests must **NOT** use MSW, `vi.fn()`, or any test doubles. All dependencies are real containers running real services. The only exception is capturing stdout/stderr output for CLI-based tests.

## Shared State Between Tests

- Containers started in `beforeAll` can be shared across tests within the same `describe` block.
- Use API calls in `beforeEach` to reset application state (e.g., POST to a reset endpoint, or re-seed data) for test isolation.
- If the API lacks a reset mechanism, start a fresh container per `describe` block.

## Error & Status Code Assertions

Assert on **both** HTTP status codes AND response body content. Verify that error responses include specific, actionable messages — not just a generic status.

```typescript
describe("given an invalid quote request", () => {
  it("returns a 400 with a descriptive error message", async () => {
    // Arrange
    const invalidPayload = { items: [] };

    // Act
    const response = await fetch(`${baseUrl}/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload),
    });

    // Assert
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("at least one item");
  });
});
```

## Timeout Guidance

Container startup is slow (10–60 seconds typical). Minimize the number of container restarts:

- Prefer resetting state via API calls over restarting containers.
- The `vitest.e2e.config.ts` sets `testTimeout` and `hookTimeout` to 300 seconds to accommodate container startup.
- If a single `beforeAll` block starts multiple containers, the cumulative startup time can be significant. Plan accordingly.

## CI Considerations

- Docker must be available in CI. Tests require the Docker socket.
- Run e2e tests as a **separate CI job/step** from unit tests to avoid inflating overall test time.
- Reference `vitest.e2e.config.ts` for the separate test run:

```bash
npm run test:e2e
```

## Cleanup

All containers, networks, and temp directories **must** be cleaned up in `afterAll`. Use `try/finally` blocks in `beforeAll` to ensure cleanup happens even on setup failures.

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let network: StartedNetwork;
let backingContainer: StartedTestContainer;
let appContainer: StartedTestContainer;
let tempDir: string;

beforeAll(async () => {
  network = await new Network().start();

  try {
    tempDir = mkdtempSync(join(tmpdir(), "e2e-"));

    backingContainer = await new GenericContainer("some-service:latest")
      .withNetwork(network)
      .withNetworkAliases("backing")
      .withExposedPorts(5000)
      .withWaitStrategy(Wait.forHttp("/", 5000).forStatusCode(200))
      .start();

    const image = await GenericContainer.fromDockerfile(".").build();
    appContainer = await image
      .withNetwork(network)
      .withExposedPorts(APP_PORT)
      .withBindMounts([{ source: tempDir, target: "/data" }])
      .withWaitStrategy(
        Wait.forHttp("/health", APP_PORT).forStatusCode(200),
      )
      .start();
  } catch (error) {
    // Cleanup on setup failure
    await appContainer?.stop();
    await backingContainer?.stop();
    await network?.stop();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
});

afterAll(async () => {
  await appContainer?.stop();
  await backingContainer?.stop();
  await network?.stop();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});
```

## Test Design Rules

These rules complement the unit test rules in `test.instructions.md`:

1. **No mocking** — all services are real containers. No MSW, no `vi.fn()`, no test doubles.
2. **Tests must be deterministic** — seed data and generated payloads must produce consistent behavior.
3. **Test behavioral scenarios, not individual endpoints** — a single test may hit multiple endpoints to verify a workflow.
4. **Assert on business outcomes** (pricing totals, error messages, state transitions), not implementation details.
5. **Keep tests coarse-grained** — each test should verify a meaningful user-facing scenario.
6. **Log container output on failure** for debugging — use `container.logs()` in error handlers.

## Example

A complete annotated example showing the full lifecycle: `Network` + backing service container + app container from Dockerfile, `beforeAll`/`afterAll`, a happy-path test, and an error-path test.

```typescript
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chance = new Chance();
const APP_PORT = 3000;

const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// --- Infrastructure helpers ---

async function startBackingService(
  network: StartedNetwork,
): Promise<StartedTestContainer> {
  return new GenericContainer("postgres:16-alpine")
    .withNetwork(network)
    .withNetworkAliases("db")
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "testdb",
    })
    .withWaitStrategy(Wait.forLogMessage("ready to accept connections"))
    .start();
}

async function startAppContainer(
  network: StartedNetwork,
): Promise<StartedTestContainer> {
  const image = await GenericContainer.fromDockerfile(".").build();
  return image
    .withNetwork(network)
    .withExposedPorts(APP_PORT)
    .withEnvironment({
      DATABASE_URL: "postgresql://test:test@db:5432/testdb",
      NODE_ENV: "test",
    })
    .withWaitStrategy(
      Wait.forHttp("/health", APP_PORT).forStatusCode(200),
    )
    .start();
}

// --- Tests ---

describe("quoting workflow", () => {
  let network: StartedNetwork;
  let dbContainer: StartedTestContainer;
  let appContainer: StartedTestContainer;
  let baseUrl: string;

  beforeAll(async () => {
    network = await new Network().start();

    try {
      dbContainer = await startBackingService(network);
      appContainer = await startAppContainer(network);
      baseUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(APP_PORT)}`;
    } catch (error) {
      // Log container output for debugging
      const logs = await appContainer?.logs();
      if (logs) {
        logs.on("data", (line) => console.error("[app]", line));
      }
      await appContainer?.stop();
      await dbContainer?.stop();
      await network?.stop();
      throw error;
    }
  });

  afterAll(async () => {
    await appContainer?.stop();
    await dbContainer?.stop();
    await network?.stop();
  });

  describe("given a valid quote request", () => {
    it("creates the quote and returns pricing details", async () => {
      // Arrange
      const customerName = chance.name();
      const payload = {
        customerName,
        items: [{ sku: chance.guid(), quantity: chance.integer({ min: 1, max: 10 }) }],
      };

      // Act
      const response = await fetch(`${baseUrl}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.id).toBeDefined();
      expect(body.customerName).toBe(customerName);
      expect(body.totalPrice).toBeGreaterThan(0);
    });
  });

  describe("given a quote request missing required fields", () => {
    it("returns a 400 with specific validation errors", async () => {
      // Arrange
      const invalidPayload = { items: [] };

      // Act
      const response = await fetch(`${baseUrl}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidPayload),
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("customerName");
      expect(body.error).toContain("at least one item");
    });
  });

  describe("given a multi-step quoting workflow", () => {
    it("creates a draft, adds items, and finalizes the quote", async () => {
      // Arrange — create draft
      const draftPayload = {
        customerName: chance.name(),
        items: [{ sku: chance.guid(), quantity: 1 }],
      };
      const createResponse = await fetch(`${baseUrl}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });
      const { id: quoteId } = await createResponse.json();

      // Act — finalize
      const finalizeResponse = await fetch(
        `${baseUrl}/quotes/${quoteId}/finalize`,
        { method: "POST" },
      );

      // Assert
      expect(finalizeResponse.status).toBe(200);
      const finalized = await finalizeResponse.json();
      expect(finalized.status).toBe("finalized");
      expect(finalized.totalPrice).toBeGreaterThan(0);
    });
  });
});
```

Key patterns in the example:

- **Helper functions** (`startBackingService`, `startAppContainer`) separate infrastructure setup from test logic.
- **`try/catch` in `beforeAll`** ensures cleanup on setup failure and logs container output for debugging.
- **`baseUrl`** is derived from the container's mapped port — no hardcoded ports.
- **Happy-path test** asserts on business-meaningful response fields.
- **Error-path test** asserts on both status code and specific error message content.
- **Multi-step test** exercises a full workflow across multiple endpoints.
