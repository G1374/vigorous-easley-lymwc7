import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const releaseDir = "release";
const output = join(releaseDir, "cloudbox-media-vault-pc.zip");

mkdirSync(releaseDir, { recursive: true });
rmSync(output, { force: true });

execFileSync("zip", ["-r", "../release/cloudbox-media-vault-pc.zip", "."], {
  cwd: "dist",
  stdio: "inherit",
});

console.log(`\nPC package created: ${output}`);
console.log("Open the extracted index.html with a local web server, or deploy the folder and install it as a PWA in Chrome/Edge.");
