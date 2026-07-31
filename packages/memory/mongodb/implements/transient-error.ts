/**
 * Classifies whether a MongoDB error is genuinely transient and therefore
 * safe to retry. Retrying arbitrary MongoServerErrors (duplicate key,
 * validation, auth, ...) re-runs non-idempotent writes and masks real
 * errors, so only network failures and errors the server explicitly labels
 * as retryable qualify.
 */
export function isTransientMongoError(error: unknown): boolean {
	if (error === null || typeof error !== "object") return false;

	const err = error as {
		name?: string;
		hasErrorLabel?: (label: string) => boolean;
	};

	// Driver network failures (MongoNetworkTimeoutError extends MongoNetworkError).
	if (
		err.name === "MongoNetworkError" ||
		err.name === "MongoNetworkTimeoutError"
	) {
		return true;
	}

	// Errors the server explicitly labels as retryable.
	if (typeof err.hasErrorLabel === "function") {
		if (
			err.hasErrorLabel("RetryableWriteError") ||
			err.hasErrorLabel("TransientTransactionError")
		) {
			return true;
		}
	}

	return false;
}
