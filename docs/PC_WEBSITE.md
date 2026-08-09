# PC Website Version

CloudBox Media Vault can be generated as a PC website package. This is the best option when you want to run the app on a Windows, macOS, or Linux computer without Android tooling.

## Generate the PC website ZIP

```bash
npm install
npm run package:pc
```

The command builds the production website and creates:

```text
release/cloudbox-media-vault-pc-website.zip
```

## Run on Windows PC

1. Extract `release/cloudbox-media-vault-pc-website.zip`.
2. Open the extracted `cloudbox-media-vault-pc-website` folder.
3. Double-click `start-cloudbox-windows.bat`.
4. Open `http://localhost:4173` in Chrome or Edge.
5. Optional: use the browser menu to choose **Install app** or **Create shortcut** for a desktop icon.

## Run on macOS or Linux PC

```bash
unzip release/cloudbox-media-vault-pc-website.zip
cd cloudbox-media-vault-pc-website
./start-cloudbox-mac-linux.sh
```

Then open `http://localhost:4173`.

## Deploy as a normal website

The static website files are inside:

```text
cloudbox-media-vault-pc-website/app/
```

Upload that `app/` folder to any static web host. For Google auth and PWA install prompts, use HTTPS and add your deployed origin in Google Cloud Console.

## Why a local server is included

Do not open `app/index.html` directly with `file://`. Browser storage, media object URLs, service workers, and PWA install behavior work best from `http://localhost` or HTTPS.
