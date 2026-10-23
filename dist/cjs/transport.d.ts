import { LicensingError } from "./errors.js";
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type TransportConfig = {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    timeoutMs: number;
    fetch: FetchLike;
    requestId: () => string;
};
export type TransportResponse = {
    status: number;
    body: unknown;
};
export declare const newRequestId: () => string;
export declare class Transport {
    private readonly config;
    constructor(config: TransportConfig);
    post(path: string, body: unknown, clientIp?: string): Promise<TransportResponse>;
    private readBody;
    private unavailable;
}
export declare function toLicensingError(status: number, body: unknown): LicensingError;
export declare const impedimentsOf: (body: unknown) => {
    code: string | null;
    message: string;
}[];
export declare const isAccessDenied: (status: number, body: unknown) => boolean;
