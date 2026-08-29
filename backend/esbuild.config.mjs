// Bundles the Lambda handler into dist/index.mjs (single file, Node 20 ESM
// runtime, `pg` kept external — it ships in the deployment zip's
// node_modules since it has a native-ish binding surface esbuild should not
// try to bundle). Also copies migrations/*.sql into dist/migrations so the
// deployed package can run them without needing the rest of the repo.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [join(here, "src", "handler.ts")],
  outfile: join(distDir, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  external: ["pg-native"],
  sourcemap: false,
  minify: true,
  logLevel: "info",
});

mkdirSync(join(distDir, "migrations"), { recursive: true });
cpSync(join(here, "..", "migrations"), join(distDir, "migrations"), { recursive: true });

console.log("[esbuild] bundle complete ->", distDir);
