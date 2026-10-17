#!/usr/bin/env node
/**
 * Installs (or updates) the Art Factory kit into a Next.js project.
 *
 *   node install.mjs <project folder> [--dry-run] [--force]
 *
 * What it does, and never more:
 * - copies the kit's code to <project>/lib/art-factory/ (always replaced: it
 *   is kit code, so change it in AgentMax, not in the project);
 * - copies the admin pages and API routes into <project>/app/ (an existing
 *   file is left alone unless --force);
 * - adds art-factory.config.ts and art/art-catalogue.json if the project has
 *   none (never overwrites; they belong to the project);
 * - adds the variable NAMES the kit needs to .env.example (never values);
 * - adds @upstash/redis, aws4fetch and sharp to package.json if missing;
 * - makes sure tsconfig.json has the "@/*" path the files import with.
 *
 * Projects with a src/ folder get everything under src/. No network, no
 * npm install: it tells you to run that.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kit = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const force = args.includes("--force");
const target = args.find((one) => !one.startsWith("--"));
if (!target) {
  console.log("Usage: node install.mjs <project folder> [--dry-run] [--force]");
  process.exit(1);
}
const project = path.resolve(target);
const said = [];
const note = (line) => said.push(line);

const pkgPath = path.join(project, "package.json");
if (!existsSync(pkgPath)) {
  console.error(`No package.json in ${project}. The kit needs a Next.js project (App Router). Make one first, then run this again.`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
if (!deps.next) note("⚠ This project does not list next in package.json. The kit's pages and routes are for Next.js (App Router); the lib/ code works anywhere.");

const useSrc = existsSync(path.join(project, "src", "app"));
const base = useSrc ? path.join(project, "src") : project;
const rel = (file) => path.relative(project, file).replace(/\\/g, "/");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function copy(from, to, { replace, owned = false }) {
  if (existsSync(to) && !replace) {
    note(`kept   ${rel(to)} ${owned ? "(the project's own; never replaced)" : "(already there; --force to replace)"}`);
    return;
  }
  note(`${existsSync(to) ? "update" : "add   "} ${rel(to)}`);
  if (!dry) {
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
  }
}

// 1. The kit's code: always replaced.
for (const file of walk(path.join(kit, "lib", "art-factory"))) copy(file, path.join(base, "lib", "art-factory", path.relative(path.join(kit, "lib", "art-factory"), file)), { replace: true });
const version = JSON.parse(readFileSync(path.join(kit, "package.json"), "utf8")).version;
if (!dry) writeFileSync(path.join(base, "lib", "art-factory", "KIT_VERSION"), `${version}\nInstalled from MaxDuderino/AgentMax starter/kits/art-factory. Do not edit here: change the kit in AgentMax and reinstall.\n`);

// 2. Pages and routes: kept if the project already has them.
for (const file of walk(path.join(kit, "app"))) copy(file, path.join(base, "app", path.relative(path.join(kit, "app"), file)), { replace: force });

// 3. The project's own config and catalogue: only if absent.
copy(path.join(kit, "art-factory.config.ts"), path.join(base, "art-factory.config.ts"), { replace: false, owned: true });
copy(path.join(kit, "art", "art-catalogue.json"), path.join(base, "art", "art-catalogue.json"), { replace: false, owned: true });

// 4. Variable names, never values.
const envExample = path.join(project, ".env.example");
const wanted = readFileSync(path.join(kit, ".env.example"), "utf8");
const have = existsSync(envExample) ? readFileSync(envExample, "utf8") : "";
const missing = wanted
  .split(/\r?\n/)
  .map((line) => /^#?\s*([A-Z][A-Z0-9_]*[A-Za-z0-9]*)=/.exec(line)?.[1])
  .filter((name) => name && !new RegExp(`^#?\\s*${name}=`, "m").test(have));
if (missing.length) {
  note(`add    ${missing.length} variable names to .env.example (${missing.join(", ")})`);
  // Only the lines for names the file does not have yet, so a project that already lists some never gets them twice.
  const lines = wanted.split(/\r?\n/).filter((line) => {
    const name = /^#?\s*([A-Z][A-Z0-9_]*[A-Za-z0-9]*)=/.exec(line)?.[1];
    return name ? missing.includes(name) : false;
  });
  const block = ["# Art factory: names only, never values (Key Keeper).", ...lines].join("\n");
  if (!dry) writeFileSync(envExample, `${have.replace(/\s*$/, "")}${have ? "\n\n" : ""}${block}\n`);
} else note("kept   .env.example (already lists every name)");

// 5. Dependencies.
const kitDeps = JSON.parse(readFileSync(path.join(kit, "package.json"), "utf8")).dependencies;
const added = Object.entries(kitDeps).filter(([name]) => !deps[name]);
if (added.length) {
  pkg.dependencies = { ...(pkg.dependencies ?? {}), ...Object.fromEntries(added) };
  note(`add    ${added.map(([name, v]) => `${name}@${v}`).join(", ")} to package.json`);
  if (!dry) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

// 6. The "@/*" import path.
const tsPath = path.join(project, "tsconfig.json");
if (existsSync(tsPath)) {
  const text = readFileSync(tsPath, "utf8");
  if (!/"@\/\*"/.test(text)) {
    try {
      const ts = JSON.parse(text);
      ts.compilerOptions = { ...(ts.compilerOptions ?? {}), paths: { ...(ts.compilerOptions?.paths ?? {}), "@/*": [useSrc ? "./src/*" : "./*"] } };
      note('add    "@/*" path to tsconfig.json');
      if (!dry) writeFileSync(tsPath, `${JSON.stringify(ts, null, 2)}\n`);
    } catch {
      note('⚠ tsconfig.json has comments, so it was not edited. Add  "paths": { "@/*": ["./*"] }  under compilerOptions yourself.');
    }
  }
} else note('⚠ No tsconfig.json. The kit is TypeScript; add one with  "paths": { "@/*": ["./*"] }.');

console.log(`${dry ? "Would install" : "Installed"} Art Factory kit ${version} into ${project}${useSrc ? " (src/ layout)" : ""}:\n`);
for (const line of said) console.log(`  ${line}`);
console.log(`\nNext: npm install, fill in art-factory.config.ts (name, prefix), then open /admin/art-factory. Set the variables in .env.example on Vercel before going live.`);
