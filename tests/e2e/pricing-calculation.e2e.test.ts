import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	addQuoteOption,
	calculateQuote,
	createOption,
	createOptionCategory,
	createQuote,
	createTrim,
	createVehicle,
	expectStatus,
	removeQuoteOption,
} from "./helpers/api-client.js";
import {
	type TestInfrastructure,
	setupTestInfrastructure,
	teardownTestInfrastructure,
} from "./helpers/containers.js";

const chance = new Chance();

describe("pricing calculation", () => {
	let infra: TestInfrastructure;
	let baseUrl: string;

	let vehicleId: string;
	let trimId: string;
	let categoryId: string;
	const BASE_MSRP = 30000;
	const DESTINATION_CHARGE = 1295;

	beforeAll(async () => {
		infra = await setupTestInfrastructure();
		baseUrl = infra.baseUrl;

		// Create vehicle + trim + category for all pricing tests
		const vehicle = await expectStatus<{ id: string }>(
			await createVehicle(baseUrl, {
				make: "TestMake",
				model: chance.word(),
				year: 2025,
				destinationCharge: DESTINATION_CHARGE,
			}),
			201,
			"Create vehicle for pricing tests",
		);
		vehicleId = vehicle.id;

		trimId = (
			await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicleId, {
					name: "LT",
					level: 2,
					msrp: BASE_MSRP,
				}),
				201,
				"Create LT trim for pricing tests",
			)
		).id;

		categoryId = (
			await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: "Technology",
				}),
				201,
				"Create Technology category for pricing tests",
			)
		).id;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	describe("base pricing with no options", () => {
		it("should calculate total as base MSRP plus destination charge when no options are selected", async () => {
			// Arrange
			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for base pricing test",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.quoteId).toBe(quote.id);
			expect(pricing.baseMsrp).toBe(BASE_MSRP);
			expect(pricing.optionsTotal).toBe(0);
			expect(pricing.packageDiscount).toBe(0);
			expect(pricing.destinationCharge).toBe(DESTINATION_CHARGE);
			expect(pricing.totalPrice).toBe(BASE_MSRP + DESTINATION_CHARGE);
		});
	});

	describe("flat option pricing", () => {
		it("should add flat option prices to the total", async () => {
			// Arrange
			const optionPrice1 = 450;
			const optionPrice2 = 1250;

			const opt1 = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: optionPrice1,
				}),
				201,
				"Create flat option 1",
			);

			const opt2 = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: optionPrice2,
				}),
				201,
				"Create flat option 2",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for flat option pricing test",
			);

			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt1.id,
				}),
				201,
				"Add flat option 1 to quote",
			);
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt2.id,
				}),
				201,
				"Add flat option 2 to quote",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.baseMsrp).toBe(BASE_MSRP);
			expect(pricing.optionsTotal).toBe(optionPrice1 + optionPrice2);
			expect(pricing.totalPrice).toBe(
				BASE_MSRP +
					optionPrice1 +
					optionPrice2 +
					DESTINATION_CHARGE,
			);
		});
	});

	describe("percentage option pricing", () => {
		it("should calculate percentage-based option price dynamically from base MSRP", async () => {
			// Arrange — 2% of base MSRP
			const percentageValue = 2.0;
			const expectedOptionPrice = BASE_MSRP * (percentageValue / 100);

			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "percentage",
					price: percentageValue,
				}),
				201,
				"Create percentage option",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for percentage pricing test",
			);

			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt.id,
				}),
				201,
				"Add percentage option to quote",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.optionsTotal).toBeCloseTo(
				expectedOptionPrice,
				2,
			);
			expect(pricing.totalPrice).toBeCloseTo(
				BASE_MSRP + expectedOptionPrice + DESTINATION_CHARGE,
				2,
			);
		});

		it("should combine flat and percentage options correctly", async () => {
			// Arrange
			const flatPrice = 800;
			const percentageValue = 3.0;
			const expectedPercentagePrice =
				BASE_MSRP * (percentageValue / 100);

			const flatOpt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: flatPrice,
				}),
				201,
				"Create flat option for mixed pricing test",
			);

			const pctOpt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "percentage",
					price: percentageValue,
				}),
				201,
				"Create percentage option for mixed pricing test",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for mixed pricing test",
			);

			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: flatOpt.id,
				}),
				201,
				"Add flat option to quote",
			);
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: pctOpt.id,
				}),
				201,
				"Add percentage option to quote",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.optionsTotal).toBeCloseTo(
				flatPrice + expectedPercentagePrice,
				2,
			);
		});
	});

	describe("package discount pricing", () => {
		it("should apply package discount when all options in a package are present", async () => {
			// Arrange — create two options in the same package with a discount
			const packageId = chance.guid();
			const packageName = "Technology Package";
			const packageDiscount = 500;

			const opt1 = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 1200,
					packageId,
					packageName,
					packageDiscount,
				}),
				201,
				"Create package option 1",
			);

			const opt2 = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 800,
					packageId,
					packageName,
					packageDiscount: 0,
				}),
				201,
				"Create package option 2",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for package discount test",
			);

			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt1.id,
				}),
				201,
				"Add package option 1 to quote",
			);
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt2.id,
				}),
				201,
				"Add package option 2 to quote",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.packageDiscount).toBe(packageDiscount);
			expect(pricing.totalPrice).toBe(
				BASE_MSRP +
					1200 +
					800 -
					packageDiscount +
					DESTINATION_CHARGE,
			);
		});

		it("should not apply package discount when only some options in the package are present", async () => {
			// Arrange — create two options in the same package, only add one
			const packageId = chance.guid();
			const packageName = "Safety Package";

			const opt1 = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 600,
					packageId,
					packageName,
					packageDiscount: 400,
				}),
				201,
				"Create package option 1 (partial package test)",
			);

			await expectStatus(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: 900,
					packageId,
					packageName,
					packageDiscount: 0,
				}),
				201,
				"Create package option 2 (not added to quote)",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for partial package test",
			);

			// Only add one of the two package options
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt1.id,
				}),
				201,
				"Add single package option to quote",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.packageDiscount).toBe(0);
			expect(pricing.totalPrice).toBe(
				BASE_MSRP + 600 + DESTINATION_CHARGE,
			);
		});
	});

	describe("destination charge", () => {
		it("should include destination charge as a separate line item in pricing, not as an option", async () => {
			// Arrange
			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for destination charge test",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.destinationCharge).toBe(DESTINATION_CHARGE);
			expect(pricing.optionsTotal).toBe(0);
			expect(pricing.totalPrice).toBe(BASE_MSRP + DESTINATION_CHARGE);
		});

		it("should use the destination charge configured for the specific vehicle model", async () => {
			// Arrange — create a different vehicle with a different destination charge
			const differentDestCharge = 1895;
			const vehicle = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, {
					make: "DiffMake",
					model: chance.word(),
					year: 2025,
					destinationCharge: differentDestCharge,
				}),
				201,
				"Create vehicle with different destination charge",
			);

			const trim = await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicle.id, {
					name: "Base",
					level: 1,
					msrp: 40000,
				}),
				201,
				"Create trim for different vehicle",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId: vehicle.id,
					trimId: trim.id,
					customerName: chance.name(),
				}),
				201,
				"Create quote for different destination charge test",
			);

			// Act
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.destinationCharge).toBe(differentDestCharge);
			expect(pricing.totalPrice).toBe(40000 + differentDestCharge);
		});
	});

	describe("recalculation after option changes", () => {
		it("should recalculate correctly after adding and removing options", async () => {
			// Arrange
			const optionPrice = 1500;
			const opt = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId,
					pricingType: "flat",
					price: optionPrice,
				}),
				201,
				"Create option for recalculation test",
			);

			const quote = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId,
					trimId,
					customerName: chance.name(),
				}),
				201,
				"Create quote for recalculation test",
			);

			// Add option and calculate
			await expectStatus(
				await addQuoteOption(baseUrl, quote.id, {
					optionId: opt.id,
				}),
				201,
				"Add option to quote for recalculation",
			);
			const pricingWithOption = await expectStatus<{
				optionsTotal: number;
			}>(
				await calculateQuote(baseUrl, quote.id),
				200,
				"Calculate quote with option",
			);
			expect(pricingWithOption.optionsTotal).toBe(optionPrice);

			// Remove option
			await expectStatus(
				await removeQuoteOption(baseUrl, quote.id, opt.id),
				200,
				"Remove option from quote",
			);

			// Act — recalculate
			const response = await calculateQuote(baseUrl, quote.id);

			// Assert
			expect(response.status).toBe(200);
			const pricing = await response.json();
			expect(pricing.optionsTotal).toBe(0);
			expect(pricing.totalPrice).toBe(BASE_MSRP + DESTINATION_CHARGE);
		});
	});
});
