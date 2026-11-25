let lastStatus = null;
let synth = window.speechSynthesis;

// Web Audio API helper to play synthesized chimes
function playChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        // Play a high pleasant double-ding sound
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.start();
        
        // Second tone
        setTimeout(() => {
            osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        }, 150);
        
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        setTimeout(() => {
            osc.stop();
            audioCtx.close();
        }, 600);
    } catch(err) {
        console.warn("Could not play sound synthesized", err);
    }
}

function speakText(text) {
    if (synth && 'speak' in synth) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        synth.speak(utterance);
    }
}

let latestOrderStatus = '';

async function pollOrderStatus() {
    try {
        const res = await fetch(`/api/order/${orderId}`);
        const order = await res.json();
        if (order.success === false) {
            document.getElementById('status-text').innerText = "Order Not Found";
            return;
        }

        latestOrderStatus = order.order_status;

        // Set times/labels
        document.getElementById('order-time').innerText = order.created_at.split(' ')[1] || order.created_at;
        const isCod = order.payment_method && order.payment_method.includes('Cash');
        document.getElementById('order-total').innerText = `₹${order.total_amount.toFixed(2)}${isCod ? ' (Pay via Cash)' : ''}`;

        // Render Items
        const itemsList = document.getElementById('order-items-list');
        itemsList.innerHTML = '';
        order.items.forEach(it => {
            itemsList.innerHTML += `
                <div class="d-flex justify-content-between align-items-center py-2 border-bottom last-border-none">
                    <div>
                        <span class="fw-bold">${it.name}</span>
                        <span class="text-muted small ms-2">x${it.quantity}</span>
                    </div>
                    <span class="fw-semibold">₹${(it.price * it.quantity).toFixed(2)}</span>
                </div>
            `;
        });

        // Handle progress states
        const status = order.order_status;
        let progressPct = 0;
        
        // Adjust step rendering depending on delivery vs pickup
        const isDelivery = order.order_type === 'Delivery';
        const transitStep = document.getElementById('step-transit');
        if (isDelivery) {
            transitStep.classList.remove('d-none');
        } else {
            transitStep.classList.add('d-none');
        }

        // Reset node classes
        document.querySelectorAll('.step-node').forEach(node => {
            const circle = node.querySelector('div');
            circle.classList.remove('bg-success', 'bg-warning', 'bg-secondary');
            circle.classList.add('bg-secondary');
        });

        // Set current node states
        function markActive(nodeId, colorClass) {
            const node = document.getElementById(nodeId);
            if (node) {
                const circle = node.querySelector('div');
                circle.classList.remove('bg-secondary');
                circle.classList.add(colorClass);
            }
        }

        if (status === 'Ordered') {
            progressPct = 5;
            markActive('step-ordered', 'bg-warning');
            document.getElementById('status-text').innerText = "Order Placed. Waiting for Kitchen Acceptance...";
            document.getElementById('cancel-order-btn').style.display = 'block'; // Students can cancel
        } else if (status === 'Cooking') {
            progressPct = isDelivery ? 25 : 33;
            markActive('step-ordered', 'bg-success');
            markActive('step-cooking', 'bg-warning');
            document.getElementById('status-text').innerText = "Kitchen Accepted & Preparing Your Food";
            document.getElementById('cancel-order-btn').style.display = 'block'; // Students can cancel accepted food
        } else if (status === 'Ready') {
            progressPct = isDelivery ? 50 : 66;
            markActive('step-ordered', 'bg-success');
            markActive('step-cooking', 'bg-success');
            markActive('step-ready', 'bg-warning');
            
            if (isDelivery) {
                document.getElementById('status-text').innerText = "Food Ready! Waiting for Rider Assignment";
            } else {
                document.getElementById('status-text').innerText = "Food is Ready! Please collect from counter";
            }
            document.getElementById('cancel-order-btn').style.display = 'none';
        } else if (status === 'In Transit') {
            progressPct = 75;
            markActive('step-ordered', 'bg-success');
            markActive('step-cooking', 'bg-success');
            markActive('step-ready', 'bg-success');
            markActive('step-transit', 'bg-warning');
            document.getElementById('status-text').innerText = "Rider is delivering your food";
            document.getElementById('cancel-order-btn').style.display = 'none';
        } else if (status === 'Delivered') {
            progressPct = 100;
            markActive('step-ordered', 'bg-success');
            markActive('step-cooking', 'bg-success');
            markActive('step-ready', 'bg-success');
            if (isDelivery) markActive('step-transit', 'bg-success');
            markActive('step-delivered', 'bg-success');
            document.getElementById('status-text').innerText = "Delivered successfully. Enjoy!";
            document.getElementById('cancel-order-btn').style.display = 'none';
            
            checkFeedbackSubmitted();
        } else if (status === 'Cancelled') {
            progressPct = 0;
            document.getElementById('status-text').innerText = "Order Cancelled (Refunded to Wallet)";
            document.getElementById('status-text').className = "fw-bold text-danger mb-2";
            document.getElementById('cancel-order-btn').style.display = 'none';
            document.getElementById('feedback-card').style.display = 'none';
        } else {
            document.getElementById('feedback-card').style.display = 'none';
        }

        document.getElementById('status-progress').style.width = `${progressPct}%`;

        // OTP rendering for delivery
        if (isDelivery && status !== 'Delivered' && status !== 'Cancelled') {
            document.getElementById('otp-container').style.display = 'block';
            document.getElementById('otp-code').innerText = order.otp;
        } else {
            document.getElementById('otp-container').style.display = 'none';
        }

        // Rider assignment info
        if (isDelivery && order.rider_id) {
            document.getElementById('rider-container').style.display = 'block';
            // Mock rider name
            document.getElementById('rider-name').innerText = `Rider Assigned: Rohan Delivery`;
        } else {
            document.getElementById('rider-container').style.display = 'none';
        }

        // Queue Position rendering
        if (status === 'Ordered' || status === 'Cooking') {
            const pos = order.queue_position;
            if (pos > 0) {
                document.getElementById('queue-pos-badge').style.display = 'inline-block';
                document.getElementById('queue-pos-text').innerText = pos;
            } else {
                document.getElementById('queue-pos-badge').style.display = 'none';
            }
        } else {
            document.getElementById('queue-pos-badge').style.display = 'none';
        }

        // Trigger notification sound / text-to-speech when status changes to Ready or Delivered
        if (lastStatus && lastStatus !== status) {
            playChime();
            if (status === 'Ready' && !isDelivery) {
                speakText(`Your order number ${orderId} is ready for pickup.`);
            } else if (status === 'Ready' && isDelivery) {
                speakText(`Your order number ${orderId} is ready and waiting for a delivery rider.`);
            } else if (status === 'In Transit') {
                speakText(`Your order number ${orderId} has left the kitchen and is out for delivery.`);
            } else if (status === 'Delivered') {
                speakText(`Your order number ${orderId} has been successfully delivered.`);
            }
        }
        lastStatus = status;

    } catch (err) {
        console.error(err);
    }
}

let currentRating = 0;
let feedbackSubmitted = false;

async function checkFeedbackSubmitted() {
    if (feedbackSubmitted) return;
    try {
        const res = await fetch(`/api/order/${orderId}/feedback`);
        const data = await res.json();
        if (data.success && data.feedback) {
            feedbackSubmitted = true;
            document.getElementById('feedback-card').style.display = 'block';
            document.getElementById('feedback-body').innerHTML = `
                <div class="text-success my-3">
                    <i class="fa-solid fa-circle-check fs-2 mb-2"></i>
                    <h6 class="fw-bold">Thank you for your feedback!</h6>
                    <p class="text-muted small mb-0">You rated this order ${data.feedback.rating} stars.</p>
                </div>
            `;
        } else {
            document.getElementById('feedback-card').style.display = 'block';
        }
    } catch(err) {
        console.error(err);
    }
}

function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll('.star-rating');
    stars.forEach((star, idx) => {
        const icon = star.querySelector('i');
        if (idx < rating) {
            icon.className = 'fa-solid fa-star text-warning';
        } else {
            icon.className = 'fa-regular fa-star text-secondary';
        }
    });
}

async function submitFeedback() {
    if (currentRating === 0) {
        alert("Please choose a star rating first!");
        return;
    }
    const comments = document.getElementById('feedback-comments').value;
    try {
        const res = await fetch(`/api/order/${orderId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: currentRating, comments })
        });
        const data = await res.json();
        if (data.success) {
            feedbackSubmitted = true;
            document.getElementById('feedback-body').innerHTML = `
                <div class="text-success my-3">
                    <i class="fa-solid fa-circle-check fs-2 mb-2"></i>
                    <h6 class="fw-bold">Thank you for your feedback!</h6>
                    <p class="text-muted small mb-0">Your review was submitted successfully.</p>
                </div>
            `;
        } else {
            alert(data.message || "Failed to submit feedback.");
        }
    } catch (err) {
        console.error(err);
    }
}

async function cancelOrder() {
    let confirmMsg = "Are you sure you want to cancel this order?";
    if (latestOrderStatus === 'Cooking') {
        confirmMsg = "The kitchen has already accepted and started preparing your order. If you cancel, your payment will be refunded, and this fresh food will be moved to SDG-2 Food Rescue at 60% OFF for other students to rescue. Confirm cancellation?";
    } else {
        confirmMsg = "Are you sure you want to cancel your order? (Not yet accepted by kitchen, so it will not go to Food Rescue). Your payment will be refunded.";
    }

    if (confirm(confirmMsg)) {
        const guestContact = localStorage.getItem('guest_contact') || '';
        try {
            const res = await fetch(`/api/order/${orderId}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contact: guestContact })
            });
            const data = await res.json();
            if (data.success) {
                // Update local wallet balance if guest
                if (guestContact) {
                    const balRes = await fetch(`/api/wallet/balance?contact=${guestContact}`);
                    const balData = await balRes.json();
                    if (balData.success) {
                        localStorage.setItem('guest_wallet', balData.wallet_balance);
                    }
                }
                alert(data.message);
                pollOrderStatus();
            } else {
                alert(data.message);
            }
        } catch (err) {
            console.error(err);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    pollOrderStatus();
    setInterval(pollOrderStatus, 3000); // Poll status every 3 seconds
});
