let activeOrders = [];
let inventoryItems = [];
let orderTimesCache = {};

async function loadKitchenOrders() {
    try {
        const res = await fetch('/api/staff/orders');
        activeOrders = await res.json();
        
        const container = document.getElementById('kitchen-queue-container');
        const emptyDiv = document.getElementById('queue-empty');
        const countBadge = document.getElementById('queue-count');

        countBadge.innerText = `${activeOrders.length} Active Orders`;

        if (activeOrders.length === 0) {
            emptyDiv.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        emptyDiv.style.display = 'none';
        container.innerHTML = '';

        activeOrders.forEach(order => {
            const itemsStr = order.items.map(it => `<strong class="text-dark">${it.name}</strong> x${it.quantity}`).join('<br>');
            const isDelivery = order.order_type === 'Delivery';
            const createdTime = order.created_at.split(' ')[1] || order.created_at;

            if (!orderTimesCache[order.id]) {
                orderTimesCache[order.id] = {
                    cookTime: Math.floor(Math.random() * 6) + 5, // 5-10 min
                    deliveryTime: Math.floor(Math.random() * 9) + 2 // 2-10 min
                };
            }
            const times = orderTimesCache[order.id];

            let timeInfoHtml = '';
            if (order.order_status === 'Cooking') {
                timeInfoHtml = `<div class="small text-warning fw-bold mb-2"><i class="fa-solid fa-fire-burner me-1"></i> Cooking Est: ${times.cookTime} mins</div>`;
            } else if (order.order_status === 'Ready' && isDelivery) {
                timeInfoHtml = `<div class="small text-info fw-bold mb-2"><i class="fa-solid fa-clock me-1"></i> Delivery Est: ${times.deliveryTime} mins</div>`;
            }

            // Action buttons based on status
            let actionBtn = '';
            let statusBadge = '';
            
            if (order.order_status === 'Ordered') {
                statusBadge = `<span class="badge bg-info">Ordered</span>`;
                actionBtn = `
                    <button class="btn btn-warning btn-sm" onclick="updateOrderStatus(${order.id}, 'Cooking')">
                        <i class="fa-solid fa-play me-1"></i> Accept & Cook
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="cancelOrderStaff(${order.id})">
                        <i class="fa-solid fa-xmark me-1"></i> Reject / Cancel
                    </button>
                `;
            } else if (order.order_status === 'Cooking') {
                statusBadge = `<span class="badge bg-warning text-dark">Cooking</span>`;
                actionBtn = `
                    <button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${order.id}, 'Ready')">
                        <i class="fa-solid fa-circle-check me-1"></i> Mark Ready
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="cancelAndRescue(${order.id})">
                        <i class="fa-solid fa-trash-can me-1"></i> Cancel & Rescue (60% Off)
                    </button>
                `;
            } else if (order.order_status === 'Ready') {
                statusBadge = `<span class="badge bg-success">Ready</span>`;
                if (isDelivery) {
                    actionBtn = `<span class="text-muted small"><i class="fa-solid fa-truck-pickup me-1"></i> Awaiting Rider pickup</span>`;
                } else {
                    actionBtn = `
                        <button class="btn btn-success btn-sm" onclick="updateOrderStatus(${order.id}, 'Delivered')">
                            <i class="fa-solid fa-hand-holding-hand me-1"></i> Complete Pickup
                        </button>
                    `;
                }
            } else if (order.order_status === 'In Transit') {
                statusBadge = `<span class="badge bg-primary">In Transit</span>`;
                actionBtn = `<span class="text-muted small"><i class="fa-solid fa-person-running me-1"></i> Rider delivering...</span>`;
            }

            container.innerHTML += `
                <div class="card border rounded-3 p-3 shadow-sm bg-white">
                    <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div>
                            <span class="badge bg-light text-dark border me-1">Order #${order.id}</span>
                            ${isDelivery ? `<span class="badge bg-primary"><i class="fa-solid fa-truck me-1"></i> Delivery</span>` : `<span class="badge bg-secondary"><i class="fa-solid fa-store me-1"></i> Pickup</span>`}
                            ${statusBadge}
                        </div>
                        <span class="text-muted small">${createdTime}</span>
                    </div>
                    <div class="my-2 bg-light p-2 rounded text-secondary small">
                        ${itemsStr}
                    </div>
                    ${timeInfoHtml}
                    ${isDelivery && order.delivery_location ? `<div class="small text-muted mb-2"><i class="fa-solid fa-location-dot me-1"></i> <strong>Dest:</strong> ${order.delivery_location}</div>` : ''}
                    <div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                        <span class="fw-bold text-dark">₹${order.total_amount.toFixed(2)}</span>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-secondary btn-sm" onclick="printKOT(${order.id})">
                                <i class="fa-solid fa-receipt me-1"></i> KOT
                            </button>
                            ${actionBtn}
                        </div>
                    </div>
                </div>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        const res = await fetch(`/api/staff/order/${orderId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            loadKitchenOrders();
            loadRescueStats();
        }
    } catch (err) {
        console.error(err);
    }
}

async function cancelAndRescue(orderId) {
    if (confirm("Cancel this accepted order and add its prepared items into the SDG-2 'Food Rescue' pool at 60% discount? This avoids physical food waste.")) {
        try {
            const res = await fetch(`/api/order/${orderId}/cancel`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || "Order cancelled. Items added to Food Rescue pool at 60% OFF!");
                loadKitchenOrders();
                loadRescueStats();
            } else {
                alert(data.message || "Error cancelling order");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

async function cancelOrderStaff(orderId) {
    if (confirm("Reject / Cancel this order before kitchen acceptance? (Items will NOT be added to Food Rescue since cooking has not started).")) {
        try {
            const res = await fetch(`/api/order/${orderId}/cancel`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || "Order cancelled successfully.");
                loadKitchenOrders();
                loadRescueStats();
            } else {
                alert(data.message || "Error cancelling order");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

async function loadInventory() {
    try {
        const res = await fetch('/api/menu/all');
        inventoryItems = await res.json();
        renderInventory();
    } catch (err) {
        console.error(err);
    }
}

function renderInventory() {
    const container = document.getElementById('inventory-list');
    container.innerHTML = '';

    inventoryItems.forEach(item => {
        const lowStock = item.stock_quantity < 5;
        const borderClass = lowStock && item.status === 'Active' ? 'border-danger' : '';

        container.innerHTML += `
            <div class="border rounded-3 p-3 bg-white ${borderClass}" id="inv-item-${item.id}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="fw-bold mb-0">${item.name}</h6>
                    <span class="badge ${item.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${item.status}</span>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="small text-muted mb-1">Price (₹)</label>
                        <input type="number" class="form-control form-control-sm price-input" data-id="${item.id}" value="${item.price.toFixed(2)}" step="0.5">
                    </div>
                    <div class="col-6">
                        <label class="small text-muted mb-1">Stock Qty</label>
                        <input type="number" class="form-control form-control-sm stock-input" data-id="${item.id}" value="${item.stock_quantity}">
                        ${lowStock && item.status === 'Active' ? `<small class="text-danger fw-bold block mt-1"><i class="fa-solid fa-triangle-exclamation me-1"></i> Low Stock!</small>` : ''}
                    </div>
                </div>
                <div class="d-flex justify-content-between gap-2">
                    <div class="btn-group btn-group-sm w-50" role="group">
                        <input type="radio" class="btn-check" name="status-${item.id}" id="status-active-${item.id}" value="Active" ${item.status === 'Active' ? 'checked' : ''} onchange="toggleItemStatus(${item.id}, 'Active')">
                        <label class="btn btn-outline-success" for="status-active-${item.id}">Active</label>

                        <input type="radio" class="btn-check" name="status-${item.id}" id="status-inactive-${item.id}" value="Inactive" ${item.status === 'Inactive' ? 'checked' : ''} onchange="toggleItemStatus(${item.id}, 'Inactive')">
                        <label class="btn btn-outline-secondary" for="status-inactive-${item.id}">Hide</label>
                    </div>
                    <button class="btn btn-primary btn-sm w-50" onclick="saveInventoryChange(${item.id})">
                        <i class="fa-solid fa-save me-1"></i> Save Changes
                    </button>
                </div>
            </div>
        `;
    });
}

function filterInventory() {
    const query = document.getElementById('inventory-search').value.toLowerCase();
    document.querySelectorAll('[id^="inv-item-"]').forEach(el => {
        const text = el.innerText.toLowerCase();
        if (text.includes(query)) {
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    });
}

async function toggleItemStatus(itemId, newStatus) {
    const item = inventoryItems.find(it => it.id === itemId);
    if (item) {
        item.status = newStatus;
    }
}

async function saveInventoryChange(itemId) {
    const borderDiv = document.getElementById(`inv-item-${itemId}`);
    const price = parseFloat(borderDiv.querySelector('.price-input').value);
    const stock = parseInt(borderDiv.querySelector('.stock-input').value);
    const status = borderDiv.querySelector(`input[name="status-${itemId}"]:checked`).value;

    try {
        const res = await fetch('/api/staff/menu/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: itemId,
                price,
                stock_quantity: stock,
                status
            })
        });
        if (res.ok) {
            alert("Inventory changes saved successfully!");
            loadInventory();
        } else {
            alert("Failed to save changes.");
        }
    } catch (err) {
        console.error(err);
    }
}

// Load Food Rescue impact metrics
async function loadRescueStats() {
    try {
        const res = await fetch('/api/admin/analytics');
        const data = await res.json();
        document.getElementById('stat-rescued-plates').innerText = data.plates_saved;
        document.getElementById('stat-recovered-loss').innerText = `₹${data.value_recovered.toFixed(2)}`;
    } catch (err) {
        console.error(err);
    }
}

// Print Kitchen Order Token (KOT)
function printKOT(orderId) {
    const order = activeOrders.find(o => o.id === orderId);
    if (!order) return;

    const container = document.getElementById('kot-receipt-body');
    const itemsList = order.items.map(it => `
        <tr>
            <td style="padding: 5px 0;">${it.name}</td>
            <td style="text-align: right; padding: 5px 0;">x${it.quantity}</td>
        </tr>
    `).join('');

    const isDelivery = order.order_type === 'Delivery';

    container.innerHTML = `
        <div style="text-align: center; border-bottom: 1px dashed #333; padding-bottom: 10px;">
            <h5 style="font-weight: bold; margin: 0;">SMARTCAMPUS CANTEEN</h5>
            <small>Kitchen Order Token (KOT)</small>
        </div>
        <div style="padding: 10px 0; border-bottom: 1px dashed #333; font-size: 0.9rem;">
            <strong>Token:</strong> #${order.id}<br>
            <strong>Time:</strong> ${order.created_at}<br>
            <strong>Type:</strong> ${isDelivery ? 'DELIVERY' : 'SELF-PICKUP'}<br>
            <strong>Student:</strong> ${order.student_name} (${order.student_contact})
        </div>
        <table style="width: 100%; font-size: 0.9rem; margin: 10px 0;">
            <thead>
                <tr style="border-bottom: 1px dashed #ccc;">
                    <th style="text-align: left; padding-bottom: 5px;">Item</th>
                    <th style="text-align: right; padding-bottom: 5px;">Qty</th>
                </tr>
            </thead>
            <tbody>
                ${itemsList}
            </tbody>
        </table>
        <div style="text-align: center; border-top: 1px dashed #333; padding-top: 10px; font-size: 0.8rem;">
            <p>Ensure hygiene standards.<br>Serve Hot & Fresh!</p>
        </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('kotModal')).show();
}

let selectedOperatorName = '';

async function initOperator() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        
        if (data.logged_in) {
            const user = data.user;
            if (user.role === 'Admin') {
                // Admin is logged in. Show staff list dropdown.
                document.getElementById('admin-operator-select-div').style.display = 'block';
                
                const staffRes = await fetch('/api/admin/staff-list');
                const staffList = await staffRes.json();
                
                const selectEl = document.getElementById('operator-select');
                selectEl.innerHTML = '';
                
                if (staffList.length === 0) {
                    selectEl.innerHTML = `<option value="No Staff Registered">No Staff Registered</option>`;
                    selectedOperatorName = "No Staff Registered";
                } else {
                    staffList.forEach((worker, idx) => {
                        const opt = document.createElement('option');
                        opt.value = worker.name;
                        opt.textContent = worker.name;
                        if (idx === 0) opt.selected = true;
                        selectEl.appendChild(opt);
                    });
                    const cached = localStorage.getItem('active_staff_name');
                    if (cached && staffList.some(w => w.name === cached)) {
                        selectEl.value = cached;
                        selectedOperatorName = cached;
                    } else {
                        selectedOperatorName = staffList[0].name;
                    }
                }
            } else {
                // Kitchen Staff is logged in.
                selectedOperatorName = user.name;
                document.getElementById('admin-operator-select-div').style.display = 'none';
            }
        } else {
            selectedOperatorName = "Guest Staff Operator";
        }
        document.getElementById('active-operator-name').innerText = selectedOperatorName;
    } catch(err) {
        console.error(err);
    }
}

function changeActiveOperator(val) {
    selectedOperatorName = val;
    localStorage.setItem('active_staff_name', val);
    document.getElementById('active-operator-name').innerText = val;
}

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    initOperator();
    loadKitchenOrders();
    loadInventory();
    loadRescueStats();

    // Auto Poll kitchen orders queue
    setInterval(loadKitchenOrders, 3000);
    // Refresh inventory every 10 seconds
    setInterval(loadInventory, 10000);
});
