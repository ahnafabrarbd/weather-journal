// ============================================================
// FIREBASE CONFIGURATION
// Replace these values with your Firebase project credentials.
// See README.md for setup instructions.
// ============================================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// --- Auth helpers ---

function requireAuth(callback) {
    auth.onAuthStateChanged(user => {
        if (user) {
            callback(user);
        } else {
            window.location.href = 'index.html';
        }
    });
}

function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider);
}

function doSignOut() {
    return auth.signOut().then(() => { window.location.href = 'index.html'; });
}

// --- Geolocation ---

function getLocation() {
    return new Promise(resolve => {
        if (!navigator.geolocation) {
            resolve({ latitude: null, longitude: null, altitude: null });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                altitude: pos.coords.altitude,
            }),
            () => resolve({ latitude: null, longitude: null, altitude: null }),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

// --- File upload ---

async function uploadFile(userId, file) {
    const path = 'users/' + userId + '/' + Date.now() + '_' + file.name;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    return { name: file.name, type: file.type, url: url, path: path };
}
