-- PARTE 1 — EXTENSIONS E TIPOS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "moddatetime";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'paciente_encaminhamento_status' AND n.nspname = 'public') THEN CREATE TYPE paciente_encaminhamento_status AS ENUM ('pendente', 'realizado', 'cancelado'); END IF; END $$;
