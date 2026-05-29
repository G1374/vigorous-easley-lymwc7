import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const releaseDir = "release";
const androidDir = join(releaseDir, "android-twa");
const appUrl = process.env.APP_URL || "https://your-domain.example";
const appHost = new URL(appUrl).host;

mkdirSync(androidDir, { recursive: true });

const twaManifest = {
  packageId: process.env.ANDROID_PACKAGE_ID || "app.cloudbox.mediavault",
  host: appHost,
  name: "CloudBox Media Vault",
  launcherName: "CloudBox",
  display: "standalone",
  themeColor: "#08111f",
  themeColorDark: "#08111f",
  navigationColor: "#08111f",
  navigationColorDark: "#08111f",
  backgroundColor: "#08111f",
  startUrl: appUrl,
  iconUrl: `${appUrl.replace(/\/$/, "")}/icon.svg`,
  maskableIconUrl: `${appUrl.replace(/\/$/, "")}/icon.svg`,
  appVersionName: "1.0.0",
  appVersionCode: 1,
  signingKey: {
    path: "./android-release.keystore",
    alias: "cloudbox",
  },
  shortcuts: [],
};

writeFileSync(join(androidDir, "twa-manifest.json"), JSON.stringify(twaManifest, null, 2));
writeFileSync(
  join(androidDir, "README.md"),
  `# CloudBox Android APK package\n\nThis folder contains a Bubblewrap/TWA manifest for building an Android APK.\n\n## 1. Host the web app\n\nUpload the built \`dist/\` folder to HTTPS. The APK must point to a real HTTPS URL, not a local file.\n\nCurrent APP_URL used for this manifest:\n\n\`\`\`text\n${appUrl}\n\`\`\`\n\nRegenerate with your deployed URL:\n\n\`\`\`bash\nAPP_URL=https://your-real-domain.com npm run package:android\n\`\`\`\n\n## 2. Build APK with Bubblewrap\n\nInstall Android Studio/Android SDK and Bubblewrap, then run from this folder:\n\n\`\`\`bash\nnpx @bubblewrap/cli init --manifest ./twa-manifest.json\nnpx @bubblewrap/cli build\n\`\`\`\n\nBubblewrap outputs an APK/AAB in the generated Android project.\n`,
);

const zipPath = join(releaseDir, "cloudbox-media-vault-android-twa.zip");
rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", "../cloudbox-media-vault-android-twa.zip", "."], {
  cwd: androidDir,
  stdio: "inherit",
});

const apkGuide = readFileSync("docs/BUILD_APK_AND_PC.md", "utf8");
writeFileSync(join(releaseDir, "BUILD_APK_AND_PC.md"), apkGuide);

console.log(`\nAndroid TWA package created: ${zipPath}`);
console.log("To create the final .apk, deploy dist/ to HTTPS and build the generated TWA package with Android SDK + Bubblewrap.");
