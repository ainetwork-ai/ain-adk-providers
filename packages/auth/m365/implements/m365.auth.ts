import { BaseAuth } from "@ainetwork/adk/modules";
import { AuthResponse } from "@ainetwork/adk/types/auth";
import type { Request } from "express";
import jwt, { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export interface M365AuthConfig {
  clientId: string;
  tenantId: string;
  cloudInstance?: string;
  nextAuthSecret?: string;
}

interface AzureADTokenPayload {
  aud: string;
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  oid?: string;
  sub?: string;
  tid?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
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

export class M365Auth extends BaseAuth {
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly cloudInstance: string;
  private readonly expectedIssuer: string;

  constructor(private readonly config: M365AuthConfig) {
    super();
    this.cloudInstance = this.config.cloudInstance || "https://login.microsoftonline.com";
    this.expectedIssuer = `${this.cloudInstance}/${this.config.tenantId}/v2.0`;

    this.jwksClient = jwksClient({
      jwksUri: `${this.cloudInstance}/${this.config.tenantId}/discovery/v2.0/keys`,
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

  private verifyAzureADToken(token: string): Promise<AzureADTokenPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getSigningKey,
        {
          algorithms: ["RS256"],
          audience: this.config.clientId,
          issuer: this.expectedIssuer,
        },
        (err: Error | null, decoded: unknown) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(decoded as AzureADTokenPayload);
        }
      );
    });
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
        (err: Error | null, decoded: unknown) => {
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
          // If NextAuth verification fails, try Azure AD token verification
        }
      }

      // Try to verify as Azure AD token
      const payload = await this.verifyAzureADToken(token);

      if (!payload.oid && !payload.sub) {
        console.error("M365 auth verification failed: Token does not contain oid or sub claim");
        return { isAuthenticated: false };
      }

      return {
        isAuthenticated: true,
        userId: (payload.oid || payload.sub) as string,
      };
    } catch (err) {
      console.error("M365 auth verification failed:", (err as Error).message);
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
