import type { Customer, Grant, Release } from "./types.js";
export declare function parseCustomer(value: unknown, status: number): Customer;
export declare function parseRelease(value: unknown, status: number): Release | null;
export declare function parseGrant(value: unknown, status: number): Grant;
