// Firebase init via CDN modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js';

const firebaseConfig = {
  apiKey: "AIzaSyDLnMnKsYgaL7MfDz97U6PN1vvxDnInyu8",
  authDomain: "saloonbookingsystem-d42a5.firebaseapp.com",
  projectId: "saloonbookingsystem-d42a5",
  storageBucket: "saloonbookingsystem-d42a5.firebasestorage.app",
  messagingSenderId: "740770691725",
  appId: "1:740770691725:web:c5151c6c0f2cfbe01a00c4",
  measurementId: "G-VF9DPWTYPM"
};

try {
  const app = initializeApp(firebaseConfig);
  try { getAnalytics(app); } catch (e) { /* analytics may be blocked in some environments */ }
  console.log('Firebase initialized');
} catch (err) {
  console.warn('Firebase init failed', err);
}
