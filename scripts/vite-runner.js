#!/usr/bin/env node

/**
 * Thin wrapper around Vite CLI that polyfills the global crypto API so Vite
 * can run on older Node runtimes (e.g. Node 16 in the sandbox).
 */

const { randomFillSync } = require('crypto');
const { pathToFileURL } = require('url');
const path = require('path');

if (typeof globalThis.crypto !== 'object' || !globalThis.crypto) {
  globalThis.crypto = {};
}

if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = (typedArray) => randomFillSync(typedArray);
}

const nodeCrypto = require('crypto');
if (typeof nodeCrypto.getRandomValues !== 'function') {
  nodeCrypto.getRandomValues = (typedArray) => randomFillSync(typedArray);
}

const vitePkgJson = require.resolve('vite/package.json');
const viteRoot = path.dirname(vitePkgJson);
const viteBin = path.join(viteRoot, 'bin', 'vite.js');

import(pathToFileURL(viteBin)).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
