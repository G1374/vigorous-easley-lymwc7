# CloudBox Media Vault

A browser-based media vault for authenticated users to upload files, organize them into folders, stream uploaded movies, and listen to uploaded songs.

## Features

- Sign up, log in, and log out with local PBKDF2 password hashing.
- Keep each user's metadata and uploaded file blobs scoped to that user's account.
- Create, rename, and delete folders and files.
- Browse a clear folder hierarchy with a tree view and breadcrumbs.
- Upload multiple files into the currently selected folder with the file picker or drag-and-drop.
- Download uploaded files from their folder row or preview panel.
- Stream common movie formats such as MP4, WEBM, MOV, MKV, and AVI when the browser supports the codec.
- Play common song formats such as MP3, AAC, FLAC, WAV, OGG, and M4A when the browser supports the codec.
- Use built-in media controls for play/pause, seek, and volume.
- Persist file metadata and uploaded file blobs in browser storage.

> Note: this is a local browser implementation. It separates and hides data inside the app by authenticated account, hashes passwords before local storage, and scopes files by user ID. For production-grade security across devices or untrusted clients, connect this UI to a server-side authentication and storage backend. The app does not add an artificial storage limit, but real capacity is controlled by the browser and device quota.

## Development

```bash
npm install
npm start
```

## Production build

```bash
npm run build
```
