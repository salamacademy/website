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
const auth = firebase.auth();

// Upayment Configuration
const UPAYMENT_CONFIG = {
  apiKey: "YOUR_UPAYMENT_API_KEY",
  testMode: true
};

// WhatsApp
const WHATSAPP_NUMBER = "96593000607";
