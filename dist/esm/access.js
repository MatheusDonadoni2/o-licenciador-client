const isFuture = (iso, now) => new Date(iso).getTime() > now.getTime();
export function hasAccess(subject, now = new Date()) {
    if (subject.entitlement.status !== "ACTIVE")
        return false;
    if (subject.release) {
        return subject.release.expiresAt === null || isFuture(subject.release.expiresAt, now);
    }
    const { expiresAt } = subject.entitlement;
    return expiresAt === null || isFuture(expiresAt, now);
}
