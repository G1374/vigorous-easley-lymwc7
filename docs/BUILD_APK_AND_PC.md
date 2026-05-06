# Build Android APK and PC install packages

CloudBox is a web/PWA app. That means the same `dist/` build can be installed on Android and PC through supported browsers, and it can also be wrapped into an Android APK with Trusted Web Activity tooling.

## Preview the app

```bash
npm install
npm start
```

Open the Parcel URL, usually `http://localhost:1234`.

## Create a PC package

```bash
npm run package:pc
```

This creates:

```text
release/cloudbox-media-vault-pc.zip
```

Use it in one of these ways:

1. Extract the ZIP and serve it with any static web server.
2. Deploy the extracted files to a website.
3. Open the deployed app in Chrome or Edge and choose **Install app** or **Create shortcut**.

## Create Android APK source package

Android APK builds require Android SDK tooling and a real HTTPS deployment URL. Generate the Android package files with:

```bash
APP_URL=https://your-real-domain.com npm run package:android
```

This creates:

```text
release/cloudbox-media-vault-android-twa.zip
release/BUILD_APK_AND_PC.md
```

Then build the final APK on a machine with Android Studio/Android SDK installed:

```bash
cd release/android-twa
npx @bubblewrap/cli init --manifest ./twa-manifest.json
npx @bubblewrap/cli build
```

Bubblewrap will output an APK/AAB from the generated Android project.

## Why this repo does not directly commit an APK

APK files are compiled binaries and depend on signing keys, Android SDK versions, package IDs, and your final hosted HTTPS domain. Those should be generated in your release environment, not committed to source control.
