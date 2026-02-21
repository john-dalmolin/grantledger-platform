import type { AuthenticatedUser, RequestContext } from "@grantledger/contracts";
import {
  hasActiveMembershipForTenant,
  type Membership,
} from "@grantledger/domain";
import {
  AuthenticationError,
  BadRequestError,
  ForbiddenError,
} from "./errors.js";

export { AuthenticationError, BadRequestError, ForbiddenError } from "./errors.js";

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
