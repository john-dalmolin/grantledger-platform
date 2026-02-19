import { BadRequestError } from "@grantledger/application";
import { type ZodTypeAny } from "zod";

function formatZodError(
  issues: { path: PropertyKey[]; message: string }[],
): string {
  return issues
    .map((issue) => {
      const field =
        issue.path.length > 0
          ? issue.path.map((part) => String(part)).join(".")
          : "payload";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

export function parseOrThrowBadRequest<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message = "Invalid request payload",
): TSchema["_output"] {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    const details = formatZodError(parsed.error.issues);
    throw new BadRequestError(`${message} - ${details}`);
  }

  return parsed.data;
}
