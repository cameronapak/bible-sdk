// Points the pinned CDN URLs in the docs at the current package version.
// The release workflow runs this after publishing, once jsDelivr serves the new version, and pushes the bump to main.
import { readFileSync, writeFileSync } from "node:fs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string };
const pinned = new RegExp(`${name.replace("/", "\\/")}@\\d+\\.\\d+\\.\\d+[\\w.-]*`, "g");

for (const file of ["index.html", "README.md"]) {
  const text = readFileSync(file, "utf8");
  const next = text.replace(pinned, `${name}@${version}`);
  if (next !== text) writeFileSync(file, next);
}
