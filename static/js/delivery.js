let activeDelivery = null;
let availableJobs = [];
let riderAvailable = true;

async function loadDeliveryPortal() {
    try {
        // Check active run
        const activeRes = await fetch('/api/delivery/active');
        const activeData = await activeRes.json();
        
        const activePanel = document.getElementById('active-run-panel');
        const availablePanel = document.getElementById('available-jobs-panel');

        if (activeData.delivery) {
            const isNewDelivery = !activeDelivery || activeDelivery.id !== activeData.delivery.id;
            activeDelivery = activeData.delivery;
            activePanel.style.display = 'block';
            availablePanel.style.display = 'none';

            document.getElementById('active-dest').innerHTML = `<i class="fa-solid fa-location-dot text-danger me-1"></i> ${activeDelivery.delivery_location}`;
            document.getElementById('active-recipient-name').innerText = activeDelivery.student_name;
            document.getElementById('active-recipient-contact').innerText = `Contact: ${activeDelivery.student_contact}`;
            document.getElementById('active-bill').innerText = `₹${activeDelivery.total_amount.toFixed(2)}`;
            
            // Clear input and errors only if this is a new run
            if (isNewDelivery) {
                document.getElementById('otp-input').value = '';
                document.getElementById('otp-error').style.display = 'none';
            }
        } else {
            activeDelivery = null;
            activePanel.style.display = 'none';
            availablePanel.style.display = 'block';
            if (riderAvailable) {
                loadAvailableJobs();
            } else {
                document.getElementById('jobs-empty').style.display = 'block';
                document.getElementById('jobs-empty').querySelector('p').innerText = "Rider status is set to Busy. Toggle status to view jobs.";
                document.getElementById('jobs-list').innerHTML = '';
            }
        }

        loadRiderStats();

    } catch (err) {
        console.error(err);
    }
}

async function loadAvailableJobs() {
    try {
        const res = await fetch('/api/delivery/available');
        availableJobs = await res.json();

        const emptyDiv = document.getElementById('jobs-empty');
        const listContainer = document.getElementById('jobs-list');

        if (availableJobs.length === 0) {
            emptyDiv.style.display = 'block';
            emptyDiv.querySelector('p').innerText = "No pending deliveries. Sit back and relax!";
            listContainer.innerHTML = '';
            return;
        }

        emptyDiv.style.display = 'none';
        listContainer.innerHTML = '';

        availableJobs.forEach(job => {
            listContainer.innerHTML += `
                <div class="card border rounded-3 p-3 bg-white shadow-sm">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <span class="badge bg-light text-dark border me-1">Order #${job.order_id}</span>
                            <span class="badge bg-success-subtle text-success">READY FOR PICKUP</span>
                        </div>
                        <span class="fw-bold text-success">₹${job.total_amount.toFixed(2)}</span>
                    </div>
                    <div class="my-2 text-dark font-semibold">
                        <i class="fa-solid fa-location-dot text-danger me-1"></i> ${job.delivery_location}
                    </div>
                    <div class="small text-muted mb-3">
                        <strong>Recipient:</strong> ${job.student_name} (${job.student_contact})
                    </div>
                    <button class="btn btn-primary w-100 fw-bold py-2 rounded-3" onclick="acceptJob(${job.order_id})">
                        <i class="fa-solid fa-circle-check me-1"></i> Accept Job
                    </button>
                </div>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

async function acceptJob(orderId) {
    if (!riderAvailable) {
        alert("Please set your status to Available to accept jobs.");
        return;
    }

    try {
        const res = await fetch('/api/delivery/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        const data = await res.json();
        if (data.success) {
            loadDeliveryPortal();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
}

async function verifyOTP() {
    const otp = document.getElementById('otp-input').value;
    const errDiv = document.getElementById('otp-error');
    errDiv.style.display = 'none';

    if (otp.length !== 4 || isNaN(otp)) {
        errDiv.style.display = 'block';
        errDiv.innerText = "Please enter a valid 4-digit code.";
        return;
    }

    try {
        const res = await fetch('/api/delivery/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: activeDelivery.order_id,
                otp: otp
            })
        });
        const data = await res.json();
        if (data.success) {
            alert("Delivery verified and logged successfully!");
            loadDeliveryPortal();
        } else {
            errDiv.style.display = 'block';
            errDiv.innerText = data.message;
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadRiderStats() {
    try {
        const res = await fetch('/api/delivery/stats');
        const stats = await res.json();

        document.getElementById('stat-jobs-count').innerText = stats.count;
        document.getElementById('stat-jobs-earnings').innerText = `₹${stats.earnings.toFixed(2)}`;

        const emptyHistory = document.getElementById('history-empty');
        const historyList = document.getElementById('history-list');

        if (stats.history.length === 0) {
            emptyHistory.style.display = 'block';
            historyList.innerHTML = '';
            return;
        }

        emptyHistory.style.display = 'none';
        historyList.innerHTML = '';

        stats.history.forEach(log => {
            const compTime = log.completed_at ? log.completed_at.split(' ')[1] || log.completed_at : 'Completed';
            historyList.innerHTML += `
                <div class="border-bottom py-2 d-flex justify-content-between align-items-center">
                    <div class="text-truncate" style="max-width: 70%;">
                        <strong class="small d-block text-dark">#${log.order_id} - ${log.delivery_location}</strong>
                        <small class="text-muted">${compTime}</small>
                    </div>
                    <span class="badge bg-success-subtle text-success">+₹20.00</span>
                </div>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

function toggleRiderAvailability() {
    const switchEl = document.getElementById('rider-status-switch');
    const label = document.getElementById('status-switch-label');
    riderAvailable = switchEl.checked;

    if (riderAvailable) {
        label.innerText = "Available for Runs";
        label.className = "form-check-label fw-bold text-success";
    } else {
        label.innerText = "Status: Busy";
        label.className = "form-check-label fw-bold text-danger";
    }
    loadDeliveryPortal();
}

let selectedRiderName = '';

async function initRider() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        
        if (data.logged_in) {
            const user = data.user;
            if (user.role === 'Admin') {
                document.getElementById('admin-rider-select-div').style.display = 'block';
                
                const riderRes = await fetch('/api/admin/rider-list');
                const riderList = await riderRes.json();
                
                const selectEl = document.getElementById('rider-select');
                selectEl.innerHTML = '';
                
                if (riderList.length === 0) {
                    selectEl.innerHTML = `<option value="No Riders Registered">No Riders Registered</option>`;
                    selectedRiderName = "No Riders Registered";
                } else {
                    riderList.forEach((worker, idx) => {
                        const opt = document.createElement('option');
                        opt.value = worker.name;
                        opt.textContent = worker.name;
                        if (idx === 0) opt.selected = true;
                        selectEl.appendChild(opt);
                    });
                    const cached = localStorage.getItem('active_rider_name');
                    if (cached && riderList.some(w => w.name === cached)) {
                        selectEl.value = cached;
                        selectedRiderName = cached;
                    } else {
                        selectedRiderName = riderList[0].name;
                    }
                }
            } else {
                selectedRiderName = user.name;
                document.getElementById('admin-rider-select-div').style.display = 'none';
            }
        } else {
            selectedRiderName = "Guest Rider";
        }
        document.getElementById('active-rider-name').innerText = selectedRiderName;
    } catch(err) {
        console.error(err);
    }
}

function changeActiveRider(val) {
    selectedRiderName = val;
    localStorage.setItem('active_rider_name', val);
    document.getElementById('active-rider-name').innerText = val;
}

document.addEventListener('DOMContentLoaded', () => {
    initRider();
    loadDeliveryPortal();
    setInterval(loadDeliveryPortal, 4000); // Poll status every 4 seconds
});
