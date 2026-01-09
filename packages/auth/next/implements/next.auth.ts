import { BaseAuth } from "@ainetwork/adk/modules";
import { AuthResponse } from "@ainetwork/adk/types/auth";
import type { Request } from "express";
import jwt from "jsonwebtoken";

export interface NextAuthConfig {
  nextAuthSecret: string;
}

interface NextAuthJWTPayload {
  name?: string;
  email?: string;
  picture?: string;
  sub: string;
  iat: number;
  exp: number;
  jti?: string;
}

export class NextAuth extends BaseAuth {
  constructor(private readonly config: NextAuthConfig) {
    super();
  }

  private verifyNextAuthToken(token: string): Promise<NextAuthJWTPayload> {
    return new Promise((resolve, reject) => {
      if (!this.config.nextAuthSecret) {
        reject(new Error("NextAuth secret is required for NextAuth token verification"));
        return;
      }

      jwt.verify(
        token,
        this.config.nextAuthSecret,
        {
          algorithms: ["HS256"],
        },
        (err, decoded) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(decoded as NextAuthJWTPayload);
        }
      );
    });
  }

  public async authenticate(req: any, res: any): Promise<AuthResponse> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return { isAuthenticated: false };
    }

    try {
      const payload = await this.verifyNextAuthToken(token);
      if (payload.sub) {
        return {
          isAuthenticated: true,
          userId: payload.sub,
        };
      } else {
        console.error("OTP auth verification failed: Token does not contain sub claim");
        return { isAuthenticated: false };
      }
    } catch (err) {
      console.error("OTP auth verification failed:", (err as Error).message);
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
