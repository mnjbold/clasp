#!/usr/bin/env node
/**
 * GWAS Build Script
 *
 * Compiles TypeScript → Apps Script-compatible JavaScript for every
 * project under gwas/.  Run this before `clasp push` from any directory.
 *
 * Usage:
 *   node gwas/tools/build.mjs              # build all projects
 *   node gwas/tools/build.mjs lib          # build lib only
 *   node gwas/tools/build.mjs modules/04-tasks  # build one module
 */

import { spawnSync } from 'child_process';
import { cpSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const gwasRoot = resolve(__dir, '..');
const tscBin = resolve(gwasRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const ALL_PROJECTS = [
  'lib',
  'modules/01-dashboard',
  'modules/02-calendar',
  'modules/03-meeting-notes',
  'modules/04-tasks',
  'modules/05-projects',
  'modules/06-digest',
  'modules/07-knowledge-base',
  'modules/08-reporting',
  'modules/09-admin-chat-app',
];

const target = process.argv[2];
const projects = target ? [target] : ALL_PROJECTS;

let ok = 0;
let fail = 0;

function copyHtmlAssets(srcDir, distDir) {
  if (!existsSync(srcDir)) return;

  for (const entry of readdirSync(srcDir, {withFileTypes: true})) {
    const srcPath = resolve(srcDir, entry.name);
    const distPath = resolve(distDir, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(distPath, {recursive: true});
      copyHtmlAssets(srcPath, distPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      cpSync(srcPath, distPath);
    }
  }
}

console.log(`\nGWAS Build — ${projects.length} project(s)\n${'─'.repeat(55)}`);

for (const project of projects) {
  const projectDir = resolve(gwasRoot, project);
  const distDir = resolve(projectDir, 'dist');
  const srcDir = resolve(projectDir, 'src');
  const tsconfigPath = resolve(projectDir, 'tsconfig.json');
  const appsscriptSrc = resolve(projectDir, 'appsscript.json');

  if (!existsSync(tsconfigPath)) {
    console.warn(`⚠  Skipping ${project} — no tsconfig.json`);
    continue;
  }

  console.log(`\n▶  ${project}`);

  try {
    // Compile TypeScript → JavaScript into dist/
    // spawnSync does not throw on non-zero exit, so we can distinguish
    // "type errors but JS emitted" from "catastrophic failure (no output)".
    const result = spawnSync(
      'node',
      [tscBin, '--project', tsconfigPath, '--noEmitOnError', 'false'],
      { stdio: 'inherit', cwd: projectDir },
    );

    // Ensure dist/ exists
    mkdirSync(distDir, { recursive: true });

    // Check whether JS files were actually emitted
    const jsFiles = existsSync(distDir)
      ? readdirSync(distDir).filter(f => f.endsWith('.js'))
      : [];

    if (result.status !== 0 && jsFiles.length === 0) {
      // True failure — tsc couldn't produce output at all
      console.error(`❌  ${project} — FAILED (no JS output)`);
      fail++;
      continue;
    }

    // Copy appsscript.json → dist/ so clasp can find the manifest
    if (existsSync(appsscriptSrc)) {
      cpSync(appsscriptSrc, resolve(distDir, 'appsscript.json'));
      console.log(`   copied appsscript.json → dist/`);
    }

    copyHtmlAssets(srcDir, distDir);

    if (result.status !== 0) {
      console.warn(`⚠   ${project} — type warnings (see above), JS emitted OK`);
    } else {
      console.log(`✅  ${project} — built`);
    }
    ok++;
  } catch (err) {
    console.error(`❌  ${project} — FAILED`);
    if (err.stderr) console.error(err.stderr.toString());
    fail++;
  }
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`Build: ${ok} OK, ${fail} failed${fail > 0 ? ' ← fix errors above before clasp push' : ''}`);

if (fail > 0) {
  process.exit(1);
}
