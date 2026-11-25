import sqlite3
import os
import json
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import db_adapter

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartcampus.db")

def get_db():
    return db_adapter.get_connection()

def init_db():
    if db_adapter.is_postgres():
        from migrate_to_supabase import POSTGRES_SCHEMA
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(POSTGRES_SCHEMA)
        conn.commit()
        conn.close()
        return

    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL, -- 'Student', 'Staff', 'Delivery', 'Admin'
        wallet_balance REAL DEFAULT 0.0,
        contact TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. MenuItems Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Snacks', 'Mains', 'Drinks', 'Desserts'
        price REAL NOT NULL,
        stock_quantity INTEGER NOT NULL,
        status TEXT DEFAULT 'Active', -- 'Active', 'Inactive'
        image_url TEXT,
        description TEXT
    )
    """)
    
    # 3. Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        items_json TEXT NOT NULL, -- JSON string storing items, quantities, and prices
        total_amount REAL NOT NULL,
        order_status TEXT DEFAULT 'Ordered', -- 'Ordered', 'Cooking', 'Ready', 'In Transit', 'Delivered', 'Cancelled'
        order_type TEXT DEFAULT 'Pickup', -- 'Pickup', 'Delivery'
        delivery_location TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)
    
    # 4. Delivery Details Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS delivery_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL UNIQUE,
        rider_id INTEGER,
        otp TEXT NOT NULL, -- 4-digit verification code
        status TEXT DEFAULT 'Assigned', -- 'Assigned', 'In Transit', 'Delivered'
        completed_at TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (rider_id) REFERENCES users(id)
    )
    """)
    
    # 5. Food Rescue Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS food_rescue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_order_id INTEGER,
        menu_item_id INTEGER NOT NULL,
        original_price REAL NOT NULL,
        discounted_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        status TEXT DEFAULT 'Available', -- 'Available', 'Sold', 'Expired'
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (original_order_id) REFERENCES orders(id),
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    )
    """)
    
    # 6. Payments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        method TEXT NOT NULL, -- 'Wallet', 'UPI', 'Card'
        amount REAL NOT NULL,
        status TEXT DEFAULT 'Completed', -- 'Completed', 'Pending', 'Failed'
        transaction_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )
    """)
    
    # 7. Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 8. Feedback Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL UNIQUE,
        rating INTEGER NOT NULL,
        comments TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )
    """)
    
    conn.commit()
    conn.close()

# User Helpers
def create_user(name, email, password, role="Student", contact=None, wallet_balance=0.0):
    conn = get_db()
    cursor = conn.cursor()
    pw_hash = generate_password_hash(password)
    try:
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role, contact, wallet_balance) VALUES (?, ?, ?, ?, ?, ?)",
            (name, email, pw_hash, role, contact, wallet_balance)
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        return None

def get_user_by_email(email):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    return user

def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    return user

def get_all_users_by_role(role):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE role = ?", (role,))
    users = cursor.fetchall()
    conn.close()
    return users

def delete_user(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

def update_wallet(user_id, amount):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? AND wallet_balance + ? >= 0", (amount, user_id, amount))
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success

# Menu Helpers
def add_menu_item(name, category, price, stock_quantity, status="Active", image_url=None, description=""):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO menu_items (name, category, price, stock_quantity, status, image_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (name, category, price, stock_quantity, status, image_url, description)
    )
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    add_audit_log(f"New Menu Item '{name}' (ID: {item_id}) added to menu.")
    return item_id

def update_menu_item(item_id, name, category, price, stock_quantity, status, image_url=None, description=""):
    conn = get_db()
    cursor = conn.cursor()
    if image_url:
        cursor.execute(
            "UPDATE menu_items SET name=?, category=?, price=?, stock_quantity=?, status=?, image_url=?, description=? WHERE id=?",
            (name, category, price, stock_quantity, status, image_url, description, item_id)
        )
    else:
        cursor.execute(
            "UPDATE menu_items SET name=?, category=?, price=?, stock_quantity=?, status=?, description=? WHERE id=?",
            (name, category, price, stock_quantity, status, description, item_id)
        )
    conn.commit()
    conn.close()
    add_audit_log(f"Menu Item ID {item_id} ('{name}') updated.")

def get_all_menu_items():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu_items")
    items = cursor.fetchall()
    conn.close()
    return items

def get_active_menu_items():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu_items WHERE status = 'Active'")
    items = cursor.fetchall()
    conn.close()
    return items

# Order Helpers
def create_order(user_id, items, total_amount, order_type="Pickup", delivery_location=None, initial_status="Ordered"):
    conn = get_db()
    cursor = conn.cursor()
    items_json = json.dumps(items)
    
    # Check menu item stocks
    for item in items:
        cursor.execute("SELECT stock_quantity FROM menu_items WHERE id = ?", (item['id'],))
        row = cursor.fetchone()
        if not row or row['stock_quantity'] < item['quantity']:
            conn.close()
            return None, f"Insufficient stock for {item['name']}"
            
    # Deduct stock
    for item in items:
        cursor.execute("UPDATE menu_items SET stock_quantity = stock_quantity - ? WHERE id = ?", (item['quantity'], item['id']))
        
    cursor.execute(
        "INSERT INTO orders (user_id, items_json, total_amount, order_status, order_type, delivery_location) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, items_json, total_amount, initial_status, order_type, delivery_location)
    )
    order_id = cursor.lastrowid
    
    # If delivery, generate delivery detail row with a 4-digit OTP
    if order_type == "Delivery":
        import random
        otp = f"{random.randint(1000, 9999)}"
        cursor.execute(
            "INSERT INTO delivery_details (order_id, otp, status) VALUES (?, ?, ?)",
            (order_id, otp, 'Assigned')
        )
        
    conn.commit()
    conn.close()
    
    add_audit_log(f"Order #{order_id} placed (Status: {initial_status})")
    return order_id, None

def get_order(order_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT o.*, u.name as student_name, u.contact as student_contact, d.otp, d.status as delivery_status, d.rider_id,
               p.method as payment_method, p.status as payment_status
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN delivery_details d ON o.id = d.order_id
        LEFT JOIN payments p ON o.id = p.order_id
        WHERE o.id = ?
    """, (order_id,))
    order = cursor.fetchone()
    conn.close()
    return order

def update_order_status(order_id, status):
    if status == 'Cancelled':
        cancel_order_and_rescue(order_id, reason="Status changed to Cancelled")
        return
        
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET order_status = ? WHERE id = ?", (status, order_id))
    
    # Synchronize delivery details status if transit or delivered
    if status == 'In Transit':
        cursor.execute("UPDATE delivery_details SET status = 'In Transit' WHERE order_id = ?", (order_id,))
    elif status == 'Delivered':
        cursor.execute("UPDATE delivery_details SET status = 'Delivered', completed_at = CURRENT_TIMESTAMP WHERE order_id = ?", (order_id,))
    
    conn.commit()
    conn.close()
    
    add_audit_log(f"Order #{order_id} status updated to {status}")

def get_user_orders(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT contact FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    contact = row['contact'] if row else None
    
    if contact:
        cursor.execute("""
            SELECT o.* FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.user_id = ? OR u.contact = ?
            ORDER BY o.id DESC
        """, (user_id, contact))
    else:
        cursor.execute("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", (user_id,))
        
    orders = cursor.fetchall()
    conn.close()
    return orders

def get_active_kitchen_orders():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT o.*, u.name as student_name, u.contact as student_contact
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.order_status NOT IN ('Delivered', 'Cancelled')
        ORDER BY o.id ASC
    """)
    orders = cursor.fetchall()
    conn.close()
    return orders

def get_orders_queue_position(order_id):
    # Counts active orders before the current one that are still 'Ordered' or 'Cooking'
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT order_status FROM orders WHERE id = ?", (order_id,))
    order = cursor.fetchone()
    if not order or order['order_status'] in ['Delivered', 'Cancelled', 'Ready', 'In Transit']:
        conn.close()
        return 0
        
    cursor.execute("SELECT COUNT(*) as count FROM orders WHERE id < ? AND order_status IN ('Ordered', 'Cooking')", (order_id,))
    count = cursor.fetchone()['count']
    conn.close()
    return count

# Delivery Helpers
def get_available_deliveries():
    conn = get_db()
    cursor = conn.cursor()
    # Ready orders with delivery type, but rider has not been assigned or is just assigned but not checked out
    cursor.execute("""
        SELECT o.id as order_id, o.total_amount, o.delivery_location, u.name as student_name, u.contact as student_contact, d.otp
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN delivery_details d ON o.id = d.order_id
        WHERE o.order_status = 'Ready' AND o.order_type = 'Delivery' AND d.rider_id IS NULL
    """)
    deliveries = cursor.fetchall()
    conn.close()
    return deliveries

def assign_delivery_rider(order_id, rider_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE delivery_details SET rider_id = ?, status = 'Assigned' WHERE order_id = ?", (rider_id, order_id))
    # Update main order status to show it is now with delivery agent
    cursor.execute("UPDATE orders SET order_status = 'In Transit' WHERE id = ?", (order_id,))
    cursor.execute("UPDATE delivery_details SET status = 'In Transit' WHERE order_id = ?", (order_id,))
    conn.commit()
    conn.close()

def verify_delivery_otp(order_id, entered_otp):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT otp FROM delivery_details WHERE order_id = ?", (order_id,))
    row = cursor.fetchone()
    if row and row['otp'] == entered_otp:
        cursor.execute("UPDATE delivery_details SET status = 'Delivered', completed_at = CURRENT_TIMESTAMP WHERE order_id = ?", (order_id,))
        cursor.execute("UPDATE orders SET order_status = 'Delivered' WHERE id = ?", (order_id,))
        conn.commit()
        conn.close()
        return True
    conn.close()
    return False

def get_rider_active_delivery(rider_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT o.id as order_id, o.total_amount, o.delivery_location, u.name as student_name, u.contact as student_contact, d.otp, d.status as delivery_status
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN delivery_details d ON o.id = d.order_id
        WHERE d.rider_id = ? AND d.status != 'Delivered'
    """, (rider_id,))
    delivery = cursor.fetchone()
    conn.close()
    return delivery

def get_rider_stats(rider_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM delivery_details WHERE rider_id = ? AND status = 'Delivered'", (rider_id,))
    count = cursor.fetchone()['count']
    earnings = count * 20.0 # Mock delivery charge/earning of Rs 20 per trip
    
    # Get delivery log
    cursor.execute("""
        SELECT o.id as order_id, o.total_amount, o.delivery_location, d.completed_at
        FROM orders o
        JOIN delivery_details d ON o.id = d.order_id
        WHERE d.rider_id = ? AND d.status = 'Delivered'
        ORDER BY d.completed_at DESC
    """, (rider_id,))
    log = cursor.fetchall()
    conn.close()
    return {"count": count, "earnings": earnings, "history": log}

# Food Rescue Helpers
def cancel_order_and_rescue(order_id, reason="Customer cancelled"):
    conn = get_db()
    cursor = conn.cursor()
    
    # Fetch order details to know the items
    cursor.execute("SELECT items_json, order_status, user_id FROM orders WHERE id = ?", (order_id,))
    order = cursor.fetchone()
    if not order or order['order_status'] in ['Delivered', 'Cancelled']:
        conn.close()
        return False, "Order already completed or cancelled"
        
    items = json.loads(order['items_json'])
    prev_status = order['order_status']
    
    # Mark order as Cancelled
    cursor.execute("UPDATE orders SET order_status = 'Cancelled' WHERE id = ?", (order_id,))
    
    # Automatically refund wallet if paid via Wallet
    cursor.execute("SELECT method, amount FROM payments WHERE order_id = ? AND status = 'Completed'", (order_id,))
    pay_row = cursor.fetchone()
    refund_log = None
    if pay_row and pay_row['method'] == 'Wallet':
        cursor.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?", (pay_row['amount'], order['user_id']))
        refund_log = f"Wallet balance ₹{pay_row['amount']} automatically refunded to User #{order['user_id']} for cancelled Order #{order_id}"

    # ONLY add to SDG-2 Food Rescue if the order was already accepted/started by kitchen
    added_to_rescue = False
    if prev_status in ['Cooking', 'Ready']:
        for item in items:
            # Check original price and valid menu item id from menu_items
            cursor.execute("SELECT id, price FROM menu_items WHERE id = ? OR name = ?", (item.get('id'), item.get('name')))
            menu_row = cursor.fetchone()
            menu_item_id = menu_row['id'] if menu_row else item.get('id')
            orig_price = menu_row['price'] if menu_row else float(item.get('price', 0))
            
            # 60% discount for rescued food (pays 40% of original price)
            disc_price = round(orig_price * 0.40, 2)
            qty = int(item.get('quantity', 1))
            
            cursor.execute(
                "INSERT INTO food_rescue (original_order_id, menu_item_id, original_price, discounted_price, quantity, status) VALUES (?, ?, ?, ?, ?, 'Available')",
                (order_id, menu_item_id, orig_price, disc_price, qty)
            )
        added_to_rescue = True
        
    conn.commit()
    conn.close()
    
    if refund_log:
        add_audit_log(refund_log)
    if added_to_rescue:
        add_audit_log(f"Order #{order_id} cancelled after acceptance ({prev_status}). Items added to SDG-2 Food Rescue pool at 60% discount.")
    else:
        add_audit_log(f"Order #{order_id} cancelled before kitchen acceptance ({prev_status}). Not sent to Food Rescue.")
    
    return True, None

def get_available_rescue_items():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, 
               COALESCE(m.name, 'Rescued Meal') as name, 
               COALESCE(m.image_url, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop') as image_url, 
               COALESCE(m.description, 'Fresh cancelled order from college canteen. 60% Off!') as description, 
               COALESCE(m.category, 'Meals') as category
        FROM food_rescue r
        LEFT JOIN menu_items m ON r.menu_item_id = m.id
        WHERE r.status = 'Available'
        ORDER BY r.id DESC
    """)
    items = cursor.fetchall()
    conn.close()
    return items

def purchase_rescue_item(user_id, rescue_id, payment_method="Wallet"):
    conn = get_db()
    cursor = conn.cursor()
    
    # Get rescue item details (using LEFT JOIN so it never fails if menu_item was updated)
    cursor.execute("""
        SELECT r.*, COALESCE(m.name, 'Rescued Meal') as name 
        FROM food_rescue r 
        LEFT JOIN menu_items m ON r.menu_item_id = m.id 
        WHERE r.id = ? AND r.status = 'Available'
    """, (rescue_id,))
    rescue = cursor.fetchone()
    if not rescue:
        conn.close()
        return False, "This rescued meal is no longer available or was already claimed."
        
    total_amount = float(rescue['discounted_price']) * int(rescue['quantity'])
    
    # Check user balance if Wallet
    if payment_method == "Wallet":
        cursor.execute("SELECT wallet_balance FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row or user_row['wallet_balance'] < total_amount:
            conn.close()
            return False, "Insufficient wallet balance. Please choose 'Cash at Counter' or Top up Wallet."
        # Deduct wallet
        cursor.execute("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?", (total_amount, user_id))
        
    initial_order_status = 'Ready'
    initial_pay_status = 'Completed' if payment_method != 'Cash on Delivery' and payment_method != 'Cash' else 'Pending'
    if payment_method in ['Cash', 'COD', 'Cash on Delivery']:
        payment_method = 'Cash on Delivery'

    # Mark rescue item as Sold immediately so it is removed from SDG-2 Food Rescue pool
    cursor.execute("UPDATE food_rescue SET status = 'Sold' WHERE id = ?", (rescue_id,))
    
    # Create a new order for this rescued food
    items_list = [{
        "id": rescue['menu_item_id'],
        "name": rescue['name'],
        "quantity": rescue['quantity'],
        "price": rescue['discounted_price'],
        "is_rescue": True
    }]
    items_json = json.dumps(items_list)
    cursor.execute(
        "INSERT INTO orders (user_id, items_json, total_amount, order_status, order_type) VALUES (?, ?, ?, ?, 'Pickup')",
        (user_id, items_json, total_amount, initial_order_status)
    )
    new_order_id = cursor.lastrowid
    
    # Record payment
    import uuid
    tx_id = f"TXN-{uuid.uuid4().hex[:8].upper()}"
    cursor.execute(
        "INSERT INTO payments (order_id, method, amount, status, transaction_id) VALUES (?, ?, ?, ?, ?)",
        (new_order_id, payment_method, total_amount, initial_pay_status, tx_id)
    )
    
    conn.commit()
    conn.close()
    
    add_audit_log(f"Rescued food from original Order #{rescue['original_order_id']} purchased as new Order #{new_order_id} (Status: {initial_order_status}, Method: {payment_method})")
    return True, new_order_id

# Payment Helpers
def record_payment(order_id, method, amount, status="Completed"):
    conn = get_db()
    cursor = conn.cursor()
    import uuid
    tx_id = f"TXN-{uuid.uuid4().hex[:8].upper()}"
    cursor.execute(
        "INSERT INTO payments (order_id, method, amount, status, transaction_id) VALUES (?, ?, ?, ?, ?)",
        (order_id, method, amount, status, tx_id)
    )
    conn.commit()
    conn.close()
    return tx_id

# Admin & SDG Analytics Helpers
def get_sdg_analytics():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Total Registered Students
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE role = 'Student'")
    students_count = cursor.fetchone()['count']
    
    # 2. Total Completed Orders
    cursor.execute("SELECT COUNT(*) as count FROM orders WHERE order_status = 'Delivered' OR (order_status = 'Ready' AND order_type = 'Pickup')")
    completed_orders = cursor.fetchone()['count']
    
    # 3. Total Revenue
    cursor.execute("SELECT SUM(total_amount) as total FROM orders WHERE order_status NOT IN ('Cancelled')")
    total_revenue_row = cursor.fetchone()
    total_revenue = total_revenue_row['total'] if total_revenue_row['total'] else 0.0
    
    # 4. Food Wastage Rescued (Plates saved & value recovered)
    cursor.execute("SELECT SUM(quantity) as plates, SUM(discounted_price * quantity) as recovered_val, SUM(original_price * quantity) as orig_val FROM food_rescue WHERE status = 'Sold'")
    rescue_row = cursor.fetchone()
    plates_saved = rescue_row['plates'] if rescue_row['plates'] else 0
    value_recovered = rescue_row['recovered_val'] if rescue_row['recovered_val'] else 0.0
    original_value = rescue_row['orig_val'] if rescue_row['orig_val'] else 0.0
    
    # 5. SDG 2 / SDG 8 Target Integration Analytics
    # Percentage of cancelled/surplus items saved
    cursor.execute("SELECT COUNT(*) as total FROM food_rescue")
    total_rescue_items = cursor.fetchone()['total']
    cursor.execute("SELECT COUNT(*) as sold FROM food_rescue WHERE status = 'Sold'")
    sold_rescue_items = cursor.fetchone()['sold']
    pct_saved = (sold_rescue_items / total_rescue_items * 100.0) if total_rescue_items > 0 else 0.0
    
    # Wastage Impact Index: 100 - (% of total food prepared that is wasted and not saved)
    # Let's mock a simple index: starts at 100, drops based on unsaved rescue items.
    cursor.execute("SELECT SUM(quantity) as wasted_plates FROM food_rescue WHERE status = 'Available' OR status = 'Expired'")
    wasted_plates_row = cursor.fetchone()
    wasted_plates = wasted_plates_row['wasted_plates'] if wasted_plates_row['wasted_plates'] else 0
    wastage_impact_index = max(0.0, round(100.0 - (wasted_plates * 2.5), 1))
    
    # 6. Best selling items
    # Parse orders JSONs
    cursor.execute("SELECT items_json FROM orders WHERE order_status NOT IN ('Cancelled')")
    all_orders = cursor.fetchall()
    item_sales = {}
    for row in all_orders:
        try:
            items = json.loads(row['items_json'])
            for it in items:
                name = it['name']
                qty = it['quantity']
                item_sales[name] = item_sales.get(name, 0) + qty
        except Exception:
            pass
    # Sort and take top 5
    best_sellers = sorted(item_sales.items(), key=lambda x: x[1], reverse=True)[:5]
    best_sellers_labels = [x[0] for x in best_sellers]
    best_sellers_data = [x[1] for x in best_sellers]
    
    # 7. Hourly ordering peak times (24h)
    cursor.execute("SELECT created_at FROM orders")
    order_times = cursor.fetchall()
    hourly_counts = [0] * 24
    for row in order_times:
        try:
            # sqlite default timestamp format: 'YYYY-MM-DD HH:MM:SS'
            dt = datetime.strptime(row['created_at'].split('.')[0], "%Y-%m-%d %H:%M:%S")
            hourly_counts[dt.hour] += 1
        except Exception:
            # fallback try parsing ISO format or skip
            try:
                dt = datetime.fromisoformat(row['created_at'].replace('Z', '+00:00'))
                hourly_counts[dt.hour] += 1
            except Exception:
                pass
    
    conn.close()
    
    return {
        "students_count": students_count,
        "completed_orders": completed_orders,
        "total_revenue": round(total_revenue, 2),
        "plates_saved": plates_saved,
        "value_recovered": round(value_recovered, 2),
        "original_value": round(original_value, 2),
        "pct_saved": round(pct_saved, 1),
        "wastage_impact_index": wastage_impact_index,
        "best_sellers_labels": best_sellers_labels,
        "best_sellers_data": best_sellers_data,
        "hourly_counts": hourly_counts
    }

def add_audit_log(action):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO audit_logs (action) VALUES (?)", (action,))
    conn.commit()
    conn.close()

def get_audit_logs(limit=50):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))
    logs = cursor.fetchall()
    conn.close()
    return logs

# Feedback Helpers
def add_feedback(order_id, rating, comments=""):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO feedback (order_id, rating, comments) VALUES (?, ?, ?)",
            (order_id, rating, comments)
        )
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    conn.close()
    return success

def get_feedback(order_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM feedback WHERE order_id = ?", (order_id,))
    row = cursor.fetchone()
    conn.close()
    return row
