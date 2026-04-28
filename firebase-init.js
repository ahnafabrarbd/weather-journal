// ============================================================
// FIREBASE CONFIGURATION
// Replace these values with your Firebase project credentials.
// See README.md for setup instructions.
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyD9rO22dy9wuIAMKWVulHRO1zjmFAucmis",
    authDomain: "weather-app-31576.firebaseapp.com",
    projectId: "weather-app-31576",
    storageBucket: "weather-app-31576.firebasestorage.app",
    messagingSenderId: "521880129913",
    appId: "1:521880129913:web:d232a2f065cc9425b95fa8",
    measurementId: "G-YBKZ65F9BC"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

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

// --- File handling (base64, stored in Firestore) ---

var MAX_IMAGE_DIM = 1200;
var MAX_FILE_SIZE = 700000; // ~700KB base64 to stay under 1MB doc limit

function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function compressImage(dataUrl, maxDim) {
    return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
            var w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    });
}

async function processFile(file) {
    var dataUrl = await fileToBase64(file);

    // Compress images
    if (file.type.startsWith('image/')) {
        dataUrl = await compressImage(dataUrl, MAX_IMAGE_DIM);
    }

    // Check size
    if (dataUrl.length > MAX_FILE_SIZE) {
        throw new Error('File too large (max ~500KB after compression). Try a smaller file.');
    }

    return { name: file.name, type: file.type, data: dataUrl };
}
