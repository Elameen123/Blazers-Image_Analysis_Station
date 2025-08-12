// Firebase Configuration and Authentication - Updated for Static Frontend
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getStorage, ref, getDownloadURL, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import { getDatabase, ref as dbRef, child, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

// Use configuration from config.js
const firebaseConfig = window.CONFIG ? window.CONFIG.FIREBASE : {
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

// Authentication helper for static frontend
window.authenticateFirebase = async function() {
    try {
        // In production, you might want to use more secure authentication
        // For now, keeping the existing credentials but they should be moved to a secure method
        const email = "lanre.mohammed23@gmail.com";
        const password = "Wilmar.jr7";
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Firebase authentication successful");
        return userCredential;
    } catch (error) {
        console.error("Firebase authentication failed:", error);
        throw error;
    }
};

// Export Firebase instances for use in other modules
window.firebaseAuth = auth;
window.firebaseStorage = storage;
window.firebaseDatabase = database;
window.firebaseRefs = { 
    ref, 
    getDownloadURL, 
    uploadBytes, 
    dbRef, 
    child, 
    get, 
    update, 
    onValue, 
    signInWithEmailAndPassword 
};

console.log("✅ Firebase configuration loaded successfully");
console.log("🔧 Using config environment:", window.CONFIG?.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION');