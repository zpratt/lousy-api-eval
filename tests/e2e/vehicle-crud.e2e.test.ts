import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createOption,
	createOptionCategory,
	createQuote,
	createTrim,
	createVehicle,
	expectStatus,
	getOption,
	getQuote,
	getVehicle,
	listOptionCategories,
	listOptions,
	listQuotes,
	listTrims,
	listVehicles,
} from "./helpers/api-client.js";
import {
	type TestInfrastructure,
	setupTestInfrastructure,
	teardownTestInfrastructure,
} from "./helpers/containers.js";

const chance = new Chance();

describe("vehicle and option CRUD", () => {
	let infra: TestInfrastructure;
	let baseUrl: string;

	beforeAll(async () => {
		infra = await setupTestInfrastructure();
		baseUrl = infra.baseUrl;
	});

	afterAll(async () => {
		await teardownTestInfrastructure(infra);
	});

	describe("vehicles", () => {
		it("should create a vehicle and return it with an id", async () => {
			// Arrange
			const payload = {
				make: chance.word(),
				model: chance.word(),
				year: 2025,
				destinationCharge: 1295,
			};

			// Act
			const response = await createVehicle(baseUrl, payload);

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.id).toBeDefined();
			expect(body.make).toBe(payload.make);
			expect(body.model).toBe(payload.model);
			expect(body.year).toBe(payload.year);
			expect(body.destinationCharge).toBe(payload.destinationCharge);
		});

		it("should list all created vehicles", async () => {
			// Arrange
			const payload = {
				make: chance.word(),
				model: chance.word(),
				year: 2025,
				destinationCharge: 995,
			};
			const created = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, payload),
				201,
				"Create vehicle for listing test",
			);

			// Act
			const response = await listVehicles(baseUrl);

			// Assert
			expect(response.status).toBe(200);
			const vehicles = await response.json();
			expect(Array.isArray(vehicles)).toBe(true);
			const found = vehicles.find(
				(v: { id: string }) => v.id === created.id,
			);
			expect(found).toBeDefined();
			expect(found.make).toBe(payload.make);
		});

		it("should get a vehicle by id", async () => {
			// Arrange
			const payload = {
				make: chance.word(),
				model: chance.word(),
				year: 2025,
				destinationCharge: 1495,
			};
			const created = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, payload),
				201,
				"Create vehicle for get-by-id test",
			);

			// Act
			const response = await getVehicle(baseUrl, created.id);

			// Assert
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.id).toBe(created.id);
			expect(body.make).toBe(payload.make);
			expect(body.destinationCharge).toBe(payload.destinationCharge);
		});

		it("should return 404 for a non-existent vehicle", async () => {
			// Arrange
			const fakeId = chance.guid();

			// Act
			const response = await getVehicle(baseUrl, fakeId);

			// Assert
			expect(response.status).toBe(404);
		});
	});

	describe("trims", () => {
		it("should create trim levels for a vehicle", async () => {
			// Arrange
			const vehicle = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, {
					make: chance.word(),
					model: chance.word(),
					year: 2025,
					destinationCharge: 1295,
				}),
				201,
				"Create vehicle for trim creation test",
			);

			const trimPayload = { name: "LT", level: 2, msrp: 28500 };

			// Act
			const response = await createTrim(
				baseUrl,
				vehicle.id,
				trimPayload,
			);

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.id).toBeDefined();
			expect(body.vehicleId).toBe(vehicle.id);
			expect(body.name).toBe(trimPayload.name);
			expect(body.level).toBe(trimPayload.level);
			expect(body.msrp).toBe(trimPayload.msrp);
		});

		it("should list trims for a vehicle", async () => {
			// Arrange
			const vehicle = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, {
					make: chance.word(),
					model: chance.word(),
					year: 2025,
					destinationCharge: 1295,
				}),
				201,
				"Create vehicle for trim listing test",
			);
			await expectStatus(
				await createTrim(baseUrl, vehicle.id, {
					name: "LS",
					level: 1,
					msrp: 25000,
				}),
				201,
				"Create LS trim",
			);
			await expectStatus(
				await createTrim(baseUrl, vehicle.id, {
					name: "LT",
					level: 2,
					msrp: 28500,
				}),
				201,
				"Create LT trim",
			);

			// Act
			const response = await listTrims(baseUrl, vehicle.id);

			// Assert
			expect(response.status).toBe(200);
			const trims = await response.json();
			expect(Array.isArray(trims)).toBe(true);
			expect(trims.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("option categories", () => {
		it("should create an option category", async () => {
			// Arrange
			const categoryName = chance.word();

			// Act
			const response = await createOptionCategory(baseUrl, {
				name: categoryName,
			});

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.id).toBeDefined();
			expect(body.name).toBe(categoryName);
		});

		it("should list option categories", async () => {
			// Arrange
			const categoryName = chance.word();
			await expectStatus(
				await createOptionCategory(baseUrl, { name: categoryName }),
				201,
				"Create option category for listing test",
			);

			// Act
			const response = await listOptionCategories(baseUrl);

			// Assert
			expect(response.status).toBe(200);
			const categories = await response.json();
			expect(Array.isArray(categories)).toBe(true);
			expect(categories.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("options", () => {
		it("should create a flat-priced option", async () => {
			// Arrange
			const category = await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: chance.word(),
				}),
				201,
				"Create category for flat option test",
			);
			const optionPayload = {
				name: "Heated Seats",
				categoryId: category.id,
				pricingType: "flat" as const,
				price: 450,
			};

			// Act
			const response = await createOption(baseUrl, optionPayload);

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.id).toBeDefined();
			expect(body.name).toBe(optionPayload.name);
			expect(body.categoryId).toBe(category.id);
			expect(body.pricingType).toBe("flat");
			expect(body.price).toBe(450);
		});

		it("should create a percentage-priced option", async () => {
			// Arrange
			const category = await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: chance.word(),
				}),
				201,
				"Create category for percentage option test",
			);

			// Act
			const response = await createOption(baseUrl, {
				name: "Extended Warranty",
				categoryId: category.id,
				pricingType: "percentage",
				price: 2.0,
			});

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.pricingType).toBe("percentage");
			expect(body.price).toBe(2.0);
		});

		it("should list all options", async () => {
			// Arrange
			const category = await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: chance.word(),
				}),
				201,
				"Create category for option listing test",
			);
			await expectStatus(
				await createOption(baseUrl, {
					name: chance.word(),
					categoryId: category.id,
					pricingType: "flat",
					price: 300,
				}),
				201,
				"Create option for listing test",
			);

			// Act
			const response = await listOptions(baseUrl);

			// Assert
			expect(response.status).toBe(200);
			const options = await response.json();
			expect(Array.isArray(options)).toBe(true);
			expect(options.length).toBeGreaterThanOrEqual(1);
		});

		it("should get an option by id", async () => {
			// Arrange
			const category = await expectStatus<{ id: string }>(
				await createOptionCategory(baseUrl, {
					name: chance.word(),
				}),
				201,
				"Create category for get-option test",
			);
			const created = await expectStatus<{ id: string }>(
				await createOption(baseUrl, {
					name: "Sunroof",
					categoryId: category.id,
					pricingType: "flat",
					price: 1200,
				}),
				201,
				"Create option for get-by-id test",
			);

			// Act
			const response = await getOption(baseUrl, created.id);

			// Assert
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.id).toBe(created.id);
			expect(body.name).toBe("Sunroof");
		});
	});

	describe("quotes", () => {
		it("should create a quote in draft status", async () => {
			// Arrange
			const vehicle = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, {
					make: chance.word(),
					model: chance.word(),
					year: 2025,
					destinationCharge: 1295,
				}),
				201,
				"Create vehicle for quote test",
			);
			const trim = await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicle.id, {
					name: "LT",
					level: 2,
					msrp: 28500,
				}),
				201,
				"Create trim for quote test",
			);

			const customerName = chance.name();

			// Act
			const response = await createQuote(baseUrl, {
				vehicleId: vehicle.id,
				trimId: trim.id,
				customerName,
			});

			// Assert
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.id).toBeDefined();
			expect(body.vehicleId).toBe(vehicle.id);
			expect(body.trimId).toBe(trim.id);
			expect(body.customerName).toBe(customerName);
			expect(body.status).toBe("draft");
			expect(body.options).toEqual([]);
			expect(body.appliedIncentives).toEqual([]);
		});

		it("should list quotes", async () => {
			// Act
			const response = await listQuotes(baseUrl);

			// Assert
			expect(response.status).toBe(200);
			const quotes = await response.json();
			expect(Array.isArray(quotes)).toBe(true);
		});

		it("should get a quote by id", async () => {
			// Arrange
			const vehicle = await expectStatus<{ id: string }>(
				await createVehicle(baseUrl, {
					make: chance.word(),
					model: chance.word(),
					year: 2025,
					destinationCharge: 1295,
				}),
				201,
				"Create vehicle for get-quote test",
			);
			const trim = await expectStatus<{ id: string }>(
				await createTrim(baseUrl, vehicle.id, {
					name: "LS",
					level: 1,
					msrp: 25000,
				}),
				201,
				"Create trim for get-quote test",
			);
			const created = await expectStatus<{ id: string }>(
				await createQuote(baseUrl, {
					vehicleId: vehicle.id,
					trimId: trim.id,
					customerName: chance.name(),
				}),
				201,
				"Create quote for get-by-id test",
			);

			// Act
			const response = await getQuote(baseUrl, created.id);

			// Assert
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.id).toBe(created.id);
			expect(body.status).toBe("draft");
		});

		it("should return 404 for a non-existent quote", async () => {
			// Arrange
			const fakeId = chance.guid();

			// Act
			const response = await getQuote(baseUrl, fakeId);

			// Assert
			expect(response.status).toBe(404);
		});
	});
});
