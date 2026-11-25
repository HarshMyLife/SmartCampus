import os
import sys
import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartcampus.db")
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")

POSTGRES_SCHEMA = """
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    wallet_balance NUMERIC(10,2) DEFAULT 0.0,
    contact VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'Active',
    image_url TEXT,
    description TEXT
);

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    items_json TEXT NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    order_status VARCHAR(50) DEFAULT 'Ordered',
    order_type VARCHAR(50) DEFAULT 'Pickup',
    delivery_location TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Delivery Details Table
CREATE TABLE IF NOT EXISTS delivery_details (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    rider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    otp VARCHAR(10) NOT NULL,
    status VARCHAR(50) DEFAULT 'Assigned',
    completed_at TIMESTAMP
);

-- 5. Food Rescue Table (SDG-2)
CREATE TABLE IF NOT EXISTS food_rescue (
    id SERIAL PRIMARY KEY,
    original_order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    original_price NUMERIC(10,2) NOT NULL,
    discounted_price NUMERIC(10,2) NOT NULL,
    quantity INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    method VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Completed',
    transaction_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Feedback Table
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

def migrate():
    print("=" * 65)
    print("      SMARTCAMPUS SQLITE -> SUPABASE MIGRATION WIZARD")
    print("=" * 65)

    if not DATABASE_URL:
        print("\n[ERROR] DATABASE_URL not found!")
        print("Please add your Supabase connection string to .env file:")
        print("DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres")
        sys.exit(1)

    print("\n[1/4] Connecting to Supabase PostgreSQL...")
    try:
        pg_conn = psycopg2.connect(DATABASE_URL)
        pg_conn.autocommit = False
        pg_cursor = pg_conn.cursor()
        print("  ✓ Connected to Supabase successfully!")
    except Exception as e:
        print(f"  ✗ Connection failed: {e}")
        sys.exit(1)

    print("\n[2/4] Creating PostgreSQL tables...")
    try:
        pg_cursor.execute(POSTGRES_SCHEMA)
        pg_conn.commit()
        print("  ✓ All 8 tables verified/created on Supabase!")
    except Exception as e:
        pg_conn.rollback()
        print(f"  ✗ Failed to create schema: {e}")
        sys.exit(1)

    if not os.path.exists(SQLITE_PATH):
        print(f"[!] Local SQLite database '{SQLITE_PATH}' not found. Schema created on Supabase. Done.")
        sys.exit(0)

    print(f"\n[3/4] Reading data from local SQLite: {SQLITE_PATH}")
    sl_conn = sqlite3.connect(SQLITE_PATH)
    sl_conn.row_factory = sqlite3.Row
    sl_cursor = sl_conn.cursor()

    tables = ["users", "menu_items", "orders", "delivery_details", "food_rescue", "payments", "audit_logs", "feedback"]
    
    for table in tables:
        sl_cursor.execute(f"SELECT * FROM {table}")
        rows = sl_cursor.fetchall()
        if not rows:
            print(f"  • {table}: 0 rows (skipped)")
            continue

        columns = rows[0].keys()
        cols_str = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))
        insert_sql = f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

        row_data = [tuple(row[c] for c in columns) for row in rows]
        pg_cursor.executemany(insert_sql, row_data)
        pg_conn.commit()

        # Update serial sequence to avoid key collision on new inserts
        if "id" in columns:
            try:
                pg_cursor.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(max(id), 1)) FROM {table};")
                pg_conn.commit()
            except Exception:
                pg_conn.rollback()

        print(f"  ✓ {table}: Successfully migrated {len(rows)} records!")

    sl_conn.close()
    pg_cursor.close()
    pg_conn.close()

    print("\n[4/4] MIGRATION COMPLETE!")
    print("Your Supabase cloud database is now fully populated and live.")
    print("=" * 65)

if __name__ == "__main__":
    migrate()
