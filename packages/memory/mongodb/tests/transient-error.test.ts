import { isTransientMongoError } from "../implements/transient-error";

const namedError = (name: string, message = "boom"): Error => {
	const err = new Error(message);
	err.name = name;
	return err;
};

describe("isTransientMongoError", () => {
	it("classifies MongoNetworkError as transient", () => {
		expect(isTransientMongoError(namedError("MongoNetworkError"))).toBe(true);
	});

	it("classifies MongoNetworkTimeoutError as transient", () => {
		expect(isTransientMongoError(namedError("MongoNetworkTimeoutError"))).toBe(
			true,
		);
	});

	it("classifies errors labeled RetryableWriteError as transient", () => {
		const err = namedError("MongoServerError") as Error & {
			hasErrorLabel: (label: string) => boolean;
		};
		err.hasErrorLabel = (label: string) => label === "RetryableWriteError";
		expect(isTransientMongoError(err)).toBe(true);
	});

	it("classifies errors labeled TransientTransactionError as transient", () => {
		const err = namedError("MongoServerError") as Error & {
			hasErrorLabel: (label: string) => boolean;
		};
		err.hasErrorLabel = (label: string) =>
			label === "TransientTransactionError";
		expect(isTransientMongoError(err)).toBe(true);
	});

	it("does NOT classify a generic MongoServerError as transient", () => {
		const err = namedError("MongoServerError") as Error & {
			hasErrorLabel: (label: string) => boolean;
		};
		err.hasErrorLabel = () => false;
		expect(isTransientMongoError(err)).toBe(false);
	});

	it("does NOT classify duplicate-key errors as transient", () => {
		const err = namedError(
			"MongoServerError",
			"E11000 duplicate key error collection",
		) as Error & { code: number };
		err.code = 11000;
		expect(isTransientMongoError(err)).toBe(false);
	});

	it("does NOT classify auth failures as transient", () => {
		const err = namedError(
			"MongoServerError",
			"Authentication failed",
		) as Error & { code: number; codeName: string };
		err.code = 18;
		err.codeName = "AuthenticationFailed";
		expect(isTransientMongoError(err)).toBe(false);
	});

	it("does NOT sniff messages: plain errors mentioning connection are not transient", () => {
		expect(
			isTransientMongoError(new Error("connection was disconnected")),
		).toBe(false);
	});

	it("does NOT classify validation errors as transient", () => {
		expect(isTransientMongoError(namedError("ValidationError"))).toBe(false);
	});

	it("handles non-object inputs", () => {
		expect(isTransientMongoError(undefined)).toBe(false);
		expect(isTransientMongoError(null)).toBe(false);
		expect(isTransientMongoError("connection lost")).toBe(false);
	});
});
