// ============================
// CLIENT LOGIN JS
// ============================

let confirmationResult = null;
let recaptchaVerifier = null;

// If already logged in, redirect
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = 'dashboard.html';
  }
});

function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('phoneTab').style.display = tab === 'phone' ? 'block' : 'none';
  document.getElementById('emailTab').style.display = tab === 'email' ? 'block' : 'none';
  hideError();
}

// ========== PHONE OTP ==========
async function sendOTP() {
  const phone = document.getElementById('loginPhone').value.trim();
  if (!phone || phone.length < 8) {
    showError('يرجى إدخال رقم هاتف صحيح');
    return;
  }

  try {
    showLoading(true);

    if (!recaptchaVerifier) {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: 'invisible',
        callback: () => {}
      });
    }

    const fullPhone = '+965' + phone;
    confirmationResult = await auth.signInWithPhoneNumber(fullPhone, recaptchaVerifier);

    document.getElementById('phoneStep1').style.display = 'none';
    document.getElementById('phoneStep2').style.display = 'block';
    showLoading(false);
    showSuccess('تم إرسال رمز التحقق إلى ' + fullPhone);

  } catch (err) {
    showLoading(false);
    console.error(err);
    if (err.code === 'auth/invalid-phone-number') {
      showError('رقم الهاتف غير صحيح');
    } else if (err.code === 'auth/too-many-requests') {
      showError('محاولات كثيرة. يرجى المحاولة لاحقاً');
    } else {
      showError('حدث خطأ. يرجى التواصل معنا عبر الواتساب');
    }
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
  }
}

async function verifyOTP() {
  const code = document.getElementById('otpCode').value.trim();
  if (!code || code.length < 6) {
    showError('يرجى إدخال رمز التحقق المكون من 6 أرقام');
    return;
  }

  try {
    showLoading(true);
    const result = await confirmationResult.confirm(code);
    // Successful login - redirect
    window.location.href = 'dashboard.html';
  } catch (err) {
    showLoading(false);
    if (err.code === 'auth/invalid-verification-code') {
      showError('رمز التحقق غير صحيح');
    } else if (err.code === 'auth/code-expired') {
      showError('انتهت صلاحية الرمز. يرجى طلب رمز جديد');
      backToPhone();
    } else {
      showError('حدث خطأ. يرجى المحاولة مرة أخرى');
    }
  }
}

function backToPhone() {
  document.getElementById('phoneStep1').style.display = 'block';
  document.getElementById('phoneStep2').style.display = 'none';
  document.getElementById('otpCode').value = '';
  confirmationResult = null;
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
  hideError();
}

// ========== EMAIL LOGIN ==========
async function loginWithEmail() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;

  if (!email || !pass) {
    showError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
    return;
  }

  try {
    showLoading(true);
    await auth.signInWithEmailAndPassword(email, pass);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showLoading(false);
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      showError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    } else if (err.code === 'auth/too-many-requests') {
      showError('محاولات كثيرة. يرجى المحاولة لاحقاً');
    } else {
      showError('حدث خطأ في تسجيل الدخول');
    }
  }
}

async function showForgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    showError('يرجى إدخال بريدك الإلكتروني أولاً');
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    showSuccess('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
  } catch (err) {
    showError('حدث خطأ. تأكد من صحة البريد الإلكتروني');
  }
}

// ========== UI HELPERS ==========
function showLoading(state) {
  document.getElementById('loginView').style.display = state ? 'none' : 'block';
  document.getElementById('loadingView').style.display = state ? 'flex' : 'none';
}

function showError(msg) {
  const el = document.getElementById('msgBox');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '#ffebee';
  el.style.color = '#c62828';
  setTimeout(hideError, 5000);
}

function showSuccess(msg) {
  const el = document.getElementById('msgBox');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '#e8f5e9';
  el.style.color = '#2e7d32';
  setTimeout(hideError, 5000);
}

function hideError() {
  const el = document.getElementById('msgBox');
  if (el) el.style.display = 'none';
}

function showTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('phoneTab').style.display = tab === 'phone' ? 'block' : 'none';
  document.getElementById('emailTab').style.display = tab === 'email' ? 'block' : 'none';
  const msgBox = document.getElementById('msgBox');
  if (msgBox) msgBox.style.display = 'none';
}
