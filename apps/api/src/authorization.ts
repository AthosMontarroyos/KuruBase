import { forbidden } from "./errors.js";
import type { KuruBaseScope, RlsIdentity } from "./types.js";

export function requireScope(identity: RlsIdentity, scope: KuruBaseScope): void {
  if (identity.roles.length === 0) {
    throw forbidden("An authorized KuruBase role is required");
  }
  if (!identity.scopes.includes(scope)) {
    throw forbidden(`The ${scope} scope is required`);
  }
}
