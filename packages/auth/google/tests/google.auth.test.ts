import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { GoogleAuth } from "../implements/google.auth";

jest.mock("jwks-rsa", () =>
	jest.fn(() => ({
		getSigningKey: (
			_kid: string | null | undefined,
			cb: (err: Error | null, key?: unknown) => void,
		) => {
			cb(null, { getPublicKey: () => getTestKeys().publicKey });
		},
	})),
);

let cachedKeys: { publicKey: string; privateKey: string } | undefined;
function getTestKeys(): { publicKey: string; privateKey: string } {
	if (!cachedKeys) {
		const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		cachedKeys = { publicKey, privateKey };
	}
	return cachedKeys;
}

const CLIENT_ID = "1234567890-abcdef.apps.googleusercontent.com";

function makeReq(authorization?: string) {
	return { headers: authorization ? { authorization } : {} } as never;
}

function signIdToken(overrides: Record<string, unknown> = {}): string {
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		aud: CLIENT_ID,
		iss: "https://accounts.google.com",
		iat: now,
		exp: now + 3600,
		sub: "google-user-1",
		email: "user@gmail.com",
		email_verified: true,
		...overrides,
	};
	return jwt.sign(payload, getTestKeys().privateKey, {
		algorithm: "RS256",
		keyid: "test-kid",
	});
}

describe("GoogleAuth", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		global.fetch = originalFetch;
	});

	function makeAuth(
		config: Partial<ConstructorParameters<typeof GoogleAuth>[0]> = {},
	) {
		return new GoogleAuth({ clientId: CLIENT_ID, ...config });
	}

	it("configures the JWKS client with an explicit timeout", () => {
		(jwksClient as unknown as jest.Mock).mockClear();
		makeAuth();
		const options = (jwksClient as unknown as jest.Mock).mock.calls[0][0];
		expect(options.timeout).toBe(10_000);
	});

	it("rejects a request with no Authorization header", async () => {
		const result = await makeAuth().authenticate(
			makeReq() as never,
			{} as never,
		);
		expect(result).toEqual({ isAuthenticated: false });
	});

	it("rejects a non-Bearer Authorization scheme", async () => {
		const result = await makeAuth().authenticate(
			makeReq(`Basic ${signIdToken()}`) as never,
			{} as never,
		);
		expect(result).toEqual({ isAuthenticated: false });
	});

	describe("ID token (JWT) verification", () => {
		it("rejects an expired token", async () => {
			const now = Math.floor(Date.now() / 1000);
			const token = signIdToken({ iat: now - 7200, exp: now - 3600 });
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${token}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(false);
		});

		it("rejects a token with the wrong audience", async () => {
			const token = signIdToken({
				aud: "other-client.apps.googleusercontent.com",
			});
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${token}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(false);
		});

		it("rejects a token from an unexpected issuer", async () => {
			const token = signIdToken({ iss: "https://evil.example.com" });
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${token}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(false);
		});

		it("accepts a valid token and returns userId and verified email", async () => {
			const token = signIdToken();
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${token}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(true);
			expect(result.userId).toBe("google-user-1");
			expect(result.email).toBe("user@gmail.com");
		});

		it("omits the email when email_verified is false", async () => {
			const token = signIdToken({ email_verified: false });
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${token}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(true);
			expect(result.userId).toBe("google-user-1");
			expect(result.email).toBeUndefined();
		});
	});

	describe("access token (tokeninfo) verification", () => {
		const ACCESS_TOKEN = "ya29.test-access-token";

		function mockTokenInfo(body: Record<string, unknown>) {
			const fetchMock = jest.fn(() =>
				Promise.resolve({ json: () => Promise.resolve(body) } as Response),
			);
			global.fetch = fetchMock as unknown as typeof fetch;
			return fetchMock;
		}

		it("accepts a valid access token, passes an abort signal, and returns the verified email", async () => {
			const fetchMock = mockTokenInfo({
				aud: CLIENT_ID,
				azp: CLIENT_ID,
				sub: "google-user-2",
				scope: "openid email",
				exp: "9999999999",
				expires_in: "3600",
				email: "user2@gmail.com",
				email_verified: "true",
			});

			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${ACCESS_TOKEN}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(true);
			expect(result.userId).toBe("google-user-2");
			expect(result.email).toBe("user2@gmail.com");

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("https://oauth2.googleapis.com/tokeninfo"),
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);
		});

		it('omits the email when tokeninfo email_verified is not "true"', async () => {
			mockTokenInfo({
				aud: CLIENT_ID,
				sub: "google-user-2",
				exp: "9999999999",
				email: "user2@gmail.com",
				email_verified: "false",
			});
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${ACCESS_TOKEN}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(true);
			expect(result.email).toBeUndefined();
		});

		it("rejects an access token issued for a different client", async () => {
			mockTokenInfo({
				aud: "other-client",
				azp: "other-client",
				sub: "google-user-2",
				exp: "9999999999",
			});
			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${ACCESS_TOKEN}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(false);
		});

		it("treats a tokeninfo timeout as a normal auth failure", async () => {
			const timeoutError = new Error(
				"The operation was aborted due to timeout",
			);
			timeoutError.name = "TimeoutError";
			global.fetch = jest.fn(() =>
				Promise.reject(timeoutError),
			) as unknown as typeof fetch;

			const result = await makeAuth().authenticate(
				makeReq(`Bearer ${ACCESS_TOKEN}`) as never,
				{} as never,
			);
			expect(result).toEqual({ isAuthenticated: false });
			expect(console.error).toHaveBeenCalled();
		});
	});

	describe("NextAuth token verification", () => {
		it("verifies HS256 NextAuth tokens and returns userId and email", async () => {
			const secret = "next-secret";
			const token = jwt.sign(
				{ sub: "next-user", email: "Next.User@gmail.com" },
				secret,
				{ algorithm: "HS256" },
			);
			const auth = makeAuth({ nextAuthSecret: secret });
			const result = await auth.authenticate(
				makeReq(`Bearer ${token}`) as never,
				{} as never,
			);
			expect(result.isAuthenticated).toBe(true);
			expect(result.userId).toBe("next-user");
			// no case normalization by design
			expect(result.email).toBe("Next.User@gmail.com");
		});
	});
});
