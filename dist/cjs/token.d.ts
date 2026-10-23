import { type JWTVerifyGetKey } from "jose";
import type { AccessTokenClaims } from "./types.js";
export type TokenVerifierConfig = {
    baseUrl: string;
    clientId: string;
    jwks?: JWTVerifyGetKey;
    clockToleranceSeconds?: number;
};
export declare class TokenVerifier {
    private readonly config;
    private readonly keys;
    constructor(config: TokenVerifierConfig);
    verify(token: string): Promise<AccessTokenClaims>;
    private translate;
}
