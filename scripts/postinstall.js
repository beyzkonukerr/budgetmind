"use strict";

/**
 * Yerelde better-sqlite3 ikilisinin mevcut Node sürümüyle uyumlu olması için yeniden derlenir.
 * Vercel sunucusuz dağıtımda bu adım atlanır (API yolları SQLite kullanmaz).
 */
if (process.env.VERCEL) {
  process.exit(0);
}

const { execSync } = require("child_process");

try {
  execSync("npm rebuild better-sqlite3", {
    stdio: "inherit",
    shell: true,
    cwd: require("path").join(__dirname, "..")
  });
} catch (_err) {
  console.warn(
    "[postinstall] better-sqlite3 yeniden derlenemedi. Yerelde calistirirken: npm run rebuild:sqlite"
  );
}
