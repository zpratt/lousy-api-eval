import { GenericContainer } from "testcontainers";
import { APP_IMAGE_NAME } from "./helpers/containers.js";

/**
 * Vitest global setup — runs once in the main process before any test workers
 * start. Builds the application Docker image so every worker can reuse the
 * already-built image without triggering a redundant rebuild.
 */
export async function setup(): Promise<void> {
	await GenericContainer.fromDockerfile(".").build(APP_IMAGE_NAME);
}
