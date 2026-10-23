import type { EntitlementStatus, Release } from "./types.js";

export type AccessSubject = {
  entitlement: { status: EntitlementStatus; expiresAt: string | null };
  release: Release | null;
};

const isFuture = (iso: string, now: Date): boolean => new Date(iso).getTime() > now.getTime();

export function hasAccess(subject: AccessSubject, now: Date = new Date()): boolean {
  if (subject.entitlement.status !== "ACTIVE") return false;
  if (subject.release) {
    return subject.release.expiresAt === null || isFuture(subject.release.expiresAt, now);
  }
  const { expiresAt } = subject.entitlement;
  return expiresAt === null || isFuture(expiresAt, now);
}
