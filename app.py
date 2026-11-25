import os
import json
import uuid
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename
import database

app = Flask(__name__)
app.secret_key = "smartcampus_secret_key_change_me_in_production"

# Directory for uploads
UPLOAD_FOLDER = os.path.join(app.root_path, "static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 # 5MB limit

# Initialize db at startup
database.init_db()

import socket
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

# Middleware/Decorators for Role-Based Access Control
def require_role(roles):
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def wrapper(*args, **kwargs):
            if 'user' not in session:
                return redirect(url_for('index', login_required=True))
            if session['user']['role'] not in roles:
                return "Unauthorized Access", 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

# Page Routes
@app.route('/')
def index():
    # Public ordering dashboard
    return render_template('index.html')

@app.route('/order-tracking/<int:order_id>')
def tracking(order_id):
    # Public/student page to view order progress
    order = database.get_order(order_id)
    if not order:
        return "Order not found", 404
    return render_template('tracking.html', order_id=order_id)

@app.route('/staff')
@require_role(['Staff', 'Admin'])
def staff_dashboard():
    return render_template('staff.html')

@app.route('/delivery')
@require_role(['Delivery', 'Admin'])
def delivery_dashboard():
    return render_template('delivery.html')

@app.route('/admin')
@require_role(['Admin'])
def admin_dashboard():
    return render_template('admin.html')

# API Auth Endpoints
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    user = database.get_user_by_email(email)
    if user and check_password_hash(user['password_hash'], password):
        session['user'] = {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
        return jsonify({
            "success": True,
            "user": {
                "id": user['id'],
                "name": user['name'],
                "role": user['role'],
                "email": user['email'],
                "wallet_balance": user['wallet_balance']
            }
        })
    return jsonify({"success": False, "message": "Invalid email or password"}), 401

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    contact = data.get('contact')
    
    if not name or not email or not password:
        return jsonify({"success": False, "message": "Missing required fields"}), 400
        
    role = data.get('role', 'Student')
    if role not in ['Student', 'Staff', 'Delivery', 'Admin']:
        role = 'Student'
    wallet = 500.0 if role == 'Student' else 0.0
    user_id = database.create_user(name, email, password, role=role, contact=contact, wallet_balance=wallet)
    if user_id:
        user = database.get_user_by_id(user_id)
        session['user'] = {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
        return jsonify({
            "success": True,
            "user": {
                "id": user['id'],
                "name": user['name'],
                "role": user['role'],
                "email": user['email'],
                "wallet_balance": user['wallet_balance']
            }
        })
    return jsonify({"success": False, "message": "Email already exists"}), 409

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('user', None)
    return jsonify({"success": True})

@app.route('/api/session', methods=['GET'])
def api_session():
    if 'user' in session:
        user = database.get_user_by_id(session['user']['id'])
        if user:
            return jsonify({
                "logged_in": True,
                "user": {
                    "id": user['id'],
                    "name": user['name'],
                    "role": user['role'],
                    "email": user['email'],
                    "wallet_balance": user['wallet_balance'],
                    "contact": user['contact']
                }
            })
    return jsonify({"logged_in": False})

# Student Wallet Topup
@app.route('/api/wallet/topup', methods=['POST'])
def api_wallet_topup():
    data = request.json
    amount = float(data.get('amount', 0))
    if amount <= 0:
        return jsonify({"success": False, "message": "Amount must be positive"}), 400
        
    if 'user' in session:
        user_id = session['user']['id']
    else:
        # Guest Topup
        name = data.get('student_name', 'Guest Student')
        contact = data.get('student_contact')
        if not contact:
            return jsonify({"success": False, "message": "Contact number required for guest top-up"}), 400
            
        email = f"guest_{contact}@smartcampus.com"
        user = database.get_user_by_email(email)
        if not user:
            user_id = database.create_user(name, email, "password_not_needed", "Student", contact, wallet_balance=0.0)
        else:
            user_id = user['id']
            
    success = database.update_wallet(user_id, amount)
    
    if success:
        # Record a payment log for the topup
        database.record_payment(None, method="UPI/Card", amount=amount, status="Completed")
        user = database.get_user_by_id(user_id)
        return jsonify({"success": True, "wallet_balance": user['wallet_balance']})
    return jsonify({"success": False, "message": "Failed to top up wallet"}), 500

@app.route('/api/wallet/balance', methods=['GET'])
def api_wallet_balance():
    contact = request.args.get('contact')
    if not contact:
        return jsonify({"success": False, "message": "Contact number required"}), 400
    email = f"guest_{contact}@smartcampus.com"
    user = database.get_user_by_email(email)
    if user:
        return jsonify({"success": True, "wallet_balance": user['wallet_balance']})
    return jsonify({"success": True, "wallet_balance": 500.00}) # starting guest balance

# Menu Endpoints
@app.route('/api/menu', methods=['GET'])
def api_menu():
    items = database.get_active_menu_items()
    # convert sqlite.Row to dict
    menu_list = []
    for item in items:
        menu_list.append({
            "id": item["id"],
            "name": item["name"],
            "category": item["category"],
            "price": item["price"],
            "stock_quantity": item["stock_quantity"],
            "image_url": item["image_url"],
            "description": item["description"],
            "status": item["status"]
        })
    return jsonify(menu_list)

@app.route('/api/menu/all', methods=['GET'])
@require_role(['Staff', 'Admin'])
def api_menu_all():
    items = database.get_all_menu_items()
    menu_list = []
    for item in items:
        menu_list.append({
            "id": item["id"],
            "name": item["name"],
            "category": item["category"],
            "price": item["price"],
            "stock_quantity": item["stock_quantity"],
            "image_url": item["image_url"],
            "description": item["description"],
            "status": item["status"]
        })
    return jsonify(menu_list)

# Order Placement & Tracking
@app.route('/api/cart/checkout', methods=['POST'])
def api_checkout():
    data = request.json
    items = data.get('items') # array of {id, name, quantity, price}
    total_amount = float(data.get('total_amount', 0))
    payment_method = data.get('payment_method') # 'Wallet', 'UPI', 'Card', 'COD'
    order_type = data.get('order_type', 'Pickup') # 'Pickup', 'Delivery'
    delivery_location = data.get('delivery_location')
    
    if not items or len(items) == 0:
        return jsonify({"success": False, "message": "Cart is empty"}), 400
        
    # Requirement 1: User MUST be logged in as a Student to place an order
    if 'user' not in session:
        return jsonify({
            "success": False, 
            "message": "Student Login Required: Please log in with your Student account to place an order.",
            "login_required": True
        }), 401

    if session['user']['role'] not in ['Student', 'Admin']:
        return jsonify({
            "success": False, 
            "message": "Only students are authorized to place food orders."
        }), 403

    user_id = session['user']['id']
    user = database.get_user_by_id(user_id)
    if not user:
        return jsonify({"success": False, "message": "User account not found"}), 404

    initial_status = 'Ordered'
    pay_status = 'Completed'
    
    # Requirement 5: Cash on Delivery (COD) / Pay on Delivery support
    if payment_method == 'UPI':
        initial_status = 'Pending Payment'
        pay_status = 'Pending'
    elif payment_method in ['COD', 'Cash']:
        initial_status = 'Ordered'
        pay_status = 'Pending (Cash on Delivery)'
        payment_method = 'Cash on Delivery'
    elif payment_method == 'Wallet':
        if user['wallet_balance'] < total_amount:
            return jsonify({"success": False, "message": "Insufficient wallet balance"}), 400
        # Deduct balance
        database.update_wallet(user_id, -total_amount)
        
    # Place order
    order_id, err = database.create_order(user_id, items, total_amount, order_type, delivery_location, initial_status=initial_status)
    if err:
        # Refund wallet if wallet payment failed during stock check
        if payment_method == 'Wallet':
            database.update_wallet(user_id, total_amount)
        return jsonify({"success": False, "message": err}), 400
        
    # Record transaction
    database.record_payment(order_id, payment_method, total_amount, status=pay_status)
    
    return jsonify({
        "success": True, 
        "order_id": order_id, 
        "local_ip": get_local_ip()
    })

@app.route('/api/order/<int:order_id>', methods=['GET'])
def api_get_order(order_id):
    order = database.get_order(order_id)
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404
        
    # convert sqlite.Row to dict
    order_dict = dict(order)
    order_dict['items'] = json.loads(order['items_json'])
    order_dict.pop('items_json', None)
    
    # Add live queue position
    order_dict['queue_position'] = database.get_orders_queue_position(order_id)
    
    return jsonify(order_dict)

@app.route('/api/order/history', methods=['GET'])
def api_order_history():
    if 'user' not in session:
        return jsonify({"success": False, "message": "Authentication required"}), 401
    orders = database.get_user_orders(session['user']['id'])
    history = []
    for order in orders:
        ord_dict = dict(order)
        ord_dict['items'] = json.loads(order['items_json'])
        ord_dict.pop('items_json', None)
        history.append(ord_dict)
    return jsonify(history)

@app.route('/mobile-upi-pay/<int:order_id>')
def mobile_upi_pay(order_id):
    order = database.get_order(order_id)
    if not order:
        return "Order not found", 404
    # convert order (sqlite.Row) to dict
    order_dict = dict(order)
    return render_template('mobile_upi_pay.html', order_id=order_id, order=order_dict)

@app.route('/api/order/<int:order_id>/complete-mobile-payment', methods=['POST'])
def api_complete_mobile_payment(order_id):
    order = database.get_order(order_id)
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404
        
    data = request.get_json(silent=True) or {}
    name = data.get('name')
    contact = data.get('contact')
    
    if not name or not contact:
        return jsonify({"success": False, "message": "Name and Contact Number are required"}), 400
        
    # Get or create guest user
    email = f"guest_{contact}@smartcampus.com"
    user = database.get_user_by_email(email)
    if not user:
        user_id = database.create_user(name, email, "password_not_needed", "Student", contact, wallet_balance=500.00)
    else:
        user_id = user['id']
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
        conn.commit()
        conn.close()
        
    # Check if order is a food rescue purchase
    items = json.loads(order['items_json'])
    is_rescue_order = any(item.get('is_rescue') is True for item in items)
    
    new_order_status = 'Ready' if is_rescue_order else 'Ordered'
    
    # Update order: re-associate with the user_id, set status to Ordered or Ready
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET user_id = ?, order_status = ? WHERE id = ?", (user_id, new_order_status, order_id))
    
    # If the rescue item status is 'Pending Payment', mark it 'Sold'
    if is_rescue_order:
        cursor.execute("UPDATE food_rescue SET status = 'Sold' WHERE original_order_id = ? OR menu_item_id = ?", (order_id, items[0]['id']))
        
    # Complete payment status
    cursor.execute("UPDATE payments SET status = 'Completed' WHERE order_id = ?", (order_id,))
    
    conn.commit()
    conn.close()
    
    database.add_audit_log(f"Payment completed for Order #{order_id} via Real Mobile UPI Scan (Status updated to {new_order_status})")
    
    return jsonify({"success": True})

@app.route('/api/order/<int:order_id>/feedback', methods=['POST'])
def api_order_feedback_post(order_id):
    data = request.json
    rating = data.get('rating')
    comments = data.get('comments', '')
    
    if not rating or not (1 <= int(rating) <= 5):
        return jsonify({"success": False, "message": "Invalid rating score. Choose 1 to 5"}), 400
        
    success = database.add_feedback(order_id, int(rating), comments)
    if success:
        database.add_audit_log(f"Feedback submitted for Order #{order_id} (Rating: {rating} stars)")
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Feedback already submitted for this order"}), 409

@app.route('/api/order/<int:order_id>/feedback', methods=['GET'])
def api_order_feedback_get(order_id):
    fb = database.get_feedback(order_id)
    if fb:
        return jsonify({"success": True, "feedback": dict(fb)})
    return jsonify({"success": True, "feedback": None})

@app.route('/api/admin/audit-logs', methods=['GET'])
@require_role(['Admin'])
def api_admin_audit_logs():
    logs = database.get_audit_logs(limit=50)
    log_list = []
    for log in logs:
        log_list.append(dict(log))
    return jsonify(log_list)



@app.route('/api/order/<int:order_id>/cancel', methods=['POST'])
def api_cancel_order(order_id):
    # Retrieve order status first
    order = database.get_order(order_id)
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404
        
    data = request.get_json(silent=True) or {}
    contact = data.get('contact')
    
    # Role checks: Students can cancel if status is 'Ordered', 'Cooking', or 'Ready'. Staff/Admin can cancel anytime
    is_authorized = False
    if 'user' in session:
        user_role = session['user']['role']
        if user_role in ['Staff', 'Admin']:
            is_authorized = True
        elif user_role == 'Student' and order['user_id'] == session['user']['id']:
            if order['order_status'] in ['Ordered', 'Cooking', 'Ready']:
                is_authorized = True
            else:
                return jsonify({"success": False, "message": "Cannot cancel order at this stage"}), 400
    else:
        # Check guest match by contact number
        order_user = database.get_user_by_id(order['user_id'])
        if order_user and contact and order_user['contact'] == contact:
            if order['order_status'] in ['Ordered', 'Cooking', 'Ready']:
                is_authorized = True
            else:
                return jsonify({"success": False, "message": "Cannot cancel order at this stage"}), 400
                
    if not is_authorized:
        return jsonify({"success": False, "message": "Unauthorized"}), 403
        
    prev_status = order['order_status']
    # Trigger cancellation & food rescue logic (wallet refund handled automatically inside cancel_order_and_rescue)
    success, err = database.cancel_order_and_rescue(order_id, reason="Cancelled by User/Admin")
    if not success:
        return jsonify({"success": False, "message": err}), 400
        
    if prev_status in ['Cooking', 'Ready']:
        msg = "Order cancelled. As food was accepted by kitchen, it is now listed in SDG-2 Food Rescue with 60% offer for everyone to rescue!"
    else:
        msg = "Order cancelled successfully. Not sent to Food Rescue as kitchen had not yet accepted/prepared it."
        
    return jsonify({"success": True, "message": msg})

# Kitchen Staff Endpoints
@app.route('/api/staff/orders', methods=['GET'])
@require_role(['Staff', 'Admin'])
def api_staff_orders():
    orders = database.get_active_kitchen_orders()
    orders_list = []
    for order in orders:
        ord_dict = dict(order)
        ord_dict['items'] = json.loads(order['items_json'])
        ord_dict.pop('items_json', None)
        orders_list.append(ord_dict)
    return jsonify(orders_list)

@app.route('/api/staff/order/<int:order_id>/status', methods=['POST'])
@require_role(['Staff', 'Admin'])
def api_update_order_status(order_id):
    data = request.json
    status = data.get('status') # 'Cooking', 'Ready', 'In Transit', 'Delivered', 'Cancelled'
    if status not in ['Cooking', 'Ready', 'In Transit', 'Delivered', 'Cancelled']:
        return jsonify({"success": False, "message": "Invalid status"}), 400
        
    database.update_order_status(order_id, status)
    return jsonify({"success": True})

@app.route('/api/staff/menu/update', methods=['POST'])
@require_role(['Staff', 'Admin'])
def api_staff_menu_update():
    data = request.json
    item_id = data.get('id')
    price = float(data.get('price'))
    stock = int(data.get('stock_quantity'))
    status = data.get('status')
    
    # Retrieve current menu item
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu_items WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({"success": False, "message": "Item not found"}), 404
        
    database.update_menu_item(
        item_id=item_id,
        name=item['name'],
        category=item['category'],
        price=price,
        stock_quantity=stock,
        status=status,
        image_url=item['image_url'],
        description=item['description']
    )
    conn.close()
    return jsonify({"success": True})

# Delivery Agent Endpoints
@app.route('/api/delivery/available', methods=['GET'])
@require_role(['Delivery', 'Admin'])
def api_delivery_available():
    deliveries = database.get_available_deliveries()
    dev_list = []
    for dev in deliveries:
        dev_list.append(dict(dev))
    return jsonify(dev_list)

@app.route('/api/delivery/assign', methods=['POST'])
@require_role(['Delivery', 'Admin'])
def api_assign_delivery():
    data = request.json
    order_id = data.get('order_id')
    rider_id = session['user']['id']
    
    # Check if rider already has an active delivery
    active = database.get_rider_active_delivery(rider_id)
    if active:
        return jsonify({"success": False, "message": "You already have an active delivery run"}), 400
        
    database.assign_delivery_rider(order_id, rider_id)
    return jsonify({"success": True})

@app.route('/api/delivery/active', methods=['GET'])
@require_role(['Delivery', 'Admin'])
def api_get_active_delivery():
    rider_id = session['user']['id']
    active = database.get_rider_active_delivery(rider_id)
    if active:
        return jsonify({"success": True, "delivery": dict(active)})
    return jsonify({"success": True, "delivery": None})

@app.route('/api/delivery/verify', methods=['POST'])
@require_role(['Delivery', 'Admin'])
def api_verify_delivery_otp():
    data = request.json
    order_id = data.get('order_id')
    otp = data.get('otp')
    
    verified = database.verify_delivery_otp(order_id, otp)
    if verified:
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Invalid OTP. Please check with student."})

@app.route('/api/admin/staff-list', methods=['GET'])
def api_admin_staff_list():
    users = database.get_all_users_by_role('Staff')
    return jsonify([dict(u) for u in users])

@app.route('/api/admin/rider-list', methods=['GET'])
def api_admin_rider_list():
    users = database.get_all_users_by_role('Delivery')
    return jsonify([dict(u) for u in users])

@app.route('/api/delivery/stats', methods=['GET'])
@require_role(['Delivery', 'Admin'])
def api_delivery_stats():
    rider_id = session['user']['id']
    stats = database.get_rider_stats(rider_id)
    # Convert sqlite rows to dict
    history = [dict(row) for row in stats['history']]
    return jsonify({
        "count": stats['count'],
        "earnings": stats['earnings'],
        "history": history
    })

# Food Rescue Endpoints
@app.route('/api/food-rescue', methods=['GET'])
def api_get_rescue_items():
    items = database.get_available_rescue_items()
    res_list = []
    for item in items:
        res_list.append(dict(item))
    return jsonify(res_list)

@app.route('/api/food-rescue/buy', methods=['POST'])
def api_buy_rescue_item():
    data = request.json or {}
    rescue_id = data.get('rescue_id')
    payment_method = data.get('payment_method', 'Cash on Delivery')
    
    if 'user' not in session:
        return jsonify({
            "success": False, 
            "message": "Student Login Required: Please log in with your Student account to rescue food.",
            "login_required": True
        }), 401

    if session['user']['role'] not in ['Student', 'Admin']:
        return jsonify({
            "success": False, 
            "message": "Only students are authorized to claim rescued meals."
        }), 403

    user_id = session['user']['id']
    success, result = database.purchase_rescue_item(user_id, rescue_id, payment_method)
    if success:
        return jsonify({
            "success": True,
            "order_id": result,
            "message": "Rescued food claimed successfully! Please collect your order from the counter.",
            "local_ip": get_local_ip()
        })
    return jsonify({"success": False, "message": str(result)}), 400

# Admin Dashboard Endpoints
@app.route('/api/admin/analytics', methods=['GET'])
@require_role(['Admin'])
def api_admin_analytics():
    stats = database.get_sdg_analytics()
    return jsonify(stats)

@app.route('/api/admin/users', methods=['GET'])
@require_role(['Admin'])
def api_admin_users():
    staff_users = database.get_all_users_by_role("Staff")
    delivery_users = database.get_all_users_by_role("Delivery")
    student_users = database.get_all_users_by_role("Student")
    
    return jsonify({
        "staff": [dict(u) for u in staff_users],
        "delivery": [dict(u) for u in delivery_users],
        "students": [dict(u) for u in student_users]
    })

@app.route('/api/admin/users/create', methods=['POST'])
@require_role(['Admin'])
def api_admin_create_user():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role')
    contact = data.get('contact')
    
    if role not in ['Staff', 'Delivery']:
        return jsonify({"success": False, "message": "Invalid role"}), 400
        
    user_id = database.create_user(name, email, password, role, contact)
    if user_id:
        return jsonify({"success": True, "user_id": user_id})
    return jsonify({"success": False, "message": "Email already exists"}), 409

@app.route('/api/admin/users/delete/<int:user_id>', methods=['POST'])
@require_role(['Admin'])
def api_admin_delete_user(user_id):
    # Avoid self-deletion
    if user_id == session['user']['id']:
        return jsonify({"success": False, "message": "Cannot delete yourself"}), 400
    database.delete_user(user_id)
    return jsonify({"success": True})

@app.route('/api/admin/menu/add', methods=['POST'])
@require_role(['Admin'])
def api_admin_add_menu():
    # Handle image upload or manual image URL
    if request.is_json:
        data = request.json
        name = data.get('name')
        category = data.get('category')
        price = float(data.get('price', 0))
        stock = int(data.get('stock_quantity', 0))
        description = data.get('description', '')
        image_url = data.get('image_url')
    else:
        name = request.form.get('name')
        category = request.form.get('category')
        try:
            price = float(request.form.get('price', 0))
        except (ValueError, TypeError):
            price = 0.0
        try:
            stock = int(request.form.get('stock', 0))
        except (ValueError, TypeError):
            stock = 0
            
        description = request.form.get('description', '')
        
        image_url = None
        if 'image_file' in request.files and request.files['image_file'].filename != '':
            file = request.files['image_file']
            filename = secure_filename(f"{uuid.uuid4().hex}_{file.filename}")
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            image_url = f"/static/uploads/{filename}"
        else:
            image_url = request.form.get('image_url')
            
    if not image_url or image_url.strip() == '':
        # standard placeholder
        image_url = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop"
        
    if not name or not category or price <= 0:
        return jsonify({"success": False, "message": "Invalid name, category, or price"}), 400
        
    item_id = database.add_menu_item(name, category, price, stock, "Active", image_url, description)
    if item_id:
        return jsonify({"success": True, "item_id": item_id})
    return jsonify({"success": False, "message": "Failed to add menu item"}), 500

@app.route('/api/admin/menu/delete/<int:item_id>', methods=['POST'])
@require_role(['Admin'])
def api_admin_delete_menu_item(item_id):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT status, name FROM menu_items WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({"success": False, "message": "Item not found"}), 404
        
    new_status = 'Inactive' if item['status'] == 'Active' else 'Active'
    cursor.execute("UPDATE menu_items SET status = ? WHERE id = ?", (new_status, item_id))
    conn.commit()
    conn.close()
    
    database.add_audit_log(f"Menu Item '{item['name']}' (ID: {item_id}) status toggled to {new_status}")
    return jsonify({"success": True, "new_status": new_status})

@app.route('/api/admin/menu/remove/<int:item_id>', methods=['POST'])
@require_role(['Admin'])
def api_admin_remove_menu_item(item_id):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM menu_items WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({"success": False, "message": "Item not found"}), 404
        
    cursor.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    
    database.add_audit_log(f"Menu Item '{item['name']}' (ID: {item_id}) permanently removed from database.")
    return jsonify({"success": True})

@app.route('/api/admin/menu/edit/<int:item_id>', methods=['POST'])
@require_role(['Admin'])
def api_admin_edit_menu(item_id):
    # Handle JSON or multipart form
    if request.is_json:
        data = request.json
        name = data.get('name')
        category = data.get('category')
        price = float(data.get('price', 0))
        stock = int(data.get('stock_quantity', 0))
        status = data.get('status', 'Active')
        description = data.get('description', '')
        image_url = data.get('image_url')
    else:
        name = request.form.get('name')
        category = request.form.get('category')
        try:
            price = float(request.form.get('price', 0))
        except (ValueError, TypeError):
            price = 0.0
        try:
            stock = int(request.form.get('stock_quantity', 0))
        except (ValueError, TypeError):
            stock = 0
            
        status = request.form.get('status', 'Active')
        description = request.form.get('description', '')
        
        image_url = None
        if 'image_file' in request.files and request.files['image_file'].filename != '':
            file = request.files['image_file']
            filename = secure_filename(f"{uuid.uuid4().hex}_{file.filename}")
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            image_url = f"/static/uploads/{filename}"
        else:
            image_url = request.form.get('image_url')

    if not name or not category or price <= 0:
        return jsonify({"success": False, "message": "Invalid name, category, or price"}), 400

    database.update_menu_item(
        item_id=item_id,
        name=name,
        category=category,
        price=price,
        stock_quantity=stock,
        status=status,
        image_url=image_url,
        description=description
    )
    return jsonify({"success": True, "message": f"Menu Item '{name}' updated successfully."})

@app.route('/api/admin/order/<int:order_id>/override', methods=['POST'])
@require_role(['Admin'])
def api_admin_override_order(order_id):
    data = request.json
    status = data.get('status')
    database.update_order_status(order_id, status)
    return jsonify({"success": True})

@app.after_request
def add_cors_and_network_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response

if __name__ == '__main__':
    local_ip = get_local_ip()
    print("=" * 65)
    print("       SMARTCAMPUS CANTEEN PLATFORM SERVER STARTED")
    print(f" • Localhost URL      : http://127.0.0.1:5000")
    print(f" • Network URL (LAN)  : http://{local_ip}:5000")
    print(" • Access from Any System / Mobile on Campus Network Supported!")
    print("=" * 65)
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
