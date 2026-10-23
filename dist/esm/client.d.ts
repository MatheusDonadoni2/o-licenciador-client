import type { JWTVerifyGetKey } from "jose";
import { type FetchLike } from "./transport.js";
import type { AccessTokenClaims, CredentialResult, Customer, LoginInput, LogoutInput, RefreshInput, RegisterInput } from "./types.js";
export type LicensingClientConfig = {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    timeoutMs?: number;
    fetch?: FetchLike;
    requestId?: () => string;
    jwks?: JWTVerifyGetKey;
    clockToleranceSeconds?: number;
};
export type LicensingClient = {
    register(input: RegisterInput): Promise<Customer>;
    login(input: LoginInput): Promise<CredentialResult>;
    refresh(input: RefreshInput): Promise<CredentialResult>;
    logout(input: LogoutInput): Promise<void>;
    verifyAccessToken(token: string): Promise<AccessTokenClaims>;
};
export declare function createLicensingClient(config: LicensingClientConfig): LicensingClient;
