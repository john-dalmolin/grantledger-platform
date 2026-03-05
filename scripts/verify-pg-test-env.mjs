const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for `npm run test:pg`.\n" +
      "Example: DATABASE_URL='postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls' npm run test:pg",
  );
}
