import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasAccess } from "../src/index.js";

const now = new Date("2026-10-23T12:00:00Z");
const past = "2026-10-01T00:00:00.000Z";
const future = "2026-12-01T00:00:00.000Z";

describe("hasAccess", () => {
  it("licença ativa dentro do prazo libera", () => {
    assert.equal(
      hasAccess({ entitlement: { status: "ACTIVE", expiresAt: future }, release: null }, now),
      true,
    );
  });

  it("qualquer situação diferente de ACTIVE barra", () => {
    for (const status of ["NONE", "EXPIRED", "SUSPENDED", "REVOKED", "DEVICE_LIMIT"] as const) {
      assert.equal(
        hasAccess({ entitlement: { status, expiresAt: future }, release: null }, now),
        false,
      );
    }
  });

  it("licença ativa mas já vencida barra, mesmo que o token ainda não tenha vencido", () => {
    assert.equal(
      hasAccess({ entitlement: { status: "ACTIVE", expiresAt: past }, release: null }, now),
      false,
    );
  });

  it("acesso total sem licença nem prazo libera", () => {
    assert.equal(
      hasAccess(
        {
          entitlement: { status: "ACTIVE", expiresAt: null },
          release: { action: "FULL_ACCESS", expiresAt: null },
        },
        now,
      ),
      true,
    );
  });

  it("com liberação vale o prazo da liberação, não o da licença vencida", () => {
    assert.equal(
      hasAccess(
        {
          entitlement: { status: "ACTIVE", expiresAt: past },
          release: { action: "FULL_ACCESS", expiresAt: future },
        },
        now,
      ),
      true,
    );
    assert.equal(
      hasAccess(
        {
          entitlement: { status: "ACTIVE", expiresAt: future },
          release: { action: "PERIOD", expiresAt: past },
        },
        now,
      ),
      false,
    );
  });
});
