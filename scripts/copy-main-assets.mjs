import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// tsc does not copy non-.ts files; db.ts resolves schema.sql relative to its own compiled location.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaFrom = join(repoRoot, "src/main/db/schema.sql");
const schemaTo = join(repoRoot, "dist/main/db/schema.sql");

mkdirSync(dirname(schemaTo), { recursive: true });
copyFileSync(schemaFrom, schemaTo);

// Electron's sandboxed preload loader can only execute CommonJS, but package.json's
// "type": "module" makes plain .js ambiguous; .cjs makes tsc's CommonJS output unambiguous.
const preloadCompiledPath = join(repoRoot, ".preload-build/preload/index.js");
const preloadCjsPath = join(repoRoot, "dist/preload/index.cjs");
mkdirSync(dirname(preloadCjsPath), { recursive: true });
copyFileSync(preloadCompiledPath, preloadCjsPath);

// electron-builder の files は dist/** しか含めないため、トレイアイコンを dist に置く。
const trayIconFrom = join(repoRoot, "build/icon.png");
const trayIconTo = join(repoRoot, "dist/main/tray-icon.png");
copyFileSync(trayIconFrom, trayIconTo);
