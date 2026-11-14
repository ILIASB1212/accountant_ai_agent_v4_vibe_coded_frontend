"""Read-only regression check: a bad pooled connection is replaced before use."""
import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
checks = 0


def simulate_expired_connection(connection):
    global checks
    checks += 1
    if checks == 1:
        connection.close()
    ConnectionPool.check_connection(connection)


with ConnectionPool(
    conninfo=os.environ["DATABASE_URL"],
    min_size=1,
    max_size=1,
    timeout=15,
    check=simulate_expired_connection,
    kwargs={"autocommit": True, "prepare_threshold": 0, "options": "-c default_transaction_read_only=on", "connect_timeout": 10},
) as pool:
    with pool.connection() as connection:
        assert connection.execute("SELECT 1").fetchone() == (1,)
    assert checks >= 2
print("PASS: failed connection replaced before checkout; read-only query succeeded.")
