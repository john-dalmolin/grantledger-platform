import {
  AuthenticationError,
  BadRequestError,
  ForbiddenError,
  resolveRequestContext,
} from "@grantledger/application";
import type { RequestContext } from "@grantledger/contracts";
import type { Membership } from "@grantledger/domain";

type Headers = Record<string, string | undefined>;

interface ApiResponse {
  status: number;
  body: unknown;
}

const membershipStore: Membership[] = [
  { userId: "u_1", tenantId: "t_1", role: "owner", status: "active" },
  { userId: "u_2", tenantId: "t_1", role: "member", status: "inactive" },
];

function getHeader(headers: Headers, key: string): string | null {
  const value = headers[key.toLowerCase()] ?? headers[key];
  return value ?? null;
}

export function handleProtectedRequest(headers: Headers): ApiResponse {
  const userId = getHeader(headers, "x-user-id");
  const tenantId = getHeader(headers, "x-tenant-id");

  const user = userId ? { id: userId } : null;
  const memberships = userId
    ? membershipStore.filter((membership) => membership.userId === userId)
    : [];

  try {
    const context: RequestContext = resolveRequestContext({
      user,
      tenantId,
      memberships,
    });

    return {
      status: 200,
      body: {
        message: "Authorized",
        context,
      },
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { status: 401, body: { message: error.message } };
    }

    if (error instanceof ForbiddenError) {
      return { status: 403, body: { message: error.message } };
    }

    if (error instanceof BadRequestError) {
      return { status: 400, body: { message: error.message } };
    }

    return { status: 500, body: { message: "Unexpected error" } };
  }
}
