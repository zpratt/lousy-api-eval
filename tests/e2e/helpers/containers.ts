import {
	GenericContainer,
	Network,
	type StartedNetwork,
	type StartedTestContainer,
	Wait,
} from "testcontainers";

const APP_PORT = 3000;
const DB_PORT = 5432;

export interface TestInfrastructure {
	network: StartedNetwork;
	dbContainer: StartedTestContainer;
	appContainer: StartedTestContainer;
	baseUrl: string;
}

export async function startPostgres(
	network: StartedNetwork,
): Promise<StartedTestContainer> {
	return new GenericContainer("postgres:16-alpine")
		.withNetwork(network)
		.withNetworkAliases("db")
		.withExposedPorts(DB_PORT)
		.withEnvironment({
			POSTGRES_USER: "test",
			POSTGRES_PASSWORD: "test",
			POSTGRES_DB: "testdb",
		})
		.withWaitStrategy(Wait.forListeningPorts())
		.start();
}

export async function startApp(
	network: StartedNetwork,
): Promise<StartedTestContainer> {
	const image = await GenericContainer.fromDockerfile(".").build();
	return image
		.withNetwork(network)
		.withExposedPorts(APP_PORT)
		.withEnvironment({
			DATABASE_URL: "postgresql://test:test@db:5432/testdb",
			NODE_ENV: "test",
			PORT: String(APP_PORT),
		})
		.withWaitStrategy(
			Wait.forHttp("/health", APP_PORT).forStatusCode(200),
		)
		.start();
}

export async function setupTestInfrastructure(): Promise<TestInfrastructure> {
	const network = await new Network().start();
	let dbContainer: StartedTestContainer | undefined;
	let appContainer: StartedTestContainer | undefined;

	try {
		dbContainer = await startPostgres(network);
		appContainer = await startApp(network);
		const baseUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(APP_PORT)}`;

		return { network, dbContainer, appContainer, baseUrl };
	} catch (error) {
		if (appContainer) {
			const logs = await appContainer.logs();
			logs.on("data", (line) => console.error("[app]", line));
		}
		await appContainer?.stop();
		await dbContainer?.stop();
		await network?.stop();
		throw error;
	}
}

export async function teardownTestInfrastructure(
	infra: TestInfrastructure | undefined,
): Promise<void> {
	if (!infra) return;
	await infra.appContainer?.stop();
	await infra.dbContainer?.stop();
	await infra.network?.stop();
}
