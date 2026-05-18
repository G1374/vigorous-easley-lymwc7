import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const releaseDir = "release";
const packageDir = join(releaseDir, "cloudbox-media-vault-pc-website");
const appDir = join(packageDir, "app");
const output = join(releaseDir, "cloudbox-media-vault-pc-website.zip");
const legacyOutput = join(releaseDir, "cloudbox-media-vault-pc.zip");

mkdirSync(releaseDir, { recursive: true });
rmSync(packageDir, { recursive: true, force: true });
rmSync(output, { force: true });
rmSync(legacyOutput, { force: true });
mkdirSync(appDir, { recursive: true });

cpSync("dist", appDir, { recursive: true });

writeFileSync(
  join(packageDir, "README-PC-WEBSITE.txt"),
  `CloudBox Media Vault - PC Website Version\n\nThis package contains the production website build of CloudBox Media Vault for PC.\n\nQuick start on Windows:\n1. Extract the ZIP.\n2. Double-click start-cloudbox-windows.bat.\n3. Open http://localhost:4173 in Chrome or Edge.\n4. Use the browser menu to Install app or Create shortcut if you want a desktop icon.\n\nQuick start on Mac/Linux:\n1. Extract the ZIP.\n2. Run ./start-cloudbox-mac-linux.sh.\n3. Open http://localhost:4173 in Chrome or Edge.\n\nManual server command from the app folder:\npython -m http.server 4173\n\nDo not open app/index.html directly with file:// because browser storage, media URLs, and PWA install features work best from http://localhost or HTTPS.\n`,
);

writeFileSync(
  join(packageDir, "start-cloudbox-windows.bat"),
  `@echo off\ncd /d "%~dp0app"\necho Starting CloudBox Media Vault PC website at http://localhost:4173\necho Press Ctrl+C to stop the server.\npy -m http.server 4173 || python -m http.server 4173\npause\n`,
);

writeFileSync(
  join(packageDir, "start-cloudbox-mac-linux.sh"),
  `#!/usr/bin/env sh\nset -eu\ncd "$(dirname "$0")/app"\necho "Starting CloudBox Media Vault PC website at http://localhost:4173"\necho "Press Ctrl+C to stop the server."\npython3 -m http.server 4173 || python -m http.server 4173\n`,
);
chmodSync(join(packageDir, "start-cloudbox-mac-linux.sh"), 0o755);

execFileSync("zip", ["-r", "cloudbox-media-vault-pc-website.zip", "cloudbox-media-vault-pc-website"], {
  cwd: releaseDir,
  stdio: "inherit",
});

console.log(`\nPC website package created: ${output}`);
console.log("Extract the ZIP and run start-cloudbox-windows.bat on Windows or start-cloudbox-mac-linux.sh on Mac/Linux.");
