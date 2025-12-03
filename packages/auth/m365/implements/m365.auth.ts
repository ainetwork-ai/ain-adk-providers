import { BaseAuth } from "@ainetwork/adk/modules";
import { AuthResponse } from "@ainetwork/adk/types/auth";
import type { Request } from "express";
import passport from "passport";
import { BearerStrategy, IBearerStrategyOption, ITokenPayload } from "passport-azure-ad";

export interface M365AuthConfig {
  clientId: string;
  tenantId: string;
}

export class M365Auth extends BaseAuth {
  constructor(private readonly config: M365AuthConfig) {
    super();
    this.initializePassport();
  }

  private initializePassport(): void {
    const options: IBearerStrategyOption = {
      identityMetadata: `https://login.microsoftonline.com/${this.config.tenantId}/v2.0/.well-known/openid-configuration`,
      clientID: this.config.clientId,
      audience: this.config.clientId,
      validateIssuer: true,
      issuer: `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`,
      loggingLevel: "warn",
    };

    passport.use(
      new BearerStrategy(options, (token: ITokenPayload, done: Function) => {
        if (!token.oid) {
          return done(new Error("Token does not contain oid claim"), null);
        }
        return done(null, token);
      })
    );
  }

  public async authenticate(req: any, res: any): Promise<AuthResponse> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return { isAuthenticated: false };
    }

    return new Promise((resolve) => {
      passport.authenticate(
        "oauth-bearer",
        { session: false },
        (err: Error | null, user: ITokenPayload | false) => {
          if (err || !user) {
            console.error("M365 auth verification failed:", err?.message || "No user");
            return resolve({ isAuthenticated: false });
          }

          return resolve({
            isAuthenticated: true,
            userId: user.oid as string,
          });
        }
      )(req, res, () => {});
    });
  }

  private extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    return authHeader.substring(7);
  }
}
