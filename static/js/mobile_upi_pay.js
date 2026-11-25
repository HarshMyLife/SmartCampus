document.getElementById('mobile-pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('pay-name').value.trim();
    const contact = document.getElementById('pay-contact').value.trim();
    
    if (contact.length < 10 || isNaN(contact)) {
        alert("Please enter a valid 10-digit contact number");
        return;
    }
    
    document.getElementById('status-spinner').style.display = 'block';
    document.querySelector('.btn-pay').disabled = true;
    
    try {
        const res = await fetch(`/api/order/${orderId}/complete-mobile-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, contact })
        });
        
        const data = await res.json();
        if (data.success) {
            document.getElementById('payment-form-section').style.display = 'none';
            document.getElementById('success-section').style.display = 'block';
        } else {
            alert(data.message);
            document.getElementById('status-spinner').style.display = 'none';
            document.querySelector('.btn-pay').disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert("Payment request failed. Try again.");
        document.getElementById('status-spinner').style.display = 'none';
        document.querySelector('.btn-pay').disabled = false;
    }
});
