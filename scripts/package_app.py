from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
RELEASES = ROOT / "releases"
OUTPUT = RELEASES / "nebula-drive-dashboard.zip"

if not DIST.exists():
    raise SystemExit("dist/ not found. Run build first.")

RELEASES.mkdir(exist_ok=True)

with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED) as zf:
    for file_path in DIST.rglob("*"):
        if file_path.is_file():
            zf.write(file_path, arcname=file_path.relative_to(DIST))

print(f"Created: {OUTPUT}")
