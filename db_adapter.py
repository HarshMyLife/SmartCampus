import os
import re
import sqlite3

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartcampus.db")

class PostgresRowDict(dict):
    """Provides dictionary-like and attribute-like access matching sqlite3.Row"""
    def __getitem__(self, item):
        if isinstance(item, int):
            return list(self.values())[item]
        return super().__getitem__(item)

class PostgresCursorWrapper:
    def __init__(self, pg_cursor):
        self._cursor = pg_cursor
        self.lastrowid = None

    def _convert_query(self, sql):
        parts = []
        in_quote = False
        quote_char = ''
        i = 0
        while i < len(sql):
            ch = sql[i]
            if ch in ("'", '"') and (i == 0 or sql[i-1] != '\\'):
                if not in_quote:
                    in_quote = True
                    quote_char = ch
                elif quote_char == ch:
                    in_quote = False
                parts.append(ch)
            elif ch == '?' and not in_quote:
                parts.append('%s')
            else:
                parts.append(ch)
            i += 1
        return "".join(parts)

    def execute(self, sql, params=None):
        sql_converted = self._convert_query(sql)
        is_insert = sql_converted.strip().upper().startswith("INSERT INTO")
        
        # If it's an insert without RETURNING, append RETURNING id to capture lastrowid
        if is_insert and "RETURNING" not in sql_converted.upper():
            sql_converted = sql_converted.rstrip(" ;") + " RETURNING id;"
            if params:
                self._cursor.execute(sql_converted, params)
            else:
                self._cursor.execute(sql_converted)
            try:
                res = self._cursor.fetchone()
                if res:
                    self.lastrowid = res.get('id') if isinstance(res, dict) else res[0]
            except Exception:
                self.lastrowid = None
        else:
            if params:
                self._cursor.execute(sql_converted, params)
            else:
                self._cursor.execute(sql_converted)
        return self

    def executemany(self, sql, seq_of_parameters):
        sql_converted = self._convert_query(sql)
        return self._cursor.executemany(sql_converted, seq_of_parameters)

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return PostgresRowDict(row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [PostgresRowDict(r) for r in rows]

    def close(self):
        self._cursor.close()

class PostgresConnectionWrapper:
    def __init__(self, pg_conn):
        self._conn = pg_conn

    def cursor(self):
        import psycopg2.extras
        raw_cursor = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return PostgresCursorWrapper(raw_cursor)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

def get_connection():
    if DATABASE_URL:
        import psycopg2
        pg_conn = psycopg2.connect(DATABASE_URL)
        return PostgresConnectionWrapper(pg_conn)
    else:
        conn = sqlite3.connect(SQLITE_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

def is_postgres():
    return bool(DATABASE_URL)
