import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const releaseDir = "release";

mkdirSync(releaseDir, { recursive: true });
rmSync(`${releaseDir}/cloudbox-media-vault-1.0.0.tgz`, { force: true });

execFileSync("npm", ["pack", "--pack-destination", releaseDir], {
  stdio: "inherit",
});

console.log(`\nNPM download package created: ${releaseDir}/cloudbox-media-vault-1.0.0.tgz`);
console.log("Install locally with: npm install ./release/cloudbox-media-vault-1.0.0.tgz");
