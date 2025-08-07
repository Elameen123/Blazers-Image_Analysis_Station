// Firebase Configuration and Authentication
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getStorage, ref, getDownloadURL, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import { getDatabase, ref as dbRef, child, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6c_4j2Zw33NdlP2jSbIp0ySHGSmpluQ8",
  authDomain: "blazers-rovers-sample-database.firebaseapp.com",
  projectId: "blazers-rovers-sample-database",
  storageBucket: "blazers-rovers-sample-database.appspot.com",
  messagingSenderId: "464730486363",
  appId: "1:464730486363:web:78ccfde176cea53e21317e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const database = getDatabase(app);

// Export Firebase instances for use in other modules
window.firebaseAuth = auth;
window.firebaseStorage = storage;
window.firebaseDatabase = database;
window.firebaseRefs = { ref, getDownloadURL, uploadBytes, dbRef, child, get, update, onValue, signInWithEmailAndPassword };

console.log("Firebase configuration loaded successfully");


