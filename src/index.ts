export { type AccessSubject, hasAccess } from "./access.js";
export {
  createLicensingClient,
  type LicensingClient,
  type LicensingClientConfig,
} from "./client.js";
export {
  isLicensingError,
  isUnavailable,
  LICENSING_ERROR_CODES,
  LicensingError,
  type LicensingErrorCode,
  LicensingUnavailableError,
} from "./errors.js";
export type { FetchLike } from "./transport.js";
export type {
  AccessTokenClaims,
  CredentialResult,
  Customer,
  Denied,
  Entitlement,
  EntitlementStatus,
  Grant,
  Granted,
  Impediment,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  Release,
  ReleaseAction,
} from "./types.js";
