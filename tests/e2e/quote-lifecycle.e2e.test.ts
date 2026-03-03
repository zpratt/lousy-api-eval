import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	addQuoteOption,
	createOption,
	createOptionCategory,
	createQuote,
	createTrim,
	createVehicle,
	expectStatus,
	removeQuoteOption,
	transitionQuote,
} from "./helpers/api-client.js";
import {
	setupTestInfrastructure,
	type TestInfrastructure,
	teardownTestInfrastructure,
} from "./helpers/containers.js";

const chance = new Chance();

describe("quote status lifecycle", () => {
	let infra: TestInfrastructure;
	let baseUrl: string;

	let vehicleId: string;
	let trimId: string;
	let categoryId: string;

	beforeAll(async () => {
		infra = await setupTestInfrastructure();
		baseUrl = infra.baseUrl;

		const vehicle = await expectStatus<{ id: string }>(
			await createVehicle(baseUrl, {
				make: "Lifecycle",
				model: chance.word(),
				year: 2025,
				destinationCharge: 1295,
			}),
			201,
			"Create vehicle for lifecycle tests",
		);
		vehicleId = vehicle.id;

		trimId = (
			await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicleId, {
					name: "LT",
					level: 2,
					msrp: 28500,
				}),
				201,
				"Create trim for lifecycle tests",
			)
		).id;

		categoryId = (
			await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: chance.word(),
				}),
				201,
				"Create category for lifecycle tests",
			)
		).id;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	/** Helper to create a fresh draft quote */
	async function createDraftQuote(): Promise<{ id: string }> {
		return expectStatus<{ id: string }>(
			await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			}),
			201,
			"Create draft quote",
		);
	}

	describe("valid transitions", () => {
		it("should transition from draft to presented", async () => {
			// Arrange
			const quote = await createDraftQuote();

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});

			// Assert
			const body = await expectStatus<{ status: string }>(
				response,
				200,
				"Transition from draft to presented",
			);
			expect(body.status).toBe("presented");
		});

		it("should transition from presented to accepted", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Assert
			const body = await expectStatus<{ status: string }>(
				response,
				200,
				"Transition from presented to accepted",
			);
			expect(body.status).toBe("accepted");
		});

		it("should transition from presented to expired", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "expired",
			});

			// Assert
			const body = await expectStatus<{ status: string }>(
				response,
				200,
				"Transition from presented to expired",
			);
			expect(body.status).toBe("expired");
		});
	});

	describe("invalid transitions", () => {
		it("should reject transitioning from draft directly to accepted", async () => {
			// Arrange
			const quote = await createDraftQuote();

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject transition from draft to accepted",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(
				/transition|cannot|invalid|not allowed/,
			);
		});

		it("should reject transitioning from draft directly to expired", async () => {
			// Arrange
			const quote = await createDraftQuote();

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "expired",
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject transition from draft to expired",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(
				/transition|cannot|invalid|not allowed/,
			);
		});

		it("should reject transitioning from accepted to any other status", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "accepted",
				}),
				200,
				"Transition quote to accepted",
			);

			// Act — try to revert to draft
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "draft",
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject transition from accepted to draft",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(
				/transition|cannot|invalid|not allowed/,
			);
		});

		it("should reject transitioning from expired to any other status", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "expired",
				}),
				200,
				"Transition quote to expired",
			);

			// Act — try to revert to draft
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "draft",
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject transition from expired to draft",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(
				/transition|cannot|invalid|not allowed|expired/,
			);
		});
	});

	describe("modification restrictions", () => {
		it("should allow adding options to a draft quote", async () => {
			// Arrange
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 750,
				}),
				201,
				"Create option for draft modification test",
			);

			const quote = await createDraftQuote();

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			const body = await expectStatus<{ options: string[] }>(
				response,
				201,
				"Add options to draft quote",
			);
			expect(body.options).toContain(opt.id);
		});

		it("should reject adding options to a presented quote", async () => {
			// Arrange
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 750,
				}),
				201,
				"Create option for presented modification test",
			);

			const quote = await createDraftQuote();
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject adding options to presented quote",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(/draft|cannot|modify|immutable/);
		});

		it("should reject adding options to an accepted quote", async () => {
			// Arrange
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 750,
				}),
				201,
				"Create option for accepted modification test",
			);

			const quote = await createDraftQuote();
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "accepted",
				}),
				200,
				"Transition quote to accepted",
			);

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject adding options to accepted quote",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(/draft|cannot|modify|immutable/);
		});

		it("should reject removing options from a presented quote", async () => {
			// Arrange
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 750,
				}),
				201,
				"Create option for presented removal test",
			);

			const quote = await createDraftQuote();
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt.id,
				}),
				201,
				"Add option to quote before presenting",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);

			// Act
			const response = await removeQuoteOption(baseUrl, quote.id, opt.id);

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject removing options from presented quote",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(/draft|cannot|modify|immutable/);
		});

		it("should reject removing options from an accepted quote", async () => {
			// Arrange
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 750,
				}),
				201,
				"Create option for accepted removal test",
			);

			const quote = await createDraftQuote();
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt.id,
				}),
				201,
				"Add option to quote before accepting",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "accepted",
				}),
				200,
				"Transition quote to accepted",
			);

			// Act
			const response = await removeQuoteOption(baseUrl, quote.id, opt.id);

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				409,
				"Reject removing options from accepted quote",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(/draft|cannot|modify|immutable/);
		});
	});

	describe("full lifecycle scenario", () => {
		it("should complete the full lifecycle: create quote, add options, present, and accept", async () => {
			// Arrange — create option, draft quote, add option, transition to presented
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 1000,
				}),
				201,
				"Create option for full lifecycle test",
			);

			const quote = await createDraftQuote();
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt.id,
				}),
				201,
				"Add option to quote",
			);
			await expectStatus(
				await transitionQuote(baseUrl, quote.id, {
					status: "presented",
				}),
				200,
				"Transition quote to presented",
			);

			// Act — accept the presented quote
			const acceptRes = await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Assert — final state reflects the full lifecycle
			const accepted = await expectStatus<{
				status: string;
				options: string[];
			}>(acceptRes, 200, "Accept presented quote in full lifecycle");
			expect(accepted.status).toBe("accepted");
			expect(accepted.options).toContain(opt.id);
		});
	});
});
