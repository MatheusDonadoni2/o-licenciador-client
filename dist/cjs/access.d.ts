import type { EntitlementStatus, Release } from "./types.js";
export type AccessSubject = {
    entitlement: {
        status: EntitlementStatus;
        expiresAt: string | null;
    };
    release: Release | null;
};
export declare function hasAccess(subject: AccessSubject, now?: Date): boolean;
