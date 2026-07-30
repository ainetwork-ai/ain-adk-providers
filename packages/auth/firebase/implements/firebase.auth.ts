import { AuthModule } from "@ainetwork/adk/modules";
import type { AuthResponse } from "@ainetwork/adk/types/auth";
import type { Request, Response } from "express";
import { type App, cert, initializeApp } from "firebase-admin/app";
import { type DecodedIdToken, getAuth } from "firebase-admin/auth";

export interface FirebaseConfig {
	projectId: string;
	privateKey: string;
	clientEmail: string;
}

export class FirebaseAuth extends AuthModule {
	private readonly adminApp: App;

	constructor(config: FirebaseConfig) {
		super();
		this.adminApp = initializeApp({
			credential: cert({
				projectId: config.projectId,
				privateKey: config.privateKey.replace(/\\n/g, "\n"),
				clientEmail: config.clientEmail,
			}),
		});
	}

	public async authenticate(req: any, res: any): Promise<AuthResponse> {
		const token = this.extractBearerToken(req);
		if (!token) {
			return { isAuthenticated: false };
		}

		try {
			const decodedToken: DecodedIdToken = await getAuth(
				this.adminApp,
			).verifyIdToken(token);

			return {
				isAuthenticated: true,
				userId: decodedToken.uid,
				email: decodedToken.email,
			};
		} catch (error) {
			console.error("Firebase auth verification failed:", error);
			return { isAuthenticated: false };
		}
	}

	private extractBearerToken(req: Request): string | null {
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith("Bearer ")) {
			return null;
		}
		return authHeader.substring(7);
	}
}
