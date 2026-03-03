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
} from "./helpers/api-client.js";
import {
	setupTestInfrastructure,
	type TestInfrastructure,
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
		const vehicle = await expectStatus<{ id: string }>(
			await createVehicle(baseUrl, {
				make: "Chevrolet",
				model: chance.word(),
				year: 2025,
				destinationCharge: 1295,
			}),
			201,
			"Create vehicle for compatibility tests",
		);
		vehicleId = vehicle.id;

		baseTrimId = (
			await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicleId, {
					name: "LS",
					level: 1,
					msrp: 25000,
				}),
				201,
				"Create LS trim",
			)
		).id;

		sportTrimId = (
			await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicleId, {
					name: "Sport",
					level: 2,
					msrp: 30000,
				}),
				201,
				"Create Sport trim",
			)
		).id;

		premiumTrimId = (
			await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicleId, {
					name: "Premier",
					level: 3,
					msrp: 35000,
				}),
				201,
				"Create Premier trim",
			)
		).id;

		// Create an option category
		categoryId = (
			await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: "Safety",
				}),
				201,
				"Create Safety category",
			)
		).id;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	describe("dependency enforcement", () => {
		it("should reject adding an option when its dependency is missing from the quote", async () => {
			// Arrange — create option A (no dependencies) and option B (depends on A)
			const optA = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: "Forward Collision Alert",
					categoryId,
					pricingType: "flat",
					price: 500,
				}),
				201,
				"Create option A (dependency)",
			);

			const optB = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: "Adaptive Cruise Control",
					categoryId,
					pricingType: "flat",
					price: 1250,
					dependencies: [optA.id],
				}),
				201,
				"Create option B (depends on A)",
			);

			// Create a quote
			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for dependency test",
			);

			// Act — try to add B without A
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert — should be rejected with a specific error message
			const body = await expectStatus<{ error: string }>(
				response,
				400,
				"Reject adding option with missing dependency",
			);
			expect(body.error).toBeDefined();
			const normalizedError = body.error.toLowerCase();
			expect(normalizedError).toMatch(/require|depend/);
		});

		it("should allow adding an option when its dependency is already on the quote", async () => {
			// Arrange
			const optA = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 500,
				}),
				201,
				"Create option A",
			);

			const optB = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 1250,
					dependencies: [optA.id],
				}),
				201,
				"Create option B (depends on A)",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for dependency satisfied test",
			);

			// Add the dependency first
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: optA.id,
				}),
				201,
				"Add dependency option A to quote",
			);

			// Act — add the dependent option
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert
			const body = await expectStatus<{ options: string[] }>(
				response,
				201,
				"Add option with satisfied dependency",
			);
			expect(body.options).toContain(optB.id);
		});
	});

	describe("transitive dependency enforcement", () => {
		it("should reject adding an option when a transitive dependency is missing", async () => {
			// Arrange — A has no deps, B depends on A, C depends on B
			const optA = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 300,
				}),
				201,
				"Create option A (transitive chain)",
			);

			const optB = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 600,
					dependencies: [optA.id],
				}),
				201,
				"Create option B (depends on A)",
			);

			const optC = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 900,
					dependencies: [optB.id],
				}),
				201,
				"Create option C (depends on B)",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for transitive dependency test",
			);

			// Act — try to add C without A or B
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optC.id,
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				400,
				"Reject adding option with missing transitive dependency",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(/require|depend/);
		});

		it("should allow adding option C when both A and B are already on the quote", async () => {
			// Arrange
			const optA = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 300,
				}),
				201,
				"Create option A (transitive success chain)",
			);

			const optB = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 600,
					dependencies: [optA.id],
				}),
				201,
				"Create option B (depends on A)",
			);

			const optC = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 900,
					dependencies: [optB.id],
				}),
				201,
				"Create option C (depends on B)",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for transitive success test",
			);

			// Add A then B
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: optA.id,
				}),
				201,
				"Add option A to quote",
			);
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: optB.id,
				}),
				201,
				"Add option B to quote",
			);

			// Act — add C
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optC.id,
			});

			// Assert
			const body = await expectStatus<{ options: string[] }>(
				response,
				201,
				"Add option C with satisfied transitive dependencies",
			);
			expect(body.options).toContain(optC.id);
		});
	});

	describe("exclusion enforcement", () => {
		it("should reject adding an option that excludes an option already on the quote", async () => {
			// Arrange — create option A and option B that excludes A
			const optA = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: "Standard Audio",
					categoryId,
					pricingType: "flat",
					price: 0,
				}),
				201,
				"Create Standard Audio option",
			);

			const optB = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: "Premium Audio System",
					categoryId,
					pricingType: "flat",
					price: 1500,
					exclusions: [optA.id],
				}),
				201,
				"Create Premium Audio option (excludes Standard)",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for exclusion test",
			);

			// Add A first
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: optA.id,
				}),
				201,
				"Add Standard Audio to quote",
			);

			// Act — try to add B which excludes A
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: optB.id,
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				400,
				"Reject adding option that excludes existing option",
			);
			expect(body.error).toBeDefined();
			const errorMessage = body.error.toLowerCase();
			expect(errorMessage).toMatch(/exclu|conflict|incompat/);
		});

		it("should allow adding an option when its excluded option is not on the quote", async () => {
			// Arrange
			const optA = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 0,
				}),
				201,
				"Create option A for exclusion-absent test",
			);

			const optB = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 1500,
					exclusions: [optA.id],
				}),
				201,
				"Create option B (excludes A)",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for exclusion-absent test",
			);

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
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: "Performance Exhaust",
					categoryId,
					pricingType: "flat",
					price: 1800,
					trimRestrictions: [sportTrimId, premiumTrimId],
				}),
				201,
				"Create trim-restricted option",
			);

			// Create a quote with the base (LS) trim
			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote with base trim",
			);

			// Act — try to add trim-restricted option to base trim quote
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			const body = await expectStatus<{ error: string }>(
				response,
				400,
				"Reject adding trim-restricted option to ineligible trim",
			);
			expect(body.error).toBeDefined();
			expect(body.error.toLowerCase()).toMatch(/trim|restrict|available/);
		});

		it("should allow adding a trim-restricted option when the quote trim is in the allowed list", async () => {
			// Arrange — create option restricted to Sport and Premier trims
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 1800,
					trimRestrictions: [sportTrimId, premiumTrimId],
				}),
				201,
				"Create trim-restricted option for allowed trim test",
			);

			// Create a quote with Sport trim
			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: sportTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote with Sport trim",
			);

			// Act
			const response = await addQuoteOption(baseUrl, quote.id, {
				optionId: opt.id,
			});

			// Assert
			expect(response.status).toBe(201);
		});

		it("should allow adding an option with no trim restrictions to any trim", async () => {
			// Arrange — create option with no trim restrictions
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 500,
				}),
				201,
				"Create unrestricted option",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for unrestricted option test",
			);

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
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 750,
				}),
				201,
				"Create option for removal test",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId: baseTrimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for removal test",
			);

			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt.id,
				}),
				201,
				"Add option to quote before removal",
			);

			// Act
			const response = await removeQuoteOption(baseUrl, quote.id, opt.id);

			// Assert
			const body = await expectStatus<{ options: string[] }>(
				response,
				200,
				"Remove option from draft quote",
			);
			expect(body.options).not.toContain(opt.id);
		});
	});
});
