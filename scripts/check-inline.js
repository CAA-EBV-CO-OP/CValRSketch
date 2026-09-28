#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function main() {
  const [input, ...extra] = process.argv.slice(2);
  if (!input || extra.length) throw new Error('Usage: node scripts/check-inline.js <html-file>');

  const html = fs.readFileSync(input, 'utf8');
  const blocks = [];
  // Quoted attribute values may contain >; external scripts are checked separately.
  const scripts = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scripts)) {
    const attributes = match[1].match(/[^\s=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+))?/g) || [];
    if (!attributes.some(attribute => /^src(?:\s*=|$)/i.test(attribute))) {
      blocks.push(match[2]);
    }
  }
  if (!blocks.length) throw new Error(`${input}: no inline script blocks found`);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sketch-inline-'));
  const temporaryFile = path.join(directory, 'inline.js');
  try {
    fs.writeFileSync(temporaryFile, blocks.join('\n;\n'));
    const result = spawnSync(process.execPath, ['--check', temporaryFile], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
    if (process.exitCode === 0) console.log(`${input}: checked ${blocks.length} inline script block(s)`);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    fs.rmdirSync(directory);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
