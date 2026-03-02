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
} from "./helpers/api-client.js";
import {
	type TestInfrastructure,
	setupTestInfrastructure,
	teardownTestInfrastructure,
} from "./helpers/containers.js";

const chance = new Chance();

describe("option compatibility enforcement", () => {
	let infra: TestInfrastructure;
	let baseUrl: string;

	// Shared test data created once for all compatibility tests
	let vehicleId: string;
	let baseTrimId: string;
	let sportTrimId: string;
	let premiumTrimId: string;
	let categoryId: string;

	beforeAll(async () => {
		infra = await setupTestInfrastructure();
		baseUrl = infra.baseUrl;

		// Create a vehicle with three trim levels
		const vehicleRes = await createVehicle(baseUrl, {
			make: "Chevrolet",
			model: chance.word(),
			year: 2025,
			destinationCharge: 1295,
		});
		const vehicle = await vehicleRes.json();
		vehicleId = vehicle.id;

		const baseTrimRes = await createTrim(baseUrl, vehicleId, {
			name: "LS",
			level: 1,
			msrp: 25000,
		});
		baseTrimId = (await baseTrimRes.json()).id;

		const sportTrimRes = await createTrim(baseUrl, vehicleId, {
			name: "Sport",
			level: 2,
			msrp: 30000,
		});
		sportTrimId = (await sportTrimRes.json()).id;

		const premiumTrimRes = await createTrim(baseUrl, vehicleId, {
			name: "Premier",
			level: 3,
			msrp: 35000,
		});
		premiumTrimId = (await premiumTrimRes.json()).id;

		// Create an option category
		const catRes = await createOptionCategory(baseUrl, {
			name: "Safety",
		});
		categoryId = (await catRes.json()).id;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	describe("dependency enforcement", () => {
		it("should reject adding an option when its dependency is missing from the quote", async () => {
			// Arrange — create option A (no dependencies) and option B (depends on A)
			const optARes = await createOption(baseUrl, {
				name: "Forward Collision Alert",
				categoryId,
				pricingType: "flat",
				price: 500,
			});
			const optA = await optARes.json();

			const optBRes = await createOption(baseUrl, {
				name: "Adaptive Cruise Control",
				categoryId,
				pricingType: "flat",
				price: 1250,
				dependencies: [optA.id],
			});
			const optB = await optBRes.json();

			// Create a quote
			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Act — try to add B without A
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert — should be rejected with a specific error message
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toContain("require");
		});

		it("should allow adding an option when its dependency is already on the quote", async () => {
			// Arrange
			const optARes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 500,
			});
			const optA = await optARes.json();

			const optBRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 1250,
				dependencies: [optA.id],
			});
			const optB = await optBRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Add the dependency first
			await addQuoteOption(baseUrl, quote.id, { optionId: optA.id });

			// Act — add the dependent option
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.options).toContain(optB.id);
		});
	});

	describe("transitive dependency enforcement", () => {
		it("should reject adding an option when a transitive dependency is missing", async () => {
			// Arrange — A has no deps, B depends on A, C depends on B
			const optARes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 300,
			});
			const optA = await optARes.json();

			const optBRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 600,
				dependencies: [optA.id],
			});
			const optB = await optBRes.json();

			const optCRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 900,
				dependencies: [optB.id],
			});
			const optC = await optCRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Act — try to add C without A or B
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optC.id,
			});

			// Assert
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});

		it("should allow adding option C when both A and B are already on the quote", async () => {
			// Arrange
			const optARes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 300,
			});
			const optA = await optARes.json();

			const optBRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 600,
				dependencies: [optA.id],
			});
			const optB = await optBRes.json();

			const optCRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 900,
				dependencies: [optB.id],
			});
			const optC = await optCRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Add A then B
			await addQuoteOption(baseUrl, quote.id, { optionId: optA.id });
			await addQuoteOption(baseUrl, quote.id, { optionId: optB.id });

			// Act — add C
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optC.id,
			});

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.options).toContain(optC.id);
		});
	});

	describe("exclusion enforcement", () => {
		it("should reject adding an option that excludes an option already on the quote", async () => {
			// Arrange — create option A and option B that excludes A
			const optARes = await createOption(baseUrl, {
				name: "Standard Audio",
				categoryId,
				pricingType: "flat",
				price: 0,
			});
			const optA = await optARes.json();

			const optBRes = await createOption(baseUrl, {
				name: "Premium Audio System",
				categoryId,
				pricingType: "flat",
				price: 1500,
				exclusions: [optA.id],
			});
			const optB = await optBRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Add A first
			await addQuoteOption(baseUrl, quote.id, { optionId: optA.id });

			// Act — try to add B which excludes A
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toContain("exclu");
		});

		it("should allow adding an option when its excluded option is not on the quote", async () => {
			// Arrange
			const optARes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 0,
			});
			const optA = await optARes.json();

			const optBRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 1500,
				exclusions: [optA.id],
			});
			const optB = await optBRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Act — add B without A being on the quote
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert
			expect(response.status).toBe(201);
		});
	});

	describe("trim restriction enforcement", () => {
		it("should reject adding a trim-restricted option to a quote with an ineligible trim", async () => {
			// Arrange — create option restricted to Sport and Premier trims only
			const optRes = await createOption(baseUrl, {
				name: "Performance Exhaust",
				categoryId,
				pricingType: "flat",
				price: 1800,
				trimRestrictions: [sportTrimId, premiumTrimId],
			});
			const opt = await optRes.json();

			// Create a quote with the base (LS) trim
			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Act — try to add trim-restricted option to base trim quote
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toBeDefined();
		});

		it("should allow adding a trim-restricted option when the quote trim is in the allowed list", async () => {
			// Arrange — create option restricted to Sport and Premier trims
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 1800,
				trimRestrictions: [sportTrimId, premiumTrimId],
			});
			const opt = await optRes.json();

			// Create a quote with Sport trim
			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: sportTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(201);
		});

		it("should allow adding an option with no trim restrictions to any trim", async () => {
			// Arrange — create option with no trim restrictions
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 500,
			});
			const opt = await optRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(201);
		});
	});

	describe("removing options from a quote", () => {
		it("should remove an option from a draft quote", async () => {
			// Arrange
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 750,
			});
			const opt = await optRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId: baseTrimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			await addQuoteOption(baseUrl, quote.id, { optionId: opt.id });

			// Act
			const response = await removeQuoteOption(
				baseUrl,
				quote.id,
				opt.id,
			);

			// Assert
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.options).not.toContain(opt.id);
		});
	});
});
