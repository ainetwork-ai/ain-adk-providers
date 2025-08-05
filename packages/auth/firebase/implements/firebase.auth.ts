import { BaseAuth } from "@ainetwork/adk/modules";
import { AuthResponse } from "@ainetwork/adk/types/auth";
import type { Request, Response } from "express";
import { initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

export interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

export class FirebaseAuth extends BaseAuth {
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

  public async authenticate(req: Request, res: Response): Promise<AuthResponse> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return { isAuthenticated: false };
    }

    try {
      const decodedToken: DecodedIdToken = await getAuth(this.adminApp).verifyIdToken(token);

      return {
        isAuthenticated: true,
        userId: decodedToken.uid,
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
