import { toApiErrorResponse } from "../http/errors.js";
import {
  createInMemoryAsyncIdempotencyStore,
  executeIdempotent,
  resolveRequestContext,
} from "@grantledger/application";
import {
  createSubscriptionPayloadSchema,
  createSubscriptionResponseSchema,
  type RequestContext,
  type CreateSubscriptionResponse,
} from "@grantledger/contracts";

import { parseOrThrowBadRequest } from "../http/validation.js";
import type { ApiResponse, Headers } from "../http/types.js";
import type { Membership } from "@grantledger/domain";
import { getHeader } from "../http/headers.js";
import { t, utcNowIso } from "@grantledger/shared";

const membershipStore: Membership[] = [
  { userId: "u_1", tenantId: "t_1", role: "owner", status: "active" },
  { userId: "u_2", tenantId: "t_1", role: "member", status: "inactive" },
];

const authIdempotencyStore =
  createInMemoryAsyncIdempotencyStore<CreateSubscriptionResponse>();
let subscriptionCounter = 0;

function localeFromHeaders(headers: Headers): string | undefined {
  return getHeader(headers, "accept-language") ?? undefined;
}

export function resolveContextFromHeaders(headers: Headers): RequestContext {
  const userId = getHeader(headers, "x-user-id");
  const tenantId = getHeader(headers, "x-tenant-id");

  const user = userId ? { id: userId } : null;
  const memberships = userId
    ? membershipStore.filter((membership) => membership.userId === userId)
    : [];

  return resolveRequestContext({
    user,
    tenantId,
    memberships,
  });
}

export function handleProtectedRequest(headers: Headers): ApiResponse {
  const locale = localeFromHeaders(headers);

  try {
    const context = resolveContextFromHeaders(headers);

    return {
      status: 200,
      body: {
        message: t("auth.authorized", locale ? { locale } : undefined),
        context,
      },
    };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
      locale,
    );
  }
}

export async function handleCreateSubscription(
  headers: Headers,
  payload: unknown,
): Promise<ApiResponse> {
  const locale = localeFromHeaders(headers);

  try {
    const context = resolveContextFromHeaders(headers);
    const parsedPayload = parseOrThrowBadRequest(
      createSubscriptionPayloadSchema,
      payload,
      "Invalid create subscription payload",
    );

    const idempotencyKey = getHeader(headers, "idempotency-key");

    const { response, replayed } = await executeIdempotent({
      scope: "auth.create_subscription",
      key: idempotencyKey,
      payload: {
        tenantId: context.tenant.id,
        planId: parsedPayload.planId,
        externalReference: parsedPayload.externalReference ?? null,
      },
      store: authIdempotencyStore,
      execute: async () => {
        subscriptionCounter += 1;
        return createSubscriptionResponseSchema.parse({
          subscriptionId: `sub_${subscriptionCounter}`,
          tenantId: context.tenant.id,
          planId: parsedPayload.planId,
          status: "active",
          createdAt: utcNowIso(),
        });
      },
    });

    return {
      status: replayed ? 200 : 201,
      body: {
        message: replayed
          ? t("subscription.replayed", locale ? { locale } : undefined)
          : t("subscription.created", locale ? { locale } : undefined),
        data: response,
        context,
      },
    };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
      locale,
    );
  }
}
