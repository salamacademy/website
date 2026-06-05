// ============================
// ADMIN LOGIN JS
// ============================

auth.onAuthStateChanged(async (user) => {
  if (user) {
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (adminDoc.exists) {
      window.location.href = 'dashboard.html';
    }
  }
});

async function adminLogin() {
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPassword').value;

  if (!email || !pass) {
    showError('يرجى إدخال البريد وكلمة المرور');
    return;
  }

  document.getElementById('loginView').style.display = 'none';
  document.getElementById('loadingView').style.display = 'flex';

  try {
    const cred = await auth.signInWithEmailAndPassword(email, pass);

    // Verify admin role
    const adminDoc = await db.collection('admins').doc(cred.user.uid).get();
    if (!adminDoc.exists) {
      await auth.signOut();
      document.getElementById('loginView').style.display = 'block';
      document.getElementById('loadingView').style.display = 'none';
      showError('ليس لديك صلاحية الوصول للوحة الإدارة');
      return;
    }

    window.location.href = 'dashboard.html';

  } catch (err) {
    document.getElementById('loginView').style.display = 'block';
    document.getElementById('loadingView').style.display = 'none';
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      showError('بيانات الدخول غير صحيحة');
    } else {
      showError('حدث خطأ: ' + err.message);
    }
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '#ffebee';
  el.style.color = '#c62828';
}

// Allow Enter key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') adminLogin();
});
