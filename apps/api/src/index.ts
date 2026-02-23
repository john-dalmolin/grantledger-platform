export type IdempotencyStatus = "processing" | "completed" | "failed";

export interface IdempotencyRecord<TResponse = unknown> {
  key: string;
  payloadHash: string;
  status: IdempotencyStatus;
  createdAt: string;
  updateAt: string;
  response?: TResponse;
  errorMessage?: string;
}
