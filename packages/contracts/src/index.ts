export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
}

export interface TenantContext {
  id: string;
  role: "owner" | "admin" | "member";
}

export interface RequestContext {
  user: AuthenticatedUser;
  tenant: TenantContext;
}

export type IdempotencyStatus = "completed";

export interface IdempotencyRecord<TResponse = unknown> {
  key: string;
  payloadHash: string;
  status: IdempotencyStatus;
  response: TResponse;
  createdAt: string;
}
