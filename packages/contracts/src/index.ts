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
