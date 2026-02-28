import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  createSubscriptionPayloadSchema,
  createSubscriptionResponseSchema,
  startCheckoutPayloadSchema,
  startCheckoutResponseSchema,
  enqueueInvoiceGenerationPayloadSchema,
  enqueueInvoiceGenerationResponseSchema,
  getInvoiceGenerationJobStatusPayloadSchema,
  getInvoiceGenerationJobStatusResponseSchema,
  paymentWebhookEnvelopeSchema,
  paymentWebhookProcessResultSchema,
} from "../packages/contracts/dist/schemas/index.js";

const outPath = path.resolve(
  process.cwd(),
  "docs/openapi/openapi.json",
);

const components = {
  CreateSubscriptionPayload: z.toJSONSchema(createSubscriptionPayloadSchema),
  CreateSubscriptionResponse: z.toJSONSchema(createSubscriptionResponseSchema),
  StartCheckoutPayload: z.toJSONSchema(startCheckoutPayloadSchema),
  StartCheckoutResponse: z.toJSONSchema(startCheckoutResponseSchema),
  EnqueueInvoiceGenerationPayload: z.toJSONSchema(
    enqueueInvoiceGenerationPayloadSchema,
  ),
  EnqueueInvoiceGenerationResponse: z.toJSONSchema(
    enqueueInvoiceGenerationResponseSchema,
  ),
  GetInvoiceGenerationJobStatusPayload: z.toJSONSchema(
    getInvoiceGenerationJobStatusPayloadSchema,
  ),
  GetInvoiceGenerationJobStatusResponse: z.toJSONSchema(
    getInvoiceGenerationJobStatusResponseSchema,
  ),
  PaymentWebhookEnvelope: z.toJSONSchema(paymentWebhookEnvelopeSchema),
  PaymentWebhookProcessResult: z.toJSONSchema(
    paymentWebhookProcessResultSchema,
  ),
};

const spec = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "GrantLedger API",
    version: "0.1.0",
  },
  paths: {
    "/v1/auth/subscriptions": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSubscriptionPayload" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateSubscriptionResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/checkout/sessions": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StartCheckoutPayload" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StartCheckoutResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/invoices/generation": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EnqueueInvoiceGenerationPayload" },
            },
          },
        },
        responses: {
          "202": {
            description: "Accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EnqueueInvoiceGenerationResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/invoices/generation/status": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GetInvoiceGenerationJobStatusPayload",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GetInvoiceGenerationJobStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/v1/webhooks/provider": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PaymentWebhookEnvelope" },
            },
          },
        },
        responses: {
          "200": {
            description: "Processed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaymentWebhookProcessResult" },
              },
            },
          },
        },
      },
    },
  },
  components: { schemas: components },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`OpenAPI generated at ${outPath}`);
