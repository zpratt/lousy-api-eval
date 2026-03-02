import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	addQuoteOption,
	createOption,
	createOptionCategory,
	createQuote,
	createTrim,
	createVehicle,
	removeQuoteOption,
	transitionQuote,
} from "./helpers/api-client.js";
import {
	type TestInfrastructure,
	setupTestInfrastructure,
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

		const vehicleRes = await createVehicle(baseUrl, {
			make: "Lifecycle",
			model: chance.word(),
			year: 2025,
			destinationCharge: 1295,
		});
		vehicleId = (await vehicleRes.json()).id;

		const trimRes = await createTrim(baseUrl, vehicleId, {
			name: "LT",
			level: 2,
			msrp: 28500,
		});
		trimId = (await trimRes.json()).id;

		const catRes = await createOptionCategory(baseUrl, {
			name: chance.word(),
		});
		categoryId = (await catRes.json()).id;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	/** Helper to create a fresh draft quote */
	async function createDraftQuote(): Promise<{ id: string }> {
		const res = await createQuote(baseUrl, {
			vehicleId,
			trimId,
			customerName: chance.name(),
		});
		return res.json();
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
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.status).toBe("presented");
		});

		it("should transition from presented to accepted", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Assert
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.status).toBe("accepted");
		});

		it("should transition from presented to expired", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "expired",
			});

			// Assert
			expect(response.status).toBe(200);
			const body = await response.json();
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
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});

		it("should reject transitioning from draft directly to expired", async () => {
			// Arrange
			const quote = await createDraftQuote();

			// Act
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "expired",
			});

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});

		it("should reject transitioning from accepted to any other status", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});
			await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Act — try to revert to draft
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "draft",
			});

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});

		it("should reject transitioning from expired to any other status", async () => {
			// Arrange
			const quote = await createDraftQuote();
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});
			await transitionQuote(baseUrl, quote.id, {
				status: "expired",
			});

			// Act — try to revert to draft
			const response = await transitionQuote(baseUrl, quote.id, {
				status: "draft",
			});

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});
	});

	describe("modification restrictions", () => {
		it("should allow adding options to a draft quote", async () => {
			// Arrange
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 750,
			});
			const opt = await optRes.json();

			const quote = await createDraftQuote();

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.options).toContain(opt.id);
		});

		it("should reject adding options to a presented quote", async () => {
			// Arrange
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 750,
			});
			const opt = await optRes.json();

			const quote = await createDraftQuote();
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toContain("draft");
		});

		it("should reject adding options to an accepted quote", async () => {
			// Arrange
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 750,
			});
			const opt = await optRes.json();

			const quote = await createDraftQuote();
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});
			await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});

		it("should reject removing options from a presented quote", async () => {
			// Arrange
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 750,
			});
			const opt = await optRes.json();

			const quote = await createDraftQuote();
			await addQuoteOption(baseUrl, quote.id, { optionId: opt.id });
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});

			// Act
			const response = await removeQuoteOption(
				baseUrl,
				quote.id,
				opt.id,
			);

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toContain("draft");
		});

		it("should reject removing options from an accepted quote", async () => {
			// Arrange
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 750,
			});
			const opt = await optRes.json();

			const quote = await createDraftQuote();
			await addQuoteOption(baseUrl, quote.id, { optionId: opt.id });
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});
			await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Act
			const response = await removeQuoteOption(
				baseUrl,
				quote.id,
				opt.id,
			);

			// Assert
			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});
	});

	describe("full lifecycle scenario", () => {
		it("should complete the full lifecycle: create quote, add options, present, and accept", async () => {
			// Arrange — create option, draft quote, add option, transition to presented
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 1000,
			});
			const opt = await optRes.json();

			const quote = await createDraftQuote();
			await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});
			await transitionQuote(baseUrl, quote.id, {
				status: "presented",
			});

			// Act — accept the presented quote
			const acceptRes = await transitionQuote(baseUrl, quote.id, {
				status: "accepted",
			});

			// Assert — final state reflects the full lifecycle
			expect(acceptRes.status).toBe(200);
			const accepted = await acceptRes.json();
			expect(accepted.status).toBe("accepted");
			expect(accepted.options).toContain(opt.id);
		});
	});
});
