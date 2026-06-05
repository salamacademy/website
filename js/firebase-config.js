// Firebase Configuration - Replace with your actual Firebase project config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Upayment Configuration
const UPAYMENT_CONFIG = {
  apiKey: "YOUR_UPAYMENT_API_KEY",
  // Test mode: true for sandbox, false for production
  testMode: true
};

// WhatsApp Configuration
const WHATSAPP_NUMBER = "96593000607";
const ACADEMY_NAME = "أكاديمية سلام";
