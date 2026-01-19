import { AuthModule } from "@ainetwork/adk/modules";
import { AuthResponse } from "@ainetwork/adk/types/auth";
import type { Request } from "express";
import jwt, { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export interface GoogleAuthConfig {
  clientId: string;
  nextAuthSecret?: string;
}

interface GoogleTokenPayload {
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  azp?: string;
}

interface GoogleTokenInfoResponse {
  azp: string;
  aud: string;
  sub: string;
  scope: string;
  exp: string;
  expires_in: string;
  email?: string;
  email_verified?: string;
  access_type?: string;
  error?: string;
  error_description?: string;
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

const GOOGLE_ISSUERS: [string, ...string[]] = [
  "https://accounts.google.com",
  "accounts.google.com",
];

export class GoogleAuth extends AuthModule {
  private readonly jwksClient: jwksClient.JwksClient;

  constructor(private readonly config: GoogleAuthConfig) {
    super();

    this.jwksClient = jwksClient({
      jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  private getSigningKey = (header: JwtHeader, callback: SigningKeyCallback): void => {
    this.jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  };

  private verifyGoogleIdToken(token: string): Promise<GoogleTokenPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getSigningKey,
        {
          algorithms: ["RS256"],
          audience: this.config.clientId,
          issuer: GOOGLE_ISSUERS,
        },
        (err: Error | null, decoded: unknown) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(decoded as GoogleTokenPayload);
        }
      );
    });
  }

  private async verifyGoogleAccessToken(token: string): Promise<GoogleTokenInfoResponse> {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    );

    const data = await response.json() as GoogleTokenInfoResponse;

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    // Verify the token is for our client
    if (data.aud !== this.config.clientId && data.azp !== this.config.clientId) {
      throw new Error("Token was not issued for this client");
    }

    return data;
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

  private isGoogleAccessToken(token: string): boolean {
    return token.startsWith("ya29.");
  }

  public async authenticate(req: any, res: any): Promise<AuthResponse> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return { isAuthenticated: false };
    }

    try {
      // First, try to verify as NextAuth JWT token (signed with NEXTAUTH_SECRET)
      if (this.config.nextAuthSecret) {
        try {
          const payload = await this.verifyNextAuthToken(token);
          if (payload.sub) {
            return {
              isAuthenticated: true,
              userId: payload.sub,
            };
          }
        } catch {
          // If NextAuth verification fails, try other methods
        }
      }

      // Check if it's a Google Access Token (starts with "ya29.")
      if (this.isGoogleAccessToken(token)) {
        const tokenInfo = await this.verifyGoogleAccessToken(token);
        if (tokenInfo.sub) {
          return {
            isAuthenticated: true,
            userId: tokenInfo.sub,
          };
        }
        console.error("Google auth verification failed: Token does not contain sub claim");
        return { isAuthenticated: false };
      }

      // Try to verify as Google ID token (JWT)
      const payload = await this.verifyGoogleIdToken(token);

      if (!payload.sub) {
        console.error("Google auth verification failed: Token does not contain sub claim");
        return { isAuthenticated: false };
      }

      return {
        isAuthenticated: true,
        userId: payload.sub,
      };
    } catch (err) {
      console.error("Google auth verification failed:", (err as Error).message);
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
