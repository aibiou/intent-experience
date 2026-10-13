// hashes.mjs — SHA-256 manifest generation and independent recomputation (E5 §3 / §7).
// Zero dependencies: node:crypto, node:fs, node:path.

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function sha256OfBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function sha256OfFile(filePath) {
  const buf = await readFile(filePath);
  return sha256OfBuffer(buf);
}

// Walk a directory (recursive, sorted for determinism) and return relative-path -> hash entries.
export async function hashTree(rootDir, relBase = '') {
  const entries = [];
  const names = (await readdir(rootDir, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const ent of names) {
    const abs = path.join(rootDir, ent.name);
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      entries.push(...(await hashTree(abs, rel)));
    } else {
      entries.push({ path: rel, hash: await sha256OfFile(abs) });
    }
  }
  return entries;
}

// Write a SHA256SUMS manifest ("<hash>  <relpath>" per line) for every file under outDir.
// The manifest excludes itself — a manifest cannot hash its own final bytes.
export async function writeSha256Sums(outDir) {
  const entries = (await hashTree(outDir)).filter((entry) => entry.path !== 'SHA256SUMS');
  const lines = entries.map((e) => `${e.hash}  ${e.path}`);
  const manifestPath = path.join(outDir, 'SHA256SUMS');
  await writeFile(manifestPath, `${lines.join('\n')}\n`, 'utf8');
  return { manifestPath, entries };
}

// Independently recompute every hash listed in a SHA256SUMS manifest and verify against the files.
// Returns { verified: n, failed: [{path, expected, actual}] }.
export async function verifySha256Sums(manifestPath, rootDir) {
  const text = await readFile(manifestPath, 'utf8');
  const failed = [];
  let verified = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([0-9a-f]{64})\s\s(.+)$/);
    if (!m) {
      failed.push({ path: trimmed, expected: '<malformed>', actual: '<malformed line>' });
      continue;
    }
    const [, expected, relPath] = m;
    const abs = path.join(rootDir, relPath);
    let actual;
    try {
      actual = await sha256OfFile(abs);
    } catch {
      actual = '<file missing>';
    }
    if (actual === expected) verified += 1;
    else failed.push({ path: relPath, expected, actual });
  }
  return { verified, failed };
}
