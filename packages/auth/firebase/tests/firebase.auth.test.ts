import { FirebaseAuth } from "../implements/firebase.auth";

const mockVerifyIdToken = jest.fn();

jest.mock("firebase-admin/app", () => ({
	initializeApp: jest.fn(() => ({ name: "test-app" })),
	cert: jest.fn((serviceAccount: unknown) => serviceAccount),
}));

jest.mock("firebase-admin/auth", () => ({
	getAuth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

function makeReq(authorization?: string) {
	return { headers: authorization ? { authorization } : {} } as never;
}

describe("FirebaseAuth", () => {
	let auth: FirebaseAuth;

	beforeEach(() => {
		mockVerifyIdToken.mockReset();
		jest.spyOn(console, "error").mockImplementation(() => {});
		auth = new FirebaseAuth({
			projectId: "test-project",
			privateKey:
				"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
			clientEmail: "svc@test-project.iam.gserviceaccount.com",
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("rejects a request with no Authorization header", async () => {
		const result = await auth.authenticate(makeReq() as never, {} as never);
		expect(result).toEqual({ isAuthenticated: false });
		expect(mockVerifyIdToken).not.toHaveBeenCalled();
	});

	it("rejects a non-Bearer Authorization scheme", async () => {
		const result = await auth.authenticate(
			makeReq("Basic abc123") as never,
			{} as never,
		);
		expect(result).toEqual({ isAuthenticated: false });
		expect(mockVerifyIdToken).not.toHaveBeenCalled();
	});

	it("rejects when verifyIdToken throws (e.g. expired token)", async () => {
		mockVerifyIdToken.mockRejectedValue(new Error("auth/id-token-expired"));
		const result = await auth.authenticate(
			makeReq("Bearer expired-token") as never,
			{} as never,
		);
		expect(result).toEqual({ isAuthenticated: false });
	});

	it("accepts a valid token and returns userId and email", async () => {
		mockVerifyIdToken.mockResolvedValue({
			uid: "firebase-uid-1",
			email: "Fire.User@example.com",
		});
		const result = await auth.authenticate(
			makeReq("Bearer valid-token") as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(true);
		expect(result.userId).toBe("firebase-uid-1");
		// no case normalization by design
		expect(result.email).toBe("Fire.User@example.com");
		expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-token");
	});

	it("accepts a valid token without email and leaves email undefined", async () => {
		mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-2" });
		const result = await auth.authenticate(
			makeReq("Bearer valid-token") as never,
			{} as never,
		);
		expect(result.isAuthenticated).toBe(true);
		expect(result.userId).toBe("firebase-uid-2");
		expect(result.email).toBeUndefined();
	});
});
