import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");

const targets = [
  { dir: "esm", module: "NodeNext", type: "module" },
  { dir: "cjs", module: "CommonJS", type: "commonjs" },
];

rmSync(dist, { recursive: true, force: true });

for (const target of targets) {
  const outDir = join(dist, target.dir);
  const args = [
    tsc,
    "-p",
    join(root, "tsconfig.build.json"),
    "--outDir",
    outDir,
    "--module",
    target.module,
    "--moduleResolution",
    target.module === "CommonJS" ? "Node10" : "NodeNext",
  ];
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "package.json"), `${JSON.stringify({ type: target.type })}\n`);
}

console.log("build ok: dist/esm e dist/cjs");
