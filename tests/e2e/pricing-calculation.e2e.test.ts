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
		const vehicleRes = await createVehicle(baseUrl, {
			make: "TestMake",
			model: chance.word(),
			year: 2025,
			destinationCharge: DESTINATION_CHARGE,
		});
		const vehicle = await vehicleRes.json();
		vehicleId = vehicle.id;

		const trimRes = await createTrim(baseUrl, vehicleId, {
			name: "LT",
			level: 2,
			msrp: BASE_MSRP,
		});
		trimId = (await trimRes.json()).id;

		const catRes = await createOptionCategory(baseUrl, {
			name: "Technology",
		});
		categoryId = (await catRes.json()).id;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	describe("base pricing with no options", () => {
		it("should calculate total as base MSRP plus destination charge when no options are selected", async () => {
			// Arrange
			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

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

			const opt1Res = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: optionPrice1,
			});
			const opt1 = await opt1Res.json();

			const opt2Res = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: optionPrice2,
			});
			const opt2 = await opt2Res.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			await addQuoteOption(baseUrl, quote.id, { optionId: opt1.id });
			await addQuoteOption(baseUrl, quote.id, { optionId: opt2.id });

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

			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "percentage",
				price: percentageValue,
			});
			const opt = await optRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			await addQuoteOption(baseUrl, quote.id, { optionId: opt.id });

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

			const flatOptRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: flatPrice,
			});
			const flatOpt = await flatOptRes.json();

			const pctOptRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "percentage",
				price: percentageValue,
			});
			const pctOpt = await pctOptRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			await addQuoteOption(baseUrl, quote.id, { optionId: flatOpt.id });
			await addQuoteOption(baseUrl, quote.id, { optionId: pctOpt.id });

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

			const opt1Res = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 1200,
				packageId,
				packageName,
				packageDiscount,
			});
			const opt1 = await opt1Res.json();

			const opt2Res = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 800,
				packageId,
				packageName,
				packageDiscount: 0,
			});
			const opt2 = await opt2Res.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			await addQuoteOption(baseUrl, quote.id, { optionId: opt1.id });
			await addQuoteOption(baseUrl, quote.id, { optionId: opt2.id });

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

			const opt1Res = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 600,
				packageId,
				packageName,
				packageDiscount: 400,
			});
			const opt1 = await opt1Res.json();

			await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: 900,
				packageId,
				packageName,
				packageDiscount: 0,
			});

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Only add one of the two package options
			await addQuoteOption(baseUrl, quote.id, { optionId: opt1.id });

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
			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

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
			const vehicleRes = await createVehicle(baseUrl, {
				make: "DiffMake",
				model: chance.word(),
				year: 2025,
				destinationCharge: differentDestCharge,
			});
			const vehicle = await vehicleRes.json();

			const trimRes = await createTrim(baseUrl, vehicle.id, {
				name: "Base",
				level: 1,
				msrp: 40000,
			});
			const trim = await trimRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId: vehicle.id,
				trimId: trim.id,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

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
			const optRes = await createOption(baseUrl, {
				name: chance.word(),
				categoryId,
				pricingType: "flat",
				price: optionPrice,
			});
			const opt = await optRes.json();

			const quoteRes = await createQuote(baseUrl, {
				vehicleId,
				trimId,
				customerName: chance.name(),
			});
			const quote = await quoteRes.json();

			// Add option and calculate
			await addQuoteOption(baseUrl, quote.id, { optionId: opt.id });
			const calcWithOption = await calculateQuote(baseUrl, quote.id);
			const pricingWithOption = await calcWithOption.json();
			expect(pricingWithOption.optionsTotal).toBe(optionPrice);

			// Remove option
			await removeQuoteOption(baseUrl, quote.id, opt.id);

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
