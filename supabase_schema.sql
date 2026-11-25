-- ========================================================
-- SmartCampus Canteen Platform - Supabase PostgreSQL Schema
-- ========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'Student', 'Staff', 'Delivery', 'Admin'
    wallet_balance NUMERIC(10,2) DEFAULT 0.0,
    contact VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'Snacks', 'Mains', 'Drinks', 'Desserts'
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

-- 5. Food Rescue Table (SDG-2 Zero Hunger)
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
    method VARCHAR(50) NOT NULL, -- 'Wallet', 'UPI', 'Cash on Delivery', 'Card'
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
