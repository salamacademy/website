// ============================
// SALAM ACADEMY - MAIN JS
// ============================

let selectedPackage = null;

function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  menu.classList.toggle('active');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobileMenu');
  const btn = document.querySelector('.mobile-menu-btn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('active');
  }
});

function startSubscription(packageType, price, packageName) {
  selectedPackage = { type: packageType, price, name: packageName };
  document.getElementById('modalPackageName').textContent = packageName;
  document.getElementById('modalPriceDisplay').textContent = price + ' د.ك / شهر';
  document.getElementById('subscribeModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('subscribeModal').style.display = 'none';
  document.body.style.overflow = '';
}

// Close modal clicking overlay
document.addEventListener('click', (e) => {
  if (e.target.id === 'subscribeModal') closeModal();
});

async function submitSubscription(e) {
  e.preventDefault();
  const btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.textContent = 'جاري المعالجة...';

  const formData = {
    childName: document.getElementById('childName').value.trim(),
    parentName: document.getElementById('parentName').value.trim(),
    phone: document.getElementById('phoneNumber').value.trim(),
    email: document.getElementById('email').value.trim(),
    childAge: parseInt(document.getElementById('childAge').value),
    packageType: selectedPackage.type,
    packageName: selectedPackage.name,
    amount: selectedPackage.price,
    status: 'pending_payment',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    subscriptionStart: null,
    subscriptionEnd: null,
    daysRemaining: 0
  };

  try {
    // Save lead to Firestore
    const docRef = await db.collection('subscriptions').add(formData);
    
    // Initiate Upayment
    await initiateUpayment(docRef.id, formData);

  } catch (error) {
    console.error('Error:', error);
    alert('حدث خطأ أثناء المعالجة. يرجى التواصل معنا عبر الواتساب.');
    btn.disabled = false;
    btn.textContent = '💳 الدفع الآن عبر Upayment';
  }
}

async function initiateUpayment(subscriptionId, data) {
  // Upayment API Integration
  // Documentation: https://docs.upayments.com
  const payload = {
    totalPrice: data.amount,
    currency: "KWD",
    customerName: data.parentName,
    customerEmail: data.email,
    customerMobileNumber: "+965" + data.phone.replace(/\D/g, ''),
    title: data.packageName + " - أكاديمية سلام",
    description: "اشتراك " + data.packageName,
    orderId: subscriptionId,
    returnUrl: window.location.origin + "/client/payment-success.html?id=" + subscriptionId,
    cancelUrl: window.location.origin + "/?cancelled=true",
    notificationUrl: "YOUR_FIREBASE_CLOUD_FUNCTION_URL/upayment-webhook",
    reference: {
      id: subscriptionId
    },
    language: "ar",
    // Test card for sandbox: 4111 1111 1111 1111
    isSaved: false
  };

  try {
    const response = await fetch("https://sandboxapi.upayments.com/api/v1/charge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + UPAYMENT_CONFIG.apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (result.status === true && result.data && result.data.link) {
      // Redirect to Upayment checkout
      window.location.href = result.data.link;
    } else {
      throw new Error(result.message || 'Upayment error');
    }
  } catch (err) {
    console.error('Upayment error:', err);
    // Fallback: send WhatsApp message with subscription details
    sendWhatsAppFallback(subscriptionId, data);
  }
}

function sendWhatsAppFallback(subscriptionId, data) {
  const msg = `مرحباً، أريد الاشتراك في أكاديمية سلام
  
الباقة: ${data.packageName}
اسم الطفل: ${data.childName}
اسم ولي الأمر: ${data.parentName}
العمر: ${data.childAge} سنة
المبلغ: ${data.amount} د.ك

رقم الطلب: ${subscriptionId}`;

  window.open('https://wa.me/96593000607?text=' + encodeURIComponent(msg), '_blank');
  closeModal();
  showSuccessMessage();
}

function showSuccessMessage() {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #4CAF50; color: white; padding: 16px 28px;
    border-radius: 12px; font-family: Tajawal,sans-serif;
    font-size: 1rem; font-weight: 600; z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2); direction: rtl;
  `;
  div.textContent = '✅ تم إرسال طلبك! سيتواصل معك فريقنا قريباً.';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

// Scroll animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.package-card, .sport-card, .why-card, .contact-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});
