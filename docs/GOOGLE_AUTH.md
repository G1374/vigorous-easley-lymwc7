# Google Authentication Setup

CloudBox supports optional **Sign in with Google** through Google Identity Services. The app still works with local email/password accounts when Google is not configured.

## 1. Create a Google OAuth web client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Configure the OAuth consent/branding screen for your app.
4. Go to **APIs & Services → Credentials**.
5. Choose **Create credentials → OAuth client ID**.
6. Select **Web application**.
7. Add your preview and production origins under **Authorized JavaScript origins**:
   - `http://localhost:1234` for local Parcel preview.
   - Your deployed HTTPS app URL, for example `https://your-domain.com`.
8. Copy the generated client ID. It looks like:

```text
1234567890-example.apps.googleusercontent.com
```

Google's current Sign in with Google web docs explain that a Google API OAuth 2.0 client ID is required before rendering the button, and the JavaScript API reference documents loading/initializing Google Identity Services from `https://accounts.google.com/gsi/client`. See the official setup guide at <https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid> and JavaScript reference at <https://developers.google.com/identity/gsi/web/reference/js-reference>.

## 2. Add the client ID to CloudBox

Copy the example environment file and set your real client ID:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

Restart the preview server after changing `.env`:

```bash
npm start
```

For production builds, use the same variable:

```bash
GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com npm run build
```

## 3. Preview and test

1. Start the app with `npm start`.
2. Open `http://localhost:1234`.
3. The login screen will show a Google button when `GOOGLE_CLIENT_ID` is set.
4. Click the Google button and choose your Google account.
5. CloudBox creates or links a local account using the returned Google profile email/sub value.

## Security note

This repository is a fully client-side demo. It uses Google Identity Services to get a Google ID token and reads the profile in the browser so the local vault can create a user account. For production security, send the ID token to your backend and verify it server-side before creating a session.
