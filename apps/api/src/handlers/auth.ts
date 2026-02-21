import { toApiErrorResponse } from "../http/errors.js";
import {
  executeIdempotent,
  resolveRequestContext,
  type AsyncIdempotencyStore,
} from "@grantledger/application";
import type {
  CreateSubscriptionPayload,
  IdempotencyRecord,
  RequestContext,
} from "@grantledger/contracts";
import { createSubscriptionPayloadSchema } from "@grantledger/contracts";

import { parseOrThrowBadRequest } from "../http/validation.js";
import type { ApiResponse, Headers } from "../http/types.js";
import type { Membership } from "@grantledger/domain";
import { getHeader } from "../http/headers.js";
import { utcNowIso } from "@grantledger/shared";

interface CreateSubscriptionResponse {
  subscriptionId: string;
  tenantId: string;
  planId: string;
  status: "active";
  createdAt: string;
}

const membershipStore: Membership[] = [
  { userId: "u_1", tenantId: "t_1", role: "owner", status: "active" },
  { userId: "u_2", tenantId: "t_1", role: "member", status: "inactive" },
];

const idempotencyStore = new Map<
  string,
  IdempotencyRecord<CreateSubscriptionResponse>
>();

const authIdempotencyStore: AsyncIdempotencyStore<CreateSubscriptionResponse> =
  {
    async get(
      scope: string,
      key: string,
    ): Promise<IdempotencyRecord<CreateSubscriptionResponse> | null> {
      return idempotencyStore.get(`${scope}:${key}`) ?? null;
    },
    async set(
      scope: string,
      key: string,
      record: IdempotencyRecord<CreateSubscriptionResponse>,
    ): Promise<void> {
      idempotencyStore.set(`${scope}:${key}`, record);
    },
  };

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
  try {
    const context = resolveContextFromHeaders(headers);

    return {
      status: 200,
      body: {
        message: "Authorized",
        context,
      },
    };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}

export async function handleCreateSubscription(
  headers: Headers,
  payload: CreateSubscriptionPayload,
): Promise<ApiResponse> {
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
      execute: async () => ({
        subscriptionId: `sub_${idempotencyStore.size + 1}`,
        tenantId: context.tenant.id,
        planId: parsedPayload.planId,
        status: "active",
        createdAt: utcNowIso(),
      }),
    });

    return {
      status: replayed ? 200 : 201,
      body: {
        message: replayed ? "Replayed" : "Created",
        data: response,
        context,
      },
    };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}
