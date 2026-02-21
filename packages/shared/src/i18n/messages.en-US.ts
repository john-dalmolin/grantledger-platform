export const enUSMessages = {
  "auth.authorized": "Authorized",
  "subscription.created": "Created",
  "subscription.replayed": "Replayed",
  "checkout.session_created": "Checkout session created",
  "error.unexpected": "Unexpected error",
} as const;

export type EnUSMessageKey = keyof typeof enUSMessages;
