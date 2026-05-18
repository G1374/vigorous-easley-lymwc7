# CloudBox Media Vault

A browser-based media vault for authenticated users to upload files, organize them into folders, stream uploaded movies, listen to uploaded songs, and use local AI-style tools to manage a personal library.

## Features

- Sign up, log in, and log out with local PBKDF2 password hashing.
- Optionally enable Sign in with Google by adding a Google OAuth web client ID.
- Keep each user's metadata and uploaded file blobs scoped to that user's account.
- Create, rename, and delete folders and files.
- Browse a clear folder hierarchy with a tree view and breadcrumbs.
- Upload multiple files into the currently selected folder with the file picker or drag-and-drop.
- Download uploaded files from their folder row or preview panel.
- Use the dashboard cockpit to monitor storage, media mix, recent activity, and AI health for the signed-in account.
- Use the Vault AI Assistant to summarize files, smart-search names/folders/extensions, find possible duplicates, list movies/songs, detect large files, generate cleanup plans, build watch/listen queues, run local security scans, suggest folders, create folders, and auto-organize root files by type.
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

Then open the local Parcel URL, usually `http://localhost:1234`. After signing in, the top dashboard shows storage, library totals, AI cleanup count, media mix bars, recent activity, and local health checks.

## Enable Google auth

Create a Google OAuth 2.0 **Web application** client ID in Google Cloud Console, add `http://localhost:1234` as an authorized JavaScript origin for preview, then configure the app with:

```bash
cp .env.example .env
# edit .env and set GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
npm start
```

See `docs/GOOGLE_AUTH.md` for the full setup and security notes.

## Download this app

Use these commands to generate downloadable packages:

```bash
npm run package:pc       # creates release/cloudbox-media-vault-pc.zip
npm run package:npm      # creates release/cloudbox-media-vault-1.0.0.tgz
APP_URL=https://your-real-domain.com npm run package:android
```

The Android command creates a Trusted Web Activity source ZIP. Building a final signed APK requires Android SDK/Bubblewrap, a signing key, and your deployed HTTPS app URL.

## Production build

```bash
npm run build
```


## NPM download package

Create a downloadable npm tarball with:

```bash
npm run package:npm
```

This creates:

```text
release/cloudbox-media-vault-1.0.0.tgz
```

Install that package locally in another project or folder with:

```bash
npm install ./release/cloudbox-media-vault-1.0.0.tgz
```

The npm tarball includes the built `dist/` app plus source, docs, and packaging scripts.

## Android and PC download options

- Android PWA: open the app in Chrome and use **Install app** or **Add to Home screen**.
- PC PWA: open the app in Chrome or Edge and use **Install app** or **Create shortcut**.
- PC ZIP package: run `npm run package:pc` to create `release/cloudbox-media-vault-pc.zip`.
- Android APK source package: run `APP_URL=https://your-real-domain.com npm run package:android` to create `release/cloudbox-media-vault-android-twa.zip`, then build the final APK with Android SDK + Bubblewrap.
- The in-app **Download manifest** button exports the generated PWA manifest for packaging experiments.

See `docs/BUILD_APK_AND_PC.md` for full APK and PC packaging instructions.
