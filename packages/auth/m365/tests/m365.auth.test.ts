import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { M365Auth } from "../implements/m365.auth";

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

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const V2_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

function makeReq(authorization?: string) {
	return { headers: authorization ? { authorization } : {} } as never;
}

function signAzureToken(overrides: Record<string, unknown> = {}): string {
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		aud: CLIENT_ID,
		iss: V2_ISSUER,
		iat: now,
		nbf: now,
		exp: now + 3600,
		oid: "oid-user-1",
		sub: "sub-user-1",
		tid: TENANT_ID,
		preferred_username: "user@contoso.com",
		...overrides,
	};
	return jwt.sign(payload, getTestKeys().privateKey, {
		algorithm: "RS256",
		keyid: "test-kid",
	});
}

describe("M365Auth", () => {
	beforeEach(() => {
		jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	function makeAuth(
		config: Partial<ConstructorParameters<typeof M365Auth>[0]> = {},
	) {
		return new M365Auth({
			clientId: CLIENT_ID,
			tenantId: TENANT_ID,
			...config,
		});
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
			makeReq(`Basic ${signAzureToken()}`) as never,
			{} as never,
		);
		expect(result).toEqual({ isAuthenticated: false });
	});

	it("rejects an expired token", async () => {
		const now = Math.floor(Date.now() / 1000);
		const token = signAzureToken({
			iat: now - 7200,
			nbf: now - 7200,
			exp: now - 3600,
		});
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(false);
	});

	it("rejects a token from an unexpected issuer", async () => {
		const token = signAzureToken({ iss: "https://evil.example.com/v2.0" });
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(false);
	});

	it("REGRESSION: rejects a token for another audience even when appid matches clientId", async () => {
		const token = signAzureToken({ aud: "other-api", appid: CLIENT_ID });
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(false);
	});

	it("rejects a token for another audience even when azp matches clientId", async () => {
		const token = signAzureToken({ aud: "other-api", azp: CLIENT_ID });
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(false);
	});

	it("accepts a valid token with aud === clientId and returns userId and email", async () => {
		const token = signAzureToken();
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(true);
		expect(result.userId).toBe("oid-user-1");
		expect(result.email).toBe("user@contoso.com");
	});

	it("accepts a valid token with aud === api://clientId", async () => {
		const token = signAzureToken({ aud: `api://${CLIENT_ID}` });
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(true);
		expect(result.userId).toBe("oid-user-1");
	});

	it("accepts audiences from an explicit acceptedAudiences config", async () => {
		const auth = makeAuth({ acceptedAudiences: ["custom-audience"] });
		const accepted = await auth.authenticate(
			makeReq(`Bearer ${signAzureToken({ aud: "custom-audience" })}`) as never,
			{} as never,
		);
		expect(accepted.isAuthenticated).toBe(true);

		const rejected = await auth.authenticate(
			makeReq(`Bearer ${signAzureToken({ aud: "other-api" })}`) as never,
			{} as never,
		);
		expect(rejected.isAuthenticated).toBe(false);
	});

	it("prefers userPrincipalName over preferred_username for email", async () => {
		const token = signAzureToken({
			userPrincipalName: "upn@contoso.com",
			preferred_username: "pref@contoso.com",
		});
		const result = await makeAuth().authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.email).toBe("upn@contoso.com");
	});

	it("verifies NextAuth HS256 tokens first when nextAuthSecret is configured", async () => {
		const secret = "next-secret";
		const token = jwt.sign(
			{ sub: "next-user", email: "next@contoso.com" },
			secret,
			{ algorithm: "HS256" },
		);
		const auth = makeAuth({ nextAuthSecret: secret });
		const result = await auth.authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result).toEqual({
			isAuthenticated: true,
			userId: "next-user",
			email: "next@contoso.com",
		});
	});
});
