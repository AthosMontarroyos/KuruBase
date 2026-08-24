export const KURUBASE_ROLES = ["member", "operator", "service"] as const;
export const KURUBASE_SCOPES = [
  "kurubase:data:read",
  "kurubase:data:write",
  "kurubase:org:write",
  "kurubase:admin"
] as const;

export type KuruBaseRole = (typeof KURUBASE_ROLES)[number];
export type KuruBaseScope = (typeof KURUBASE_SCOPES)[number];
export type IdentityProviderMode = "cloudflare-access" | "oidc" | "local-jwt";
export type ExternalIdentityProvider = Exclude<IdentityProviderMode, "local-jwt">;
export type ExternalIdentityType = "human" | "service";

export interface RlsIdentity {
  sub: string;
  org_id: string | null;
  roles: KuruBaseRole[];
  scopes: KuruBaseScope[];
}

/** @deprecated Use RlsIdentity. */
export type AuthClaims = RlsIdentity;

export interface IdentityRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface IdentityProvider {
  authenticate(request: IdentityRequest): Promise<RlsIdentity>;
}

export interface ExternalIdentityReference {
  provider: ExternalIdentityProvider;
  issuer: string;
  subjectType: ExternalIdentityType;
  subject: string;
}

export interface PrincipalResolver {
  resolve(reference: ExternalIdentityReference): Promise<RlsIdentity | null>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataEnvelope<T> {
  data: T | null;
  error: ApiErrorBody | null;
  count: number | null;
  status: number;
}

export interface AccessTokenVerifier<T> {
  verify(token: string): Promise<T>;
}
