// build.js
// Runs during Vercel's build step (see vercel.json: buildCommand).
// Copies the whole project into dist/, replacing __FIREBASE_*__ placeholder
// tokens in HTML/JS files with real values from Vercel's environment variables.
// This keeps the actual Firebase config out of your GitHub repo entirely.

const fs = require("fs");
const path = require("path");

const SRC_DIR = __dirname;
const DIST_DIR = path.join(__dirname, "dist");
const SKIP_DIRS = new Set(["dist", "node_modules", ".git", "netlify", "api"]);

const REPLACEMENTS = {
  __FIREBASE_API_KEY__: process.env.FIREBASE_API_KEY,
  __FIREBASE_AUTH_DOMAIN__: process.env.FIREBASE_AUTH_DOMAIN,
  __FIREBASE_PROJECT_ID__: process.env.FIREBASE_PROJECT_ID,
  __FIREBASE_STORAGE_BUCKET__: process.env.FIREBASE_STORAGE_BUCKET,
  __FIREBASE_MESSAGING_SENDER_ID__: process.env.FIREBASE_MESSAGING_SENDER_ID,
  __FIREBASE_APP_ID__: process.env.FIREBASE_APP_ID,
  __FIREBASE_MEASUREMENT_ID__: process.env.FIREBASE_MEASUREMENT_ID,
};

function copyAndReplace(srcPath, destPath) {
  const stat = fs.statSync(srcPath);

  if (stat.isDirectory()) {
    const name = path.basename(srcPath);
    if (SKIP_DIRS.has(name)) return;

    fs.mkdirSync(destPath, { recursive: true });
    for (const entry of fs.readdirSync(srcPath)) {
      copyAndReplace(path.join(srcPath, entry), path.join(destPath, entry));
    }
    return;
  }

  const ext = path.extname(srcPath);
  if (ext === ".html" || ext === ".js") {
    let content = fs.readFileSync(srcPath, "utf8");
    for (const [token, value] of Object.entries(REPLACEMENTS)) {
      if (value === undefined) {
        console.warn(`Warning: env var for ${token} is not set in Vercel.`);
        continue;
      }
      content = content.split(token).join(value);
    }
    fs.writeFileSync(destPath, content);
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
}

// Clean previous build
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR);

for (const entry of fs.readdirSync(SRC_DIR)) {
  if (SKIP_DIRS.has(entry) || entry === "build.js" || entry === "package.json") continue;
  copyAndReplace(path.join(SRC_DIR, entry), path.join(DIST_DIR, entry));
}

console.log("Build complete — output in dist/");
