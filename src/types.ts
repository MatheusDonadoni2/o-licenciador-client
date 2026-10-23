export type EntitlementStatus =
  | "NONE"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "REVOKED"
  | "NOT_STARTED"
  | "DEVICE_LIMIT"
  | "DEVICE_REVOKED";

export type ReleaseAction = "ONE_TIME" | "PERIOD" | "ADD_DEVICE" | "GRANT_LICENSE" | "FULL_ACCESS";

export type Entitlement = {
  status: EntitlementStatus;
  licenseId: string | null;
  planName: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  accessGranted: boolean;
};

export type Release = {
  action: ReleaseAction;
  expiresAt: string | null;
};

export type Customer = {
  id: string;
  email: string;
  name: string;
};

export type Grant = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  customer: Customer;
  entitlement: Entitlement;
  release: Release | null;
};

export type Impediment = {
  code: string | null;
  message: string;
};

export type Granted = { status: "GRANTED"; grant: Grant };

export type Denied = { status: "DENIED"; impediments: Impediment[] };

export type CredentialResult = Granted | Denied;

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  clientIp?: string;
};

export type LoginInput = {
  email: string;
  password: string;
  deviceId: string;
  deviceName?: string;
  clientIp?: string;
};

export type RefreshInput = {
  refreshToken: string;
  clientIp?: string;
};

export type LogoutInput = {
  refreshToken: string;
  clientIp?: string;
};

export type AccessTokenClaims = {
  customerId: string;
  email: string;
  name: string;
  appId: string;
  appSlug: string;
  deviceId: string | null;
  sessionId: string;
  entitlement: {
    status: EntitlementStatus;
    licenseId: string | null;
    planName: string | null;
    expiresAt: string | null;
  };
  release: Release | null;
  issuedAt: Date;
  expiresAt: Date;
};
