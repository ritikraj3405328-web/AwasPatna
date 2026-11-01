// firebase-config.js (FOR USER APP: awaspatna-app)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getFirestore, collection, doc, onSnapshot, addDoc, setDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { 
  getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDy61sPaVpCB6GMd_-Br-PsyhcCu2tI3eA",
  authDomain: "patna-awas.firebaseapp.com",
  projectId: "patna-awas",
  storageBucket: "patna-awas.firebasestorage.app",
  messagingSenderId: "139309352328",
  appId: "1:139309352328:web:82fad83e8679703e33a63d",
  measurementId: "G-076BNKQNR8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
auth.languageCode = 'en';

export { 
  db, auth, collection, doc, onSnapshot, addDoc, setDoc, query, where,
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
};
