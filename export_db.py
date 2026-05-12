import os
import subprocess
import json

def run_sql(query):
    result = subprocess.run(['psql', '-t', '-A', '-c', query], capture_output=True, text=True)
    return result.stdout.strip()

def get_extensions():
    query = "SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql', 'pg_stat_statements');"
    return run_sql(query).split('\n')

def get_enums():
    query = """
    SELECT n.nspname as schema, t.typname as name, string_agg(e.enumlabel, ',') as values
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY n.nspname, t.typname;
    """
    return run_sql(query)

def get_tables():
    query = "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
    return run_sql(query).split('\n')

# This is a simplified extraction script. In a real scenario, we'd use pg_dump but we need to format it specifically.
# Since pg_dump might not be fully accessible or formatted as requested, let's use a combination.

print("PARTE 1 — EXTENSIONS E TIPOS")
extensions = get_extensions()
for ext in extensions:
    if ext:
        print(f"CREATE EXTENSION IF NOT EXISTS \"{ext}\";")

enums = get_enums()
if enums:
    for line in enums.split('\n'):
        if line:
            parts = line.split('|')
            schema, name, values = parts[0], parts[1], parts[2]
            vals = ", ".join([f"'{v}'" for v in values.split(',')])
            print(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{name}') THEN CREATE TYPE {name} AS ENUM ({vals}); END IF; END $$;")

print("\nPARTE 2-3-4-5-7 (SCHEMA STRUCTURE)")
# Use pg_dump for schema only, public schema
os.system("pg_dump --schema-only --no-owner --no-privileges --schema=public")

print("\nPARTE 6 — DADOS")
tables = get_tables()
for table in tables:
    if table:
        print(f"\n-- Data for {table}")
        # Use copy to generate inserts or just dump data
        # For small to medium data, we can use pg_dump with --data-only --inserts
        os.system(f"pg_dump --data-only --inserts --no-owner --no-privileges --table=public.{table}")

print("\nPARTE 8 — VALIDAÇÃO")
print("SELECT 'Tables' as type, count(*) as total FROM information_schema.tables WHERE table_schema = 'public';")
print("SELECT 'Functions' as type, count(*) as total FROM information_schema.routines WHERE routine_schema = 'public';")
print("SELECT 'Triggers' as type, count(*) as total FROM information_schema.triggers WHERE event_object_schema = 'public';")
print("SELECT 'Policies' as type, count(*) as total FROM pg_policies WHERE schemaname = 'public';")
