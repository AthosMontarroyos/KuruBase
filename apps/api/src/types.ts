export interface AuthClaims {
  sub: string;
  org_id: string | null;
  roles: string[];
  scopes: string[];
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
