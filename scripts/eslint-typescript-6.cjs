/* eslint-disable @typescript-eslint/no-require-imports -- Node's --require preload is CommonJS. */
/**
 * Load the TypeScript 6 API for the ESLint toolchain while the app stays on TypeScript 7.
 *
 * TypeScript 7.0 ships a native compiler and no JavaScript API. typescript-eslint
 * (pulled in by eslint-config-next) does `require("typescript")` at import time and
 * throws if that resolves to 7. See:
 * https://github.com/typescript-eslint/typescript-eslint/issues/10940
 *
 * `typescript-6` is an npm alias of `@typescript/typescript6`, which re-exports the
 * TypeScript 6 API. This preload redirects `require("typescript")` from the lint
 * toolchain at that alias. The root `typescript` package stays 7, and `tsc` stays
 * the TypeScript 7 binary (see the `prepare` script).
 *
 * Remove this file, the `typescript-6` dependency, the lint preload, and the
 * `prepare` relink once typescript-eslint supports TypeScript 7.
 */
"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const ts6Entry = require.resolve("typescript-6");
const ts6Root = path.dirname(require.resolve("@typescript/old/package.json"));

const lintToolchainMarkers = [
  `${path.sep}eslint-config-next${path.sep}`,
  `${path.sep}typescript-eslint${path.sep}`,
  `${path.sep}@typescript-eslint${path.sep}`,
  `${path.sep}ts-api-utils${path.sep}`,
];

const originalResolveFilename = Module._resolveFilename;

function isLintToolchain(filename) {
  return lintToolchainMarkers.some((marker) => filename.includes(marker));
}

function resolveTypeScript6Subpath(subpath) {
  const candidate = path.join(ts6Root, subpath);
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  const extensions = [".js", ".json", ".cjs", ".mjs", ".node"];
  for (const extension of extensions) {
    if (fs.existsSync(candidate + extension)) {
      return candidate + extension;
    }
  }

  const indexExtensions = ["index.js", "index.json", "index.cjs", "index.mjs"];
  for (const indexFile of indexExtensions) {
    const indexPath = path.join(candidate, indexFile);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  throw new Error(
    `TypeScript 6 has no module for "typescript/${subpath}" (${candidate}).`,
  );
}

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  const filename = parent && parent.filename;
  if (typeof filename === "string" && isLintToolchain(filename)) {
    if (request === "typescript") {
      return ts6Entry;
    }
    if (request.startsWith("typescript/")) {
      return resolveTypeScript6Subpath(request.slice("typescript/".length));
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
