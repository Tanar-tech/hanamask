import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// tsc does not copy non-.ts files; db.ts resolves schema.sql relative to its own compiled location.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(repoRoot, "src/main/db/schema.sql");
const to = join(repoRoot, "dist/main/db/schema.sql");

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
