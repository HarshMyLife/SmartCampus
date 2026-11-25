// Check session and update navbar
window.currentUser = null;

async function checkSession() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        const container = document.getElementById('auth-buttons-container');
        
        // Hide role links by default
        document.getElementById('nav-staff').style.display = 'none';
        document.getElementById('nav-delivery').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';

        if (data.logged_in) {
            window.currentUser = data.user;
            
            // Show links depending on role
            if (window.currentUser.role === 'Staff') {
                document.getElementById('nav-staff').style.display = 'block';
            } else if (window.currentUser.role === 'Delivery') {
                document.getElementById('nav-delivery').style.display = 'block';
            } else if (window.currentUser.role === 'Admin') {
                document.getElementById('nav-staff').style.display = 'block';
                document.getElementById('nav-delivery').style.display = 'block';
                document.getElementById('nav-admin').style.display = 'block';
            }

            // Update auth UI
            container.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    <span class="text-white d-none d-md-inline">Welcome, <strong>${window.currentUser.name}</strong> <span class="badge bg-warning text-dark ms-1">${window.currentUser.role}</span></span>
                    ${window.currentUser.role === 'Student' ? `
                        <div class="bg-light text-dark rounded px-3 py-1 d-flex align-items-center">
                            <i class="fa-solid fa-wallet text-success me-2"></i>
                            <span id="nav-wallet-balance">₹${window.currentUser.wallet_balance.toFixed(2)}</span>
                        </div>
                    ` : ''}
                    <button class="btn btn-outline-warning btn-sm" onclick="logout()"><i class="fa-solid fa-sign-out-alt"></i> Logout</button>
                </div>
            `;
        } else {
            window.currentUser = null;
            const guestWallet = parseFloat(localStorage.getItem('guest_wallet') || '500.00');
            container.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    <div class="bg-light text-dark rounded px-3 py-1 d-flex align-items-center" style="cursor: pointer;" data-bs-toggle="modal" data-bs-target="#topupModal">
                        <i class="fa-solid fa-wallet text-success me-2"></i>
                        <span id="nav-wallet-balance">₹${guestWallet.toFixed(2)}</span>
                    </div>
                    <button class="btn btn-outline-light btn-sm px-4" data-bs-toggle="modal" data-bs-target="#loginModal">
                        <i class="fa-solid fa-sign-in me-1"></i> Admin/Staff Login
                    </button>
                </div>
            `;
        }
    } catch (err) {
        console.error("Session check failed", err);
    }
}

async function logout() {
    const response = await fetch('/api/logout', { method: 'POST' });
    if (response.ok) {
        window.location.href = '/';
    }
}

// Login Handler
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
        // Dismiss modal
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        // reload current page to update states
        window.location.reload();
    } else {
        alert(data.message);
    }
});

// Register Handler
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const role = document.getElementById('reg-role').value;
    const contact = document.getElementById('reg-contact').value;
    const password = document.getElementById('reg-password').value;

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, contact, password })
    });
    const data = await res.json();
    if (data.success) {
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        window.location.reload();
    } else {
        alert(data.message);
    }
});

// Student Prompt Login Handler
const studentLoginForm = document.getElementById('student-login-form');
if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('student-login-email').value;
        const password = document.getElementById('student-login-password').value;

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            const promptModal = bootstrap.Modal.getInstance(document.getElementById('studentLoginPromptModal'));
            if (promptModal) promptModal.hide();
            window.location.reload();
        } else {
            alert(data.message || "Invalid credentials.");
        }
    });
}

function switchToStudentRegister() {
    const promptModal = bootstrap.Modal.getInstance(document.getElementById('studentLoginPromptModal'));
    if (promptModal) promptModal.hide();
    const loginModalEl = document.getElementById('loginModal');
    const loginModal = bootstrap.Modal.getOrCreateInstance(loginModalEl);
    loginModal.show();
    const regTab = document.getElementById('pills-register-tab');
    if (regTab) bootstrap.Tab.getOrCreateInstance(regTab).show();
}

document.addEventListener('DOMContentLoaded', checkSession);
