// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { 
  getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// APNA FIREBASE CONFIG YAHAN PASTE KAREIN
const firebaseConfig = {
  apiKey: "AIzaSyYourApiKeyHere",
  authDomain: "patna-awas.firebaseapp.com",
  projectId: "patna-awas",
  storageBucket: "patna-awas.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
auth.languageCode = 'en';

export { 
  db, auth, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, orderBy,
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
};
