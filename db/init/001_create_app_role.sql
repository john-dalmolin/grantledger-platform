DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_roles
     WHERE rolname = 'grantledger_app'
  ) THEN
    CREATE ROLE grantledger_app
      LOGIN
      PASSWORD 'grantledger_app'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  END IF;
END $$;

GRANT CONNECT ON DATABASE grantledger_rls TO grantledger_app;
GRANT USAGE, CREATE ON SCHEMA public TO grantledger_app;
