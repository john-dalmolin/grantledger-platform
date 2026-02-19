import type { AuthenticatedUser, RequestContext } from "@grantledger/contracts";
import {
  hasActiveMembershipForTenant,
  type Membership,
} from "@grantledger/domain";

export class AuthenticationError extends Error {
  constructor(message = "User is not authenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "User has no access to this tenant") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  constructor(message = "Invalid request input") {
    super(message);
    this.name = "BadRequestError";
  }
}

export interface ResolveRequestContextInput {
  user: AuthenticatedUser | null;
  tenantId: string | null;
  memberships: ReadonlyArray<Membership>;
}

export function resolveRequestContext(
  input: ResolveRequestContextInput,
): RequestContext {
  if (!input.user) {
    throw new AuthenticationError();
  }

  if (!input.tenantId) {
    throw new BadRequestError("Tenant id is required");
  }

  const membership = hasActiveMembershipForTenant(
    input.memberships,
    input.tenantId,
  );

  if (!membership) {
    throw new ForbiddenError();
  }

  return {
    user: input.user,
    tenant: {
      id: membership.tenantId,
      role: membership.role,
    },
  };
}
