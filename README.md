# WEATHER

A brutalist weather journal. Log thoughts, feelings, and observations about the sky with text, images, audio, and files.

## Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. **Authentication** — enable Google sign-in method
3. **Firestore Database** — create in production mode, then set the rules below
4. **Storage** — enable, then set the rules below

### 2. Configure

In Firebase Console → Project Settings → General → Your apps → add a **Web app**.

Copy the config object and paste into `firebase-init.js`, replacing the placeholder values.

### 3. Security Rules

**Firestore:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Storage:**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. Deploy

**Vercel:**

```bash
npx vercel
```

**GitHub Pages:**

Push to a repo and enable Pages from repo settings (source: root of main branch).

**Local dev:**

```bash
python3 -m http.server 8000
```

## Pages

- **Log** (`journal.html`) — write entries with text, photos, audio recordings, file attachments. Auto-records location and timestamp.
- **History** (`history.html`) — browse all entries in reverse chronological order. Expand to view attachments. Delete entries.
- **Map** (`canvas.html`) — arrange entries on a free-form canvas. Create connections between nodes with labels. Double-click to add custom nodes. Right-click to delete.

## Data Model

Each user's data is stored under `users/{uid}/`:

- `entries/{id}` — journal entry with `content`, `location` (lat/lng/alt), `attachments[]`, `createdAt`
- `canvas/default` — mind map state with `nodes[]`, `edges[]`, `pan`, `zoom`

Uploaded files are stored in Firebase Storage under `users/{uid}/`.
