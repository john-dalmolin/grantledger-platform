export type Headers = Record<string, string | undefined>;

export interface ApiResponse {
  status: number;
  body: unknown;
}
