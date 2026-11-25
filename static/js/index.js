let menuItems = [];
let rescueItems = [];
let cart = [];
let selectedCategory = 'All';
let selectedPaymentMethod = 'Wallet';
let upiPollInterval = null;
let currentPendingOrderId = null;

// Fetch and Load items
async function loadMenu() {
    try {
        const res = await fetch('/api/menu');
        menuItems = await res.json();
        
        const rescueRes = await fetch('/api/food-rescue');
        rescueItems = await rescueRes.json();
        
        // Show/hide Zero hunger spotlight if rescue items exist
        const spotlight = document.getElementById('rescue-spotlight');
        if (rescueItems.length > 0) {
            spotlight.style.display = 'block';
        } else {
            spotlight.style.display = 'none';
        }
        
        renderGrid();
    } catch (err) {
        console.error("Failed to load menu", err);
    }
}

function selectCategory(cat) {
    selectedCategory = cat;
    // update styling
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('active', 'btn-primary', 'btn-warning');
        btn.classList.add('btn-outline-secondary');
        if (cat === 'Rescue' && btn.innerText.includes('Food Rescue')) {
            btn.classList.add('active', 'btn-warning');
            btn.classList.remove('btn-outline-secondary');
        } else if (btn.innerText.includes(cat) || (cat === 'All' && btn.innerText === 'All Items')) {
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-outline-secondary');
        }
    });
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('menu-grid');
    grid.innerHTML = '';
    
    let filtered = [];
    if (selectedCategory === 'Rescue') {
        // Food rescue items display
        if (rescueItems.length === 0) {
            grid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <h3>🌱 Canteen is Wastage Free!</h3>
                    <p class="text-muted">No cancelled orders or surplus food in the rescue pool currently.</p>
                </div>
            `;
            return;
        }
        
        rescueItems.forEach(item => {
            grid.innerHTML += `
                <div class="col">
                    <div class="card h-100 border-warning border-2 rounded-4 shadow-sm position-relative overflow-hidden">
                        <!-- SDG 2 Logo on Upper Left Corner of Pic -->
                        <img src="/static/images/sdg2_logo.png" alt="SDG 2" class="position-absolute top-0 start-0 m-2 shadow-sm" style="height: 32px; object-fit: contain; z-index: 5; border-radius: 6px;">
                        
                        <!-- 60% OFF Badge on Upper Right Corner -->
                        <span class="position-absolute top-0 end-0 m-2 badge bg-danger py-1.5 px-2.5 fw-bold shadow-sm" style="z-index: 5; font-size: 0.85rem;">
                            <i class="fa-solid fa-bolt me-1"></i> 60% OFF
                        </span>
                        
                        <img src="${item.image_url}" class="card-img-top rounded-top-4" style="height: 180px; object-fit: cover;" alt="${item.name}">
                        <div class="card-body">
                            <span class="badge bg-warning-subtle text-warning-emphasis mb-2 small"><i class="fa-solid fa-bowl-food me-1"></i> SDG 2 Target</span>
                            <h5 class="card-title fw-bold">${item.name}</h5>
                            <p class="card-text text-muted small">${item.description || 'Fresh cancelled canteen order. Save it from going to waste!'}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <span class="fs-4 fw-bold text-success">₹${item.discounted_price.toFixed(2)}</span>
                                    <span class="text-decoration-line-through text-muted small ms-1">₹${item.original_price.toFixed(2)}</span>
                                </div>
                                <button class="btn btn-warning btn-sm fw-bold px-3 py-2 text-dark shadow-sm" onclick="buyRescueItem(${item.id})">
                                    <i class="fa-solid fa-tag me-1"></i> Rescue Item (60% OFF)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        return;
    }

    // Normal Category Filter
    if (selectedCategory === 'All') {
        filtered = menuItems;
    } else {
        filtered = menuItems.filter(item => item.category === selectedCategory);
    }
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center py-5"><p class="text-muted">No items available in this category.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const isOutOfStock = item.stock_quantity <= 0;
        grid.innerHTML += `
            <div class="col">
                <div class="card h-100 border-0 rounded-4 shadow-sm position-relative overflow-hidden">
                    ${isOutOfStock ? `<span class="position-absolute top-0 end-0 m-2 badge bg-danger py-1.5 px-2.5 shadow-sm" style="z-index: 5;">Sold Out</span>` : ''}
                    <img src="${item.image_url}" class="card-img-top rounded-top-4" style="height: 180px; object-fit: cover;" alt="${item.name}">
                    <div class="card-body">
                        <span class="badge bg-light text-secondary mb-2 small">${item.category}</span>
                        <h5 class="card-title fw-bold">${item.name}</h5>
                        <p class="card-text text-muted small">${item.description || ''}</p>
                        
                        <!-- Badges suggested -->
                        <div class="mb-3 d-flex flex-wrap gap-1">
                            <span class="badge bg-success-subtle text-success small py-1">Chef Special</span>
                            <span class="badge bg-info-subtle text-info small py-1">Freshly Made</span>
                        </div>

                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fs-4 fw-bold">₹${item.price.toFixed(2)}</span>
                            <button class="btn btn-primary rounded-3 px-3 py-2 btn-sm" onclick="addToCart(${item.id})" ${isOutOfStock ? 'disabled' : ''}>
                                <i class="fa-solid fa-plus me-1"></i> Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function filterMenu() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const grid = document.getElementById('menu-grid');
    grid.innerHTML = '';

    const filtered = menuItems.filter(item => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center py-5"><p class="text-muted">No items match your search.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const isOutOfStock = item.stock_quantity <= 0;
        grid.innerHTML += `
            <div class="col">
                <div class="card h-100 border-0 rounded-4 shadow-sm position-relative overflow-hidden">
                    ${isOutOfStock ? `<span class="position-absolute top-0 end-0 m-2 badge bg-danger py-1.5 px-2.5 shadow-sm" style="z-index: 5;">Sold Out</span>` : ''}
                    <img src="${item.image_url}" class="card-img-top rounded-top-4" style="height: 180px; object-fit: cover;" alt="${item.name}">
                    <div class="card-body">
                        <span class="badge bg-light text-secondary mb-2">${item.category}</span>
                        <h5 class="card-title fw-bold">${item.name}</h5>
                        <p class="card-text text-muted small">${item.description || ''}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fs-4 fw-bold">₹${item.price.toFixed(2)}</span>
                            <button class="btn btn-primary rounded-3 btn-sm" onclick="addToCart(${item.id})" ${isOutOfStock ? 'disabled' : ''}>
                                <i class="fa-solid fa-plus me-1"></i> Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function scrollToRescue() {
    selectCategory('Rescue');
    document.getElementById('menu-grid').scrollIntoView({ behavior: 'smooth' });
}

// Cart Handlers
function addToCart(itemId) {
    const item = menuItems.find(it => it.id === itemId);
    if (!item) return;

    const cartItem = cart.find(it => it.id === itemId);
    if (cartItem) {
        if (cartItem.quantity < item.stock_quantity) {
            cartItem.quantity++;
        } else {
            alert(`Cannot add more. Only ${item.stock_quantity} in stock.`);
        }
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1
        });
    }
    renderCart();
}

function changeQuantity(itemId, delta) {
    const cartItem = cart.find(it => it.id === itemId);
    if (!cartItem) return;

    const originalItem = menuItems.find(it => it.id === itemId);
    
    cartItem.quantity += delta;
    if (cartItem.quantity <= 0) {
        cart = cart.filter(it => it.id !== itemId);
    } else if (originalItem && cartItem.quantity > originalItem.stock_quantity) {
        cartItem.quantity = originalItem.stock_quantity;
        alert(`Only ${originalItem.stock_quantity} available in stock.`);
    }
    renderCart();
}

function renderCart() {
    const emptyDiv = document.getElementById('cart-empty');
    const filledDiv = document.getElementById('cart-filled');
    const container = document.getElementById('cart-items-container');
    const countBadge = document.getElementById('cart-count');

    if (cart.length === 0) {
        emptyDiv.style.display = 'block';
        filledDiv.style.display = 'none';
        countBadge.innerText = '0';
        return;
    }

    emptyDiv.style.display = 'none';
    filledDiv.style.display = 'block';

    let subtotal = 0;
    let totalCount = 0;
    container.innerHTML = '';

    cart.forEach(item => {
        subtotal += item.price * item.quantity;
        totalCount += item.quantity;
        
        container.innerHTML += `
            <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                <div style="max-width: 60%;">
                    <h6 class="fw-bold mb-0">${item.name}</h6>
                    <small class="text-primary">₹${item.price.toFixed(2)} each</small>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-outline-secondary btn-xs py-0 px-2" onclick="changeQuantity(${item.id}, -1)">-</button>
                    <span class="fw-bold small">${item.quantity}</span>
                    <button class="btn btn-outline-secondary btn-xs py-0 px-2" onclick="changeQuantity(${item.id}, 1)">+</button>
                </div>
            </div>
        `;
    });

    countBadge.innerText = totalCount;
    document.getElementById('cart-subtotal').innerText = `₹${subtotal.toFixed(2)}`;
    
    const isDelivery = document.getElementById('type-delivery').checked;
    const total = subtotal + (isDelivery ? 20 : 0);
    document.getElementById('cart-total').innerText = `₹${total.toFixed(2)}`;
}

function toggleOrderType() {
    const isDelivery = document.getElementById('type-delivery').checked;
    const locContainer = document.getElementById('delivery-loc-container');
    const deliveryRow = document.getElementById('delivery-charge-row');

    if (isDelivery) {
        locContainer.style.display = 'block';
        deliveryRow.style.display = 'flex';
        setTimeout(() => {
            initMap();
            if (mapInstance) {
                mapInstance.invalidateSize();
            }
        }, 100);
    } else {
        locContainer.style.display = 'none';
        deliveryRow.style.display = 'none';
    }
    renderCart();
}

// Checkout Flow
function openCheckoutModal() {
    // Requirement 1: User MUST be logged in as a Student to place an order
    if (!window.currentUser || (window.currentUser.role !== 'Student' && window.currentUser.role !== 'Admin')) {
        const studentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('studentLoginPromptModal'));
        studentModal.show();
        return;
    }

    const isDelivery = document.getElementById('type-delivery').checked;
    if (isDelivery && !document.getElementById('delivery-location').value.trim()) {
        alert("Please enter a delivery location");
        return;
    }

    // Calculate amount
    let subtotal = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    let total = subtotal + (isDelivery ? 20 : 0);

    document.getElementById('pay-modal-total').innerText = `₹${total.toFixed(2)}`;

    // Manage Guest info display
    const guestInfo = document.getElementById('guest-info-container');
    if (guestInfo) guestInfo.style.display = 'none';

    // Get wallet balance
    let balance = window.currentUser ? window.currentUser.wallet_balance : 0.0;
    document.getElementById('pay-wallet-bal').innerText = `Available: ₹${balance.toFixed(2)}`;

    if (upiPollInterval) {
        clearInterval(upiPollInterval);
        upiPollInterval = null;
    }
    currentPendingOrderId = null;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('checkoutModal')).show();
    selectPaymentMethod('Wallet');
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    // update radios & classes
    document.getElementById('radio-wallet').checked = (method === 'Wallet');
    document.getElementById('radio-upi').checked = (method === 'UPI');
    document.getElementById('radio-card').checked = (method === 'Card');
    const radioCod = document.getElementById('radio-cod');
    if (radioCod) radioCod.checked = (method === 'COD');

    document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('border-primary', 'bg-light'));
    const chosenOpt = document.getElementById(`opt-${method.toLowerCase()}`);
    if (chosenOpt) chosenOpt.classList.add('border-primary', 'bg-light');

    // toggle displays
    document.getElementById('payment-details-upi').style.display = (method === 'UPI') ? 'block' : 'none';
    document.getElementById('payment-details-card').style.display = (method === 'Card') ? 'block' : 'none';
    const codDetails = document.getElementById('payment-details-cod');
    if (codDetails) codDetails.style.display = (method === 'COD') ? 'block' : 'none';

    const confirmBtn = document.getElementById('confirm-pay-btn');
    if (method === 'UPI') {
        confirmBtn.disabled = true;
        confirmBtn.innerText = 'Pay via UPI QR Code Scan';
        
        if (!currentPendingOrderId) {
            generateUpiPendingOrder();
        } else {
            if (upiPollInterval) clearInterval(upiPollInterval);
            upiPollInterval = setInterval(checkUpiPaymentStatus, 2000);
        }
    } else if (method === 'COD') {
        confirmBtn.disabled = false;
        confirmBtn.innerText = 'Confirm Order (Cash on Delivery)';
        if (upiPollInterval) {
            clearInterval(upiPollInterval);
            upiPollInterval = null;
        }
    } else {
        confirmBtn.disabled = false;
        confirmBtn.innerText = 'Pay & Confirm Order';
        if (upiPollInterval) {
            clearInterval(upiPollInterval);
            upiPollInterval = null;
        }
    }
}

async function completePaymentAndCheckout() {
    const isDelivery = document.getElementById('type-delivery').checked;
    const deliveryLoc = document.getElementById('delivery-location').value;
    const total = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0) + (isDelivery ? 20 : 0);

    let guestName = '';
    let guestContact = '';

    const isGuest = !window.currentUser || (window.currentUser.role !== 'Staff' && window.currentUser.role !== 'Delivery' && window.currentUser.role !== 'Admin');

    // Payment-specific validations
    if (selectedPaymentMethod === 'Card') {
        const cardNumber = document.getElementById('card-number').value.trim().replace(/\s/g, '');
        const cardExpiry = document.getElementById('card-expiry').value.trim();
        const cardCvv = document.getElementById('card-cvv').value.trim();
        
        if (cardNumber.length !== 16 || isNaN(cardNumber)) {
            alert("Please enter a valid 16-digit card number.");
            return;
        }
        if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
            alert("Please enter card expiry in MM/YY format.");
            return;
        }
        if (cardCvv.length !== 3 || isNaN(cardCvv)) {
            alert("Please enter a valid 3-digit CVV code.");
            return;
        }
    } else if (selectedPaymentMethod === 'Wallet') {
        if (!window.currentUser || window.currentUser.wallet_balance < total) {
            alert("Insufficient wallet balance. Please top up your wallet first or choose Cash on Delivery.");
            return;
        }
    }

    const btn = document.getElementById('confirm-pay-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${selectedPaymentMethod === 'COD' ? 'Confirming Order...' : 'Processing Payment...'}`;

    // Simulate network latency for payment gateway
    setTimeout(async () => {
        try {
            const res = await fetch('/api/cart/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: cart,
                    total_amount: total,
                    payment_method: selectedPaymentMethod,
                    order_type: isDelivery ? 'Delivery' : 'Pickup',
                    delivery_location: isDelivery ? deliveryLoc : null,
                    student_name: guestName,
                    student_contact: guestContact
                })
            });

            const data = await res.json();
            if (data.success) {
                // Update wallet if wallet payment used
                if (selectedPaymentMethod === 'Wallet') {
                    if (!window.currentUser) {
                        const newBal = parseFloat(localStorage.getItem('guest_wallet') || '500.00') - total;
                        localStorage.setItem('guest_wallet', newBal);
                    } else {
                        window.currentUser.wallet_balance -= total;
                    }
                    updateWalletDisplay();
                }

                // Save order to local history
                saveOrderToLocalHistory(data.order_id);

                // clear cart and redirect to tracking
                cart = [];
                renderCart();
                bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
                window.location.href = `/order-tracking/${data.order_id}`;
            } else {
                alert(data.message);
                btn.disabled = false;
                btn.innerText = 'Pay & Confirm Order';
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred during checkout.");
            btn.disabled = false;
            btn.innerText = 'Pay & Confirm Order';
        }
    }, 1500);
}

// Dedicated SDG-2 Rescue Purchase Logic
let currentRescueItem = null;
let selectedRescuePayMethod = 'Cash on Delivery';

function selectRescuePayMethod(method) {
    selectedRescuePayMethod = method;
    ['cash', 'wallet', 'upi'].forEach(m => {
        const opt = document.getElementById(`rescue-opt-${m}`);
        if (opt) {
            opt.classList.remove('border-primary', 'bg-primary-subtle');
        }
    });
    const key = method === 'Cash on Delivery' ? 'cash' : method.toLowerCase();
    const activeOpt = document.getElementById(`rescue-opt-${key}`);
    if (activeOpt) {
        activeOpt.classList.add('border-primary', 'bg-primary-subtle');
    }
    const radio = document.getElementById(`rescue-radio-${key}`);
    if (radio) radio.checked = true;

    // Check wallet balance alert
    const alertBox = document.getElementById('rescue-payment-alert');
    if (method === 'Wallet' && currentRescueItem) {
        const total = currentRescueItem.discounted_price * currentRescueItem.quantity;
        const bal = window.currentUser ? window.currentUser.wallet_balance : 0;
        if (bal < total) {
            alertBox.style.display = 'block';
            alertBox.innerText = `Insufficient Wallet Balance (₹${bal.toFixed(2)} vs ₹${total.toFixed(2)} required). Please select Cash at Counter (COD) or top up wallet.`;
        } else {
            alertBox.style.display = 'none';
        }
    } else {
        alertBox.style.display = 'none';
    }
}

// Open Dedicated Rescue Food Modal
async function buyRescueItem(rescueId) {
    if (!window.currentUser || (window.currentUser.role !== 'Student' && window.currentUser.role !== 'Admin')) {
        const studentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('studentLoginPromptModal'));
        studentModal.show();
        return;
    }

    const item = rescueItems.find(it => it.id === rescueId);
    if (!item) {
        alert("This item is no longer available in Food Rescue.");
        return;
    }

    currentRescueItem = item;
    const totalCost = item.discounted_price * item.quantity;

    // Populate modal fields
    document.getElementById('rescue-modal-img').src = item.image_url;
    document.getElementById('rescue-modal-name').innerText = item.name;
    document.getElementById('rescue-modal-desc').innerText = item.description || 'Fresh cancelled order from college canteen. 60% Off!';
    document.getElementById('rescue-modal-qty').innerText = item.quantity;
    document.getElementById('rescue-modal-price').innerText = `₹${(item.discounted_price * item.quantity).toFixed(2)}`;
    document.getElementById('rescue-modal-orig-price').innerText = `₹${(item.original_price * item.quantity).toFixed(2)}`;
    document.getElementById('rescue-btn-amount').innerText = `₹${totalCost.toFixed(2)}`;

    // Wallet balance display
    const bal = window.currentUser ? window.currentUser.wallet_balance : 0.0;
    const balElem = document.getElementById('rescue-wallet-balance-text');
    if (balElem) balElem.innerText = `Available: ₹${bal.toFixed(2)}`;

    // Default to Cash at Counter (COD)
    selectRescuePayMethod('Cash on Delivery');

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('rescueModal'));
    modal.show();
}

async function executeRescuePurchase() {
    if (!currentRescueItem) return;
    const item = currentRescueItem;
    const totalCost = item.discounted_price * item.quantity;
    const payMethod = selectedRescuePayMethod;

    if (payMethod === 'Wallet') {
        const bal = window.currentUser ? window.currentUser.wallet_balance : 0.0;
        if (bal < totalCost) {
            alert(`Insufficient wallet balance. You have ₹${bal.toFixed(2)} but ₹${totalCost.toFixed(2)} is required. Please select Cash at Counter (COD) or top up your wallet.`);
            selectRescuePayMethod('Cash on Delivery');
            return;
        }
    }

    const btn = document.getElementById('btn-confirm-rescue');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Claiming Food...`;

    try {
        const res = await fetch('/api/food-rescue/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rescue_id: item.id,
                payment_method: payMethod
            })
        });
        const data = await res.json();
        if (data.success) {
            // Deduct local wallet if wallet was used
            if (payMethod === 'Wallet' && window.currentUser) {
                window.currentUser.wallet_balance -= totalCost;
                updateWalletDisplay();
            }

            // Immediately remove the rescued item from UI so it is permanently gone from SDG-2
            rescueItems = rescueItems.filter(it => it.id !== item.id);
            renderGrid();
            if (rescueItems.length === 0) {
                const spotlight = document.getElementById('rescue-spotlight');
                if (spotlight) spotlight.style.display = 'none';
            }

            // Close modal
            const rescueModalInstance = bootstrap.Modal.getInstance(document.getElementById('rescueModal'));
            if (rescueModalInstance) rescueModalInstance.hide();

            saveOrderToLocalHistory(data.order_id);
            alert(data.message || "Rescued food claimed successfully! Please pick it up from the canteen counter.");
            window.location.href = `/order-tracking/${data.order_id}`;
        } else {
            alert(data.message || "Failed to claim rescued meal.");
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-hand-holding-heart me-1"></i> Confirm & Claim Food (${document.getElementById('rescue-btn-amount').innerText})`;
        }
    } catch (err) {
        console.error(err);
        alert("Network or server error while claiming rescued meal.");
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-hand-holding-heart me-1"></i> Confirm & Claim Food (${document.getElementById('rescue-btn-amount').innerText})`;
    }
}

// Top up Wallet
async function processWalletTopup() {
    const amount = parseFloat(document.getElementById('topup-amount').value);
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount");
        return;
    }

    let contact = '';
    let name = '';
    if (!window.currentUser) {
        contact = localStorage.getItem('guest_contact') || '';
        name = localStorage.getItem('guest_name') || 'Guest Student';
        if (!contact) {
            contact = prompt("Please enter your 10-digit contact number to link your wallet topup:");
            if (!contact || contact.length < 10) {
                alert("Invalid contact number. Topup cancelled.");
                return;
            }
            localStorage.setItem('guest_contact', contact);
        }
    }

    try {
        const res = await fetch('/api/wallet/topup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                amount,
                student_name: name,
                student_contact: contact
            })
        });
        const data = await res.json();
        if (data.success) {
            alert(`Top-up successful! New balance: ₹${data.wallet_balance.toFixed(2)}`);
            if (window.currentUser) {
                window.currentUser.wallet_balance = data.wallet_balance;
            } else {
                localStorage.setItem('guest_wallet', data.wallet_balance);
            }
            updateWalletDisplay();
            bootstrap.Modal.getInstance(document.getElementById('topupModal')).hide();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
}

// Load user orders history
async function loadOrderHistory() {
    let orders = [];
    const container = document.getElementById('recent-orders-list');
    const card = document.getElementById('recent-orders-card');

    try {
        if (window.currentUser) {
            const res = await fetch('/api/order/history');
            orders = await res.json();
        } else {
            const orderIds = JSON.parse(localStorage.getItem('guest_orders') || '[]');
            if (orderIds.length === 0) {
                card.style.display = 'none';
                return;
            }
            
            // Fetch details for the recent 3 guest orders concurrently
            const promises = orderIds.slice(0, 3).map(id => fetch(`/api/order/${id}`).then(r => r.json()));
            const results = await Promise.all(promises);
            orders = results.filter(ord => ord && ord.success !== false);
        }

        if (orders.length === 0) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';
        container.innerHTML = '';
        
        // Limit to 3 most recent
        orders.slice(0, 3).forEach(order => {
            let badgeClass = 'bg-secondary';
            if (order.order_status === 'Ordered') badgeClass = 'bg-info';
            if (order.order_status === 'Cooking') badgeClass = 'bg-warning text-dark';
            if (order.order_status === 'Ready') badgeClass = 'bg-primary';
            if (order.order_status === 'In Transit') badgeClass = 'bg-primary';
            if (order.order_status === 'Delivered') badgeClass = 'bg-success';
            if (order.order_status === 'Cancelled') badgeClass = 'bg-danger';

            const itemsStr = order.items.map(it => `${it.name} x${it.quantity}`).join(', ');

            container.innerHTML += `
                <div class="border rounded p-3 d-flex flex-column gap-2 bg-white">
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="small text-muted">Order #${order.id}</span>
                        <span class="badge ${badgeClass}">${order.order_status}</span>
                    </div>
                    <div class="fw-bold text-truncate" style="max-width: 100%;">${itemsStr}</div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold text-primary">₹${order.total_amount.toFixed(2)}</span>
                        <div class="d-flex gap-2">
                            <a href="/order-tracking/${order.id}" class="btn btn-outline-primary btn-xs py-1 px-2" style="font-size: 0.8rem;">
                                Track <i class="fa-solid fa-location-crosshairs ms-1"></i>
                            </a>
                            <button class="btn btn-outline-success btn-xs py-1 px-2" style="font-size: 0.8rem;" onclick="reorder(${order.id})">
                                Reorder <i class="fa-solid fa-rotate-right ms-1"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

async function reorder(orderId) {
    try {
        const res = await fetch(`/api/order/${orderId}`);
        const order = await res.json();
        if (order.success === false) {
            alert("Order details not found");
            return;
        }
        
        // Load items into cart
        cart = [];
        order.items.forEach(it => {
            cart.push({
                id: it.id,
                name: it.name,
                price: it.price,
                quantity: it.quantity
            });
        });
        renderCart();
        alert("Items added to your cart!");
    } catch (err) {
        console.error(err);
    }
}

function updateWalletDisplay() {
    let balance = 500.00;
    if (window.currentUser) {
        balance = window.currentUser.wallet_balance;
    } else {
        balance = parseFloat(localStorage.getItem('guest_wallet') || '500.00');
    }
    
    document.getElementById('wallet-val').innerText = `₹${balance.toFixed(2)}`;
    const navBal = document.getElementById('nav-wallet-balance');
    if (navBal) navBal.innerText = `₹${balance.toFixed(2)}`;
    
    const payBal = document.getElementById('pay-wallet-bal');
    if (payBal) payBal.innerText = `Available: ₹${balance.toFixed(2)}`;
}

async function syncGuestWalletBalance() {
    const contact = document.getElementById('guest-contact').value.trim();
    if (!contact || contact.length < 10) return;
    try {
        const res = await fetch(`/api/wallet/balance?contact=${contact}`);
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('guest_wallet', data.wallet_balance);
            updateWalletDisplay();
        }
    } catch(err) {
        console.error(err);
    }
}

function saveOrderToLocalHistory(orderId) {
    let orders = JSON.parse(localStorage.getItem('guest_orders') || '[]');
    if (!orders.includes(orderId)) {
        orders.unshift(orderId);
    }
    localStorage.setItem('guest_orders', JSON.stringify(orders));
}

let mapInstance = null;
let mapMarker = null;

function initMap() {
    if (mapInstance) return; // already initialized
    
    // Mock Center for the college campus (e.g. typical university latitude/longitude)
    const campusCenter = [28.5450, 77.1926]; 
    
    mapInstance = L.map('map').setView(campusCenter, 16);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(mapInstance);
    
    // Campus landmark nodes
    const campusLandmarks = [
        { name: "Hostel Block A", coords: [28.5460, 77.1915] },
        { name: "Hostel Block B", coords: [28.5465, 77.1935] },
        { name: "Central Library", coords: [28.5445, 77.1928] },
        { name: "Computer Science Dept", coords: [28.5435, 77.1910] },
        { name: "Admin Building Block 2", coords: [28.5452, 77.1945] },
        { name: "Campus Sports Complex", coords: [28.5430, 77.1940] }
    ];
    
    campusLandmarks.forEach(pt => {
        const m = L.marker(pt.coords).addTo(mapInstance);
        m.bindPopup(`<b>${pt.name}</b><br><button class="btn btn-primary btn-xs py-0 px-2 mt-1" style="font-size: 0.7rem; color:white;" onclick="selectMapLocation('${pt.name}', ${pt.coords[0]}, ${pt.coords[1]})">Select</button>`);
    });
    
    mapInstance.on('click', function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        
        if (mapMarker) {
            mapMarker.setLatLng(e.latlng);
        } else {
            mapMarker = L.marker(e.latlng, { draggable: true }).addTo(mapInstance);
        }
        
        const locName = `Pinned Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        document.getElementById('delivery-location').value = locName;
    });
}

function selectMapLocation(name, lat, lng) {
    document.getElementById('delivery-location').value = name;
    if (mapMarker) {
        mapMarker.setLatLng([lat, lng]);
    } else {
        mapMarker = L.marker([lat, lng]).addTo(mapInstance);
    }
    mapInstance.setView([lat, lng], 17);
}

function openUpiMobileScanner() {
    const isDelivery = document.getElementById('type-delivery').checked;
    const deliveryLoc = document.getElementById('delivery-location').value;
    if (isDelivery && !deliveryLoc.trim()) {
        alert("Please enter a delivery location first.");
        return;
    }

    const total = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0) + (isDelivery ? 20 : 0);
    document.getElementById('upi-mobile-amount').innerText = `₹${total.toFixed(2)}`;

    // Prefill name and contact
    const nameField = document.getElementById('upi-mobile-name');
    const contactField = document.getElementById('upi-mobile-contact');

    if (window.currentUser) {
        nameField.value = window.currentUser.name;
        contactField.value = window.currentUser.contact || '';
    } else {
        nameField.value = localStorage.getItem('guest_name') || '';
        contactField.value = localStorage.getItem('guest_contact') || '';
    }

    // Hide checkout modal temporarily and show phone scanner
    bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('upiMobileModal')).show();
}

function closeUpiMobileScanner() {
    bootstrap.Modal.getInstance(document.getElementById('upiMobileModal')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('checkoutModal')).show();
}

async function generateUpiPendingOrder() {
    const isDelivery = document.getElementById('type-delivery').checked;
    const deliveryLoc = document.getElementById('delivery-location').value;
    const total = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0) + (isDelivery ? 20 : 0);

    let guestName = '';
    let guestContact = '';
    const isGuest = !window.currentUser || (window.currentUser.role !== 'Staff' && window.currentUser.role !== 'Delivery' && window.currentUser.role !== 'Admin');
    if (isGuest) {
        guestName = document.getElementById('guest-name').value.trim();
        guestContact = document.getElementById('guest-contact').value.trim();
    }

    try {
        const res = await fetch('/api/cart/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart,
                total_amount: total,
                payment_method: 'UPI',
                order_type: isDelivery ? 'Delivery' : 'Pickup',
                delivery_location: isDelivery ? deliveryLoc : null,
                student_name: guestName,
                student_contact: guestContact
            })
        });
        const data = await res.json();
        if (data.success) {
            currentPendingOrderId = data.order_id;
            document.getElementById('upi-mobile-amount').innerText = `₹${total.toFixed(2)}`;

            const fullUrl = `http://${data.local_ip}:5000/mobile-upi-pay/${data.order_id}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fullUrl)}`;
            
            document.getElementById('upi-qr').src = qrUrl;
            document.getElementById('upi-qr-link').innerText = fullUrl;
            
            document.getElementById('upi-loading-qr').style.display = 'none';
            document.getElementById('upi-qr-container').style.display = 'block';

            if (upiPollInterval) clearInterval(upiPollInterval);
            upiPollInterval = setInterval(checkUpiPaymentStatus, 2000);
        } else {
            alert(data.message || "Failed to generate UPI QR code");
            selectPaymentMethod('Wallet');
        }
    } catch (err) {
        console.error(err);
        alert("Network error generating payment session");
        selectPaymentMethod('Wallet');
    }
}

async function checkUpiPaymentStatus() {
    if (!currentPendingOrderId) return;
    try {
        const res = await fetch(`/api/order/${currentPendingOrderId}`);
        const data = await res.json();
        if (data && data.success !== false) {
            if (data.order_status !== 'Pending Payment') {
                if (upiPollInterval) {
                    clearInterval(upiPollInterval);
                    upiPollInterval = null;
                }
                
                // Add guest order to local storage if guest
                if (!window.currentUser) {
                    const orderIds = JSON.parse(localStorage.getItem('guest_orders') || '[]');
                    if (!orderIds.includes(currentPendingOrderId)) {
                        orderIds.unshift(currentPendingOrderId);
                        localStorage.setItem('guest_orders', JSON.stringify(orderIds));
                    }
                }

                // Reset cart
                cart = [];
                renderCart();
                
                // Close checkout modal
                const modalEl = document.getElementById('checkoutModal');
                const modalInst = bootstrap.Modal.getInstance(modalEl);
                if (modalInst) modalInst.hide();
                
                alert("Payment received! Your order has been placed.");
                window.location.href = `/order-tracking/${currentPendingOrderId}`;
            }
        }
    } catch (err) {
        console.error(err);
    }
}

async function submitUpiMobilePay(event) {
    event.preventDefault();
    if (!currentPendingOrderId) {
        alert("Payment session not found.");
        return;
    }

    const upiName = document.getElementById('upi-mobile-name').value.trim();
    const upiContact = document.getElementById('upi-mobile-contact').value.trim();

    if (!upiName || !upiContact) {
        alert("Name and Contact Number are required.");
        return;
    }
    if (upiContact.length < 10 || isNaN(upiContact)) {
        alert("Please enter a valid 10-digit contact number.");
        return;
    }

    // Save guest details in localStorage
    const isGuest = !window.currentUser || (window.currentUser.role !== 'Staff' && window.currentUser.role !== 'Delivery' && window.currentUser.role !== 'Admin');
    if (isGuest) {
        localStorage.setItem('guest_name', upiName);
        localStorage.setItem('guest_contact', upiContact);
        document.getElementById('guest-name').value = upiName;
        document.getElementById('guest-contact').value = upiContact;
    }

    // Show status spinner in simulated phone screen
    document.getElementById('upi-mobile-status').style.display = 'block';
    document.getElementById('upi-mobile-pay-btn').disabled = true;

    setTimeout(async () => {
        try {
            const res = await fetch(`/api/order/${currentPendingOrderId}/complete-mobile-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: upiName,
                    contact: upiContact
                })
            });

            const data = await res.json();
            if (data.success) {
                document.getElementById('upi-mobile-status').innerHTML = '<i class="fa-solid fa-circle-check"></i> ✓ Payment Approved!';
                document.getElementById('upi-mobile-status').className = "text-center py-2 text-success fw-bold small mb-2";
                
                saveOrderToLocalHistory(currentPendingOrderId);
                cart = [];
                renderCart();

                try {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
                    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                    osc.start();
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
                    setTimeout(() => {
                        osc.stop();
                        audioCtx.close();
                    }, 500);
                } catch(e){}

                setTimeout(() => {
                    const modalEl = document.getElementById('upiMobileModal');
                    const modalInst = bootstrap.Modal.getInstance(modalEl);
                    if (modalInst) modalInst.hide();
                    window.location.href = `/order-tracking/${currentPendingOrderId}`;
                }, 1500);

            } else {
                alert(data.message);
                document.getElementById('upi-mobile-status').style.display = 'none';
                document.getElementById('upi-mobile-pay-btn').disabled = false;
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred during payment.");
            document.getElementById('upi-mobile-status').style.display = 'none';
            document.getElementById('upi-mobile-pay-btn').disabled = false;
        }
    }, 1500);
}

// Initialize Page
async function init() {
    // Initialize guest wallet if not present
    if (!localStorage.getItem('guest_wallet')) {
        localStorage.setItem('guest_wallet', '500.00');
    }

    await loadMenu();
    
    // Polling loop (every 5 seconds) to sync menu / rescue
    setInterval(async () => {
        const res = await fetch('/api/menu');
        menuItems = await res.json();
        const rescueRes = await fetch('/api/food-rescue');
        rescueItems = await rescueRes.json();
        const spotlight = document.getElementById('rescue-spotlight');
        if (rescueItems.length > 0) {
            spotlight.style.display = 'block';
        } else {
            spotlight.style.display = 'none';
        }
        renderGrid();
        loadOrderHistory();
    }, 5000);

    // Show guest wallet panel
    document.getElementById('wallet-panel').style.display = 'block';
    updateWalletDisplay();
    loadOrderHistory();
}

document.addEventListener('DOMContentLoaded', () => {
    // Wait briefly for checkSession in base.html
    setTimeout(init, 300);
});
