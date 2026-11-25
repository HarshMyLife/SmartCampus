let bestSellersChart = null;
let peaksChart = null;

async function loadAdminDashboard() {
    try {
        // Fetch stats
        const statsRes = await fetch('/api/admin/analytics');
        const stats = await statsRes.json();

        // Set counters
        document.getElementById('stat-students').innerText = stats.students_count;
        document.getElementById('stat-orders').innerText = stats.completed_orders;
        document.getElementById('stat-rescued-plates').innerText = stats.plates_saved;
        document.getElementById('stat-recovered-loss').innerText = `₹${stats.value_recovered.toFixed(2)}`;

        // Set SDG target fields
        document.getElementById('sdg-pct-saved').innerText = stats.pct_saved;
        document.getElementById('sdg-total-recovered').innerText = `₹${stats.value_recovered.toFixed(2)}`;
        document.getElementById('sdg-impact-index').innerText = stats.wastage_impact_index;

        // Load Charts
        renderCharts(stats);

        // Load Menu and Orders
        loadMenuManager();
        loadGlobalOrders();
        loadAuditLogs();

    } catch (err) {
        console.error(err);
    }
}

function renderCharts(stats) {
    // Destroy existing if any
    if (bestSellersChart) bestSellersChart.destroy();
    if (peaksChart) peaksChart.destroy();

    // 1. Best Sellers Bar Chart
    const ctxBar = document.getElementById('bestsellers-chart').getContext('2d');
    bestSellersChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: stats.best_sellers_labels.length > 0 ? stats.best_sellers_labels : ['No orders yet'],
            datasets: [{
                label: 'Plates Sold',
                data: stats.best_sellers_data.length > 0 ? stats.best_sellers_data : [0],
                backgroundColor: 'rgba(42, 82, 152, 0.7)',
                borderColor: 'rgba(42, 82, 152, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // 2. Hourly Peaks Line Chart
    const ctxLine = document.getElementById('peaks-chart').getContext('2d');
    const peakLabels = Array.from({length: 24}, (_, i) => `${i}:00`);
    peaksChart = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: peakLabels,
            datasets: [{
                label: 'Orders Count',
                data: stats.hourly_counts,
                backgroundColor: 'rgba(221, 166, 58, 0.2)',
                borderColor: 'rgba(221, 166, 58, 1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

window.allMenuItems = [];

async function loadMenuManager() {
    try {
        const res = await fetch('/api/menu/all');
        const items = await res.json();
        window.allMenuItems = items;

        const tbody = document.getElementById('menu-table-body');
        tbody.innerHTML = '';

        items.forEach(item => {
            const isDeactivated = item.status === 'Inactive';
            const statusBadge = isDeactivated 
                ? `<span class="badge bg-secondary">Inactive</span>` 
                : `<span class="badge bg-success">Active</span>`;
                
            const toggleText = isDeactivated ? 'Activate' : 'Deactivate';
            const toggleIcon = isDeactivated ? 'fa-circle-check' : 'fa-ban';
            const toggleBtnClass = isDeactivated ? 'btn-outline-success' : 'btn-outline-warning';

            tbody.innerHTML += `
                <tr>
                    <td>
                        <img src="${item.image_url}" class="rounded shadow-sm" style="width: 45px; height: 45px; object-fit: cover;">
                    </td>
                    <td>
                        <div>
                            <strong class="text-dark d-block">${item.name}</strong>
                            ${statusBadge}
                        </div>
                    </td>
                    <td><span class="badge bg-light text-dark border">${item.category}</span></td>
                    <td><strong class="text-success">₹${item.price.toFixed(2)}</strong></td>
                    <td><span class="fw-semibold">${item.stock_quantity}</span></td>
                    <td>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-primary btn-xs py-1 px-2" style="font-size: 0.75rem;" onclick="openEditModal(${item.id})">
                                <i class="fa-solid fa-pen-to-square me-1"></i> Edit
                            </button>
                            <button class="btn ${toggleBtnClass} btn-xs py-1 px-2" style="font-size: 0.75rem;" onclick="toggleMenuItemStatus(${item.id})">
                                <i class="fa-solid ${toggleIcon} me-1"></i> ${toggleText}
                            </button>
                            <button class="btn btn-outline-danger btn-xs py-1 px-2" style="font-size: 0.75rem;" onclick="removeMenuItem(${item.id})">
                                <i class="fa-solid fa-trash-can me-1"></i> Remove
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

function openEditModal(itemId) {
    const item = window.allMenuItems.find(it => it.id === itemId);
    if (!item) return;

    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-name').value = item.name;
    document.getElementById('edit-item-category').value = item.category;
    document.getElementById('edit-item-price').value = item.price;
    document.getElementById('edit-item-stock').value = item.stock_quantity;
    document.getElementById('edit-item-status').value = item.status;
    document.getElementById('edit-item-description').value = item.description || '';
    document.getElementById('edit-item-image-url').value = item.image_url || '';

    const preview = document.getElementById('edit-item-preview');
    if (item.image_url) {
        preview.src = item.image_url;
        preview.style.display = 'inline-block';
    } else {
        preview.style.display = 'none';
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('editMenuItemModal')).show();
}

// Edit Menu Form Handler
document.getElementById('edit-menu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = document.getElementById('edit-menu-form');
    const itemId = document.getElementById('edit-item-id').value;
    const formData = new FormData(form);

    try {
        const res = await fetch(`/api/admin/menu/edit/${itemId}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert("Menu item updated successfully!");
            bootstrap.Modal.getInstance(document.getElementById('editMenuItemModal')).hide();
            loadMenuManager();
        } else {
            alert(data.message || "Failed to update item.");
        }
    } catch (err) {
        console.error(err);
        alert("Failed to update menu item.");
    }
});

async function toggleMenuItemStatus(itemId) {
    try {
        const res = await fetch(`/api/admin/menu/delete/${itemId}`, { method: 'POST' });
        if (res.ok) {
            loadMenuManager();
        }
    } catch (err) {
        console.error(err);
    }
}

async function removeMenuItem(itemId) {
    if (confirm("WARNING: Are you sure you want to permanently delete this menu item from the database? This cannot be undone.")) {
        try {
            const res = await fetch(`/api/admin/menu/remove/${itemId}`, { method: 'POST' });
            if (res.ok) {
                loadMenuManager();
            }
        } catch (err) {
            console.error(err);
        }
    }
}

async function loadGlobalOrders() {
    try {
        const res = await fetch('/api/staff/orders');
        const orders = await res.json();

        const tbody = document.getElementById('global-orders-table');
        tbody.innerHTML = '';

        orders.forEach(order => {
            const itemsStr = order.items.map(it => `${it.name} x${it.quantity}`).join(', ');
            tbody.innerHTML += `
                <tr>
                    <td><strong>#${order.id}</strong></td>
                    <td>${order.student_name}<br><small class="text-muted">${order.student_contact}</small></td>
                    <td><span class="text-truncate d-inline-block" style="max-width: 250px;" title="${itemsStr}">${itemsStr}</span></td>
                    <td>${order.order_type}</td>
                    <td>₹${order.total_amount.toFixed(2)}</td>
                    <td><span class="badge bg-light text-dark border">${order.order_status}</span></td>
                    <td>
                        <select class="form-select form-select-sm" onchange="overrideOrderStatus(${order.id}, this.value)">
                            <option value="" selected disabled>Change Status</option>
                            <option value="Ordered">Ordered</option>
                            <option value="Cooking">Cooking</option>
                            <option value="Ready">Ready</option>
                            <option value="In Transit">In Transit</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

async function overrideOrderStatus(orderId, status) {
    if (confirm(`Force override order #${orderId} status to "${status}"?`)) {
        try {
            const res = await fetch(`/api/admin/order/${orderId}/override`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                loadAdminDashboard();
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// Account Creation
document.getElementById('create-account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('acc-name').value;
    const email = document.getElementById('acc-email').value;
    const role = document.getElementById('acc-role').value;
    const contact = document.getElementById('acc-contact').value;
    const password = document.getElementById('acc-password').value;

    try {
        const res = await fetch('/api/admin/users/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, role, contact, password })
        });
        const data = await res.json();
        if (data.success) {
            alert(`${role} account created successfully!`);
            document.getElementById('create-account-form').reset();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
});

// Menu Item Creation
document.getElementById('create-menu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = document.getElementById('create-menu-form');
    const formData = new FormData(form);

    try {
        const res = await fetch('/api/admin/menu/add', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert("New menu item published successfully!");
            form.reset();
            
            const modalEl = document.getElementById('addMenuItemModal');
            const modalInst = bootstrap.Modal.getInstance(modalEl);
            if (modalInst) {
                modalInst.hide();
            } else {
                const newInst = new bootstrap.Modal(modalEl);
                newInst.hide();
            }
            
            loadAdminDashboard();
        } else {
            alert(data.message || "Failed to add menu item.");
        }
    } catch (err) {
        console.error(err);
    }
});

async function loadAuditLogs() {
    try {
        const res = await fetch('/api/admin/audit-logs');
        const logs = await res.json();
        const list = document.getElementById('audit-log-list');
        list.innerHTML = '';
        
        if (logs.length === 0) {
            list.innerHTML = `<div class="text-center text-muted py-3 small">No action logs found.</div>`;
            return;
        }
        
        logs.forEach(log => {
            list.innerHTML += `
                <div class="list-group-item px-0 py-2 border-0 border-bottom d-flex justify-content-between align-items-center">
                    <span style="font-size: 0.85rem;" class="text-dark"><i class="fa-solid fa-angle-right me-1 text-muted"></i> ${log.action}</span>
                    <small style="font-size: 0.75rem;" class="text-muted"><i class="fa-solid fa-clock me-1"></i> ${log.timestamp}</small>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

// Auto Poll
document.addEventListener('DOMContentLoaded', () => {
    loadAdminDashboard();
    setInterval(loadAdminDashboard, 8000); // Poll every 8 seconds
});
