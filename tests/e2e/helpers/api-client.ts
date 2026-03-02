const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(
	baseUrl: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> {
	const options: RequestInit = { method, headers: JSON_HEADERS };
	if (body !== undefined) {
		options.body = JSON.stringify(body);
	}
	return fetch(`${baseUrl}${path}`, options);
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export function createVehicle(
	baseUrl: string,
	payload: {
		make: string;
		model: string;
		year: number;
		destinationCharge: number;
	},
): Promise<Response> {
	return request(baseUrl, "POST", "/vehicles", payload);
}

export function listVehicles(baseUrl: string): Promise<Response> {
	return request(baseUrl, "GET", "/vehicles");
}

export function getVehicle(baseUrl: string, id: string): Promise<Response> {
	return request(baseUrl, "GET", `/vehicles/${id}`);
}

// ── Trims ────────────────────────────────────────────────────────────────────

export function createTrim(
	baseUrl: string,
	vehicleId: string,
	payload: { name: string; level: number; msrp: number },
): Promise<Response> {
	return request(
		baseUrl,
		"POST",
		`/vehicles/${vehicleId}/trims`,
		payload,
	);
}

export function listTrims(
	baseUrl: string,
	vehicleId: string,
): Promise<Response> {
	return request(baseUrl, "GET", `/vehicles/${vehicleId}/trims`);
}

// ── Option Categories ────────────────────────────────────────────────────────

export function createOptionCategory(
	baseUrl: string,
	payload: { name: string },
): Promise<Response> {
	return request(baseUrl, "POST", "/option-categories", payload);
}

export function listOptionCategories(baseUrl: string): Promise<Response> {
	return request(baseUrl, "GET", "/option-categories");
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface CreateOptionPayload {
	name: string;
	categoryId: string;
	pricingType: "flat" | "percentage";
	price: number;
	description?: string;
	dependencies?: string[];
	exclusions?: string[];
	trimRestrictions?: string[];
	packageId?: string | null;
	packageName?: string | null;
	packageDiscount?: number | null;
}

export function createOption(
	baseUrl: string,
	payload: CreateOptionPayload,
): Promise<Response> {
	return request(baseUrl, "POST", "/options", payload);
}

export function listOptions(baseUrl: string): Promise<Response> {
	return request(baseUrl, "GET", "/options");
}

export function getOption(baseUrl: string, id: string): Promise<Response> {
	return request(baseUrl, "GET", `/options/${id}`);
}

// ── Quotes ───────────────────────────────────────────────────────────────────

export function createQuote(
	baseUrl: string,
	payload: {
		vehicleId: string;
		trimId: string;
		customerName: string;
		expiresIn?: number;
	},
): Promise<Response> {
	return request(baseUrl, "POST", "/quotes", payload);
}

export function listQuotes(baseUrl: string): Promise<Response> {
	return request(baseUrl, "GET", "/quotes");
}

export function getQuote(baseUrl: string, id: string): Promise<Response> {
	return request(baseUrl, "GET", `/quotes/${id}`);
}

export function addQuoteOption(
	baseUrl: string,
	quoteId: string,
	payload: { optionId: string },
): Promise<Response> {
	return request(baseUrl, "POST", `/quotes/${quoteId}/options`, payload);
}

export function removeQuoteOption(
	baseUrl: string,
	quoteId: string,
	optionId: string,
): Promise<Response> {
	return request(
		baseUrl,
		"DELETE",
		`/quotes/${quoteId}/options/${optionId}`,
	);
}

export function calculateQuote(
	baseUrl: string,
	quoteId: string,
): Promise<Response> {
	return request(baseUrl, "POST", `/quotes/${quoteId}/calculate`);
}

export function transitionQuote(
	baseUrl: string,
	quoteId: string,
	payload: { status: string },
): Promise<Response> {
	return request(
		baseUrl,
		"POST",
		`/quotes/${quoteId}/transition`,
		payload,
	);
}
