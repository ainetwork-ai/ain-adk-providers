import jwt from "jsonwebtoken";
import { NextAuth } from "../implements/next.auth";

const SECRET = "test-nextauth-secret";

function makeReq(authorization?: string) {
	return { headers: authorization ? { authorization } : {} } as never;
}

function signToken(
	payload: Record<string, unknown>,
	secret: string = SECRET,
): string {
	return jwt.sign(payload, secret, { algorithm: "HS256" });
}

describe("NextAuth", () => {
	let auth: NextAuth;

	beforeEach(() => {
		auth = new NextAuth({ nextAuthSecret: SECRET });
		jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("rejects a request with no Authorization header", async () => {
		const result = await auth.authenticate(makeReq() as never, {} as never);
		expect(result).toEqual({ isAuthenticated: false });
	});

	it("rejects a non-Bearer Authorization scheme", async () => {
		const token = signToken({ sub: "user-1" });
		const result = await auth.authenticate(
			makeReq(`Basic ${token}`) as never,
			{} as never,
		);
		expect(result).toEqual({ isAuthenticated: false });
	});

	it("rejects an expired token", async () => {
		const now = Math.floor(Date.now() / 1000);
		const token = signToken({
			sub: "user-1",
			iat: now - 7200,
			exp: now - 3600,
		});
		const result = await auth.authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(false);
	});

	it("rejects a token signed with the wrong secret", async () => {
		const token = signToken({ sub: "user-1" }, "some-other-secret");
		const result = await auth.authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(false);
	});

	it("accepts a valid token and returns userId and email", async () => {
		const token = signToken({ sub: "user-1", email: "User.One@Example.com" });
		const result = await auth.authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(true);
		expect(result.userId).toBe("user-1");
		// no case normalization by design
		expect(result.email).toBe("User.One@Example.com");
	});

	it("accepts a valid token without email and leaves email undefined", async () => {
		const token = signToken({ sub: "user-2" });
		const result = await auth.authenticate(
			makeReq(`Bearer ${token}`) as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(true);
		expect(result.userId).toBe("user-2");
		expect(result.email).toBeUndefined();
	});
});
