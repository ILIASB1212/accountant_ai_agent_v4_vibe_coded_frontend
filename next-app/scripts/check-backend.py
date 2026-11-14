"""Read-only local backend readiness checks. Never prints credential values."""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from dotenv import load_dotenv
import psycopg

root = Path(__file__).resolve().parents[2]
load_dotenv(root / ".env")
report = {}
try:
    with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=10,
                         options="-c default_transaction_read_only=on") as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'checkpoint%'")
            tables = dict(cursor.fetchall())
            report["checkpoint_tables_present"] = all(name in tables for name in ["checkpoint_migrations", "checkpoints", "checkpoint_blobs", "checkpoint_writes"])
            report["checkpoint_rls_enabled"] = bool(tables) and all(tables.values())
            if "checkpoint_migrations" in tables:
                cursor.execute("SELECT max(v) FROM public.checkpoint_migrations")
                report["checkpoint_migration_version"] = cursor.fetchone()[0]
            cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('profiles','companies','company_members','clients','chat_sessions','messages')")
            report["app_tables_present"] = len(cursor.fetchall()) == 6
            report["database_reachable"] = True
except Exception as error:
    report["database_reachable"] = False
    report["database_error_type"] = type(error).__name__
    message = str(error).lower()
    report["database_error_category"] = ("dns" if "resolve" in message or "translate host" in message else "authentication" if "password authentication" in message else "connection" if "connection" in message else "configuration")

try:
    target = os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/settings"
    request = Request(target, headers={"apikey": os.environ["SUPABASE_KEY"]})
    with urlopen(request, timeout=15) as response:
        report["supabase_auth_status"] = response.status
except HTTPError as error:
    report["supabase_auth_status"] = error.code
except Exception as error:
    report["supabase_auth_error_type"] = type(error).__name__

print(json.dumps(report, indent=2))
