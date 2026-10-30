// Firebase Configuration - Salam Academy
const firebaseConfig = {
  apiKey: "AIzaSyBMv-AIUyCGiLiXzuXEm80HMqaI4gjnnyI",
  authDomain: "salam-5e6f2.firebaseapp.com",
  projectId: "salam-5e6f2",
  storageBucket: "salam-5e6f2.firebasestorage.app",
  messagingSenderId: "482437951824",
  appId: "1:482437951824:web:626e3984b0d212fdf5fc55"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
db.settings({ experimentalAutoDetectLongPolling: true }); // keeps Firestore working on iPhone/mobile networks that block streaming
const auth = firebase.auth ? firebase.auth() : null;

// UPayment — the API key lives ONLY in Cloud Functions (never in the browser).
// After `firebase deploy --only functions`, paste the functions base URL here:
const PAYMENT_API_URL = "https://europe-west1-salam-5e6f2.cloudfunctions.net"; // e.g. https://europe-west1-salam-5e6f2.cloudfunctions.net

// WhatsApp
const WHATSAPP_NUMBER = "96593000607";

// Web Push (FCM) — optional. Firebase Console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair
const FCM_VAPID_KEY = "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE";
