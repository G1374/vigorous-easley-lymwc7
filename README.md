# CloudBox Media Vault

A browser-based media vault for authenticated users to upload files, organize them into folders, stream uploaded movies, listen to uploaded songs, and use local AI-style tools to manage a personal library.

## Features

- Sign up, log in, and log out with local PBKDF2 password hashing.
- Keep each user's metadata and uploaded file blobs scoped to that user's account.
- Create, rename, and delete folders and files.
- Browse a clear folder hierarchy with a tree view and breadcrumbs.
- Upload multiple files into the currently selected folder with the file picker or drag-and-drop.
- Download uploaded files from their folder row or preview panel.
- Use the Vault AI Assistant to summarize files, find possible duplicates, list movies/songs, detect large files, suggest folders, create folders, and auto-organize root files by type.
- Stream common movie formats such as MP4, WEBM, MOV, MKV, and AVI when the browser supports the codec.
- Play common song formats such as MP3, AAC, FLAC, WAV, OGG, and M4A when the browser supports the codec.
- Use built-in media controls for play/pause, seek, and volume.
- Install the app as a PWA on Android or PC, or download the generated manifest for packaging experiments.
- Download a JSON vault index backup containing folder/file metadata.
- Persist file metadata and uploaded file blobs in browser storage.

> Note: this is a local browser implementation. It separates and hides data inside the app by authenticated account, hashes passwords before local storage, and scopes files by user ID. For production-grade security across devices or untrusted clients, connect this UI to a server-side authentication and storage backend. The app does not add an artificial storage limit, but real capacity is controlled by the browser and device quota.

## Preview locally

```bash
npm install
npm start
```

Then open the local Parcel URL, usually `http://localhost:1234`.

## Production build

```bash
npm run build
```

## Android and PC download options

- Android: open the app in Chrome and use **Install app** or **Add to Home screen**.
- PC: open the app in Chrome or Edge and use **Install app** or **Create shortcut**.
- The in-app **Download manifest** button exports the generated PWA manifest for packaging experiments.
