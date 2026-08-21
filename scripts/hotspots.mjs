#!/usr/bin/env node
/**
 * Hotspot analysis: churn x complexity.
 *
 * Complexity tells you what is hard to change. Churn tells you what you
 * actually keep changing. Files high on both axes are where defects
 * concentrate and where refactoring effort pays for itself.
 *
 * Usage:
 *   node scripts/hotspots.mjs [--since="12 months ago"] [--top=25]
 *                             [--include=src] [--json] [--out=file.json]
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const SINCE = argv.since ?? "12 months ago";
const TOP = Number(argv.top ?? 25);
const INCLUDE = String(argv.include ?? "src").split(",");
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs)$/;

// Non-printing separators, so commit metadata can never collide with them.
const REC_SEP = String.fromCharCode(1);
const FIELD_SEP = String.fromCharCode(2);

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const git = (args) =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

// A shallow clone silently truncates the churn axis, which makes every file
// look equally quiet. CI checkouts default to depth 1, so warn loudly.
if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
  console.warn(
    "WARNING: shallow clone - churn is truncated and these rankings are unreliable.\n" +
      "         Run `git fetch --unshallow` first (in CI: actions/checkout with fetch-depth: 0).\n"
  );
}

/* ---------- churn, with rename tracking ---------- */

// Walk history newest -> oldest. When a commit renames a -> b, every older
// reference to `a` belongs to the file we now know as `b`, so we alias it.
function collectChurn() {
  const raw = git([
    "log",
    `--since=${SINCE}`,
    "--no-merges",
    "-M",
    "--numstat",
    "--format=%x01%H%x02%an%x02%aI",
  ]);

  const alias = new Map();
  const resolve = (p) => {
    const seen = new Set();
    while (alias.has(p) && !seen.has(p)) {
      seen.add(p);
      p = alias.get(p);
    }
    return p;
  };

  const stats = new Map();
  const touch = (p) => {
    let s = stats.get(p);
    if (!s) {
      s = {
        commits: new Set(),
        authors: new Set(),
        added: 0,
        removed: 0,
        last: null,
        first: null,
      };
      stats.set(p, s);
    }
    return s;
  };

  let sha = null;
  let author = null;
  let when = null;

  for (const line of raw.split("\n")) {
    if (!line) continue;

    if (line.startsWith(REC_SEP)) {
      [sha, author, when] = line.slice(1).split(FIELD_SEP);
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [addRaw, delRaw, pathField] = parts;

    // Rename forms: "old => new" or "prefix/{old => new}/suffix"
    let from = pathField;
    let to = pathField;
    const braced = pathField.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
    const plain = pathField.match(/^(.*) => (.*)$/);
    if (braced) {
      from = (braced[1] + braced[2] + braced[4]).replace(/\/{2,}/g, "/");
      to = (braced[1] + braced[3] + braced[4]).replace(/\/{2,}/g, "/");
    } else if (plain) {
      from = plain[1];
      to = plain[2];
    }

    const canonical = resolve(to);
    if (from !== to) alias.set(from, canonical);

    const s = touch(canonical);
    s.commits.add(sha);
    s.authors.add(author);
    s.added += Number(addRaw) || 0; // "-" for binary files
    s.removed += Number(delRaw) || 0;
    if (!s.last || when > s.last) s.last = when;
    if (!s.first || when < s.first) s.first = when;
  }

  return stats;
}

/* ---------- cognitive complexity (approximates the SonarSource spec) ---------- */

const FN_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

const LOGICAL = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function analyzeFile(abs) {
  const src = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(
    abs,
    src,
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith(".tsx") || abs.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  );

  let cognitive = 0; // nesting-aware; the ranking axis
  let cyclomatic = 0; // flat branch count; reported for comparison
  let functions = 0;
  let maxNesting = 0;

  const isElseIf = (n) =>
    n.parent && ts.isIfStatement(n.parent) && n.parent.elseStatement === n;

  function visit(node, nesting, fnDepth) {
    if (nesting > maxNesting) maxNesting = nesting;

    if (FN_KINDS.has(node.kind)) {
      functions++;
      const inner = fnDepth === 0 ? 0 : nesting + 1;
      ts.forEachChild(node, (c) => visit(c, inner, fnDepth + 1));
      return;
    }

    switch (node.kind) {
      case ts.SyntaxKind.IfStatement: {
        cyclomatic++;
        // `else if` costs 1 flat; a fresh `if` also pays the nesting penalty
        cognitive += isElseIf(node) ? 1 : 1 + nesting;
        visit(node.expression, nesting, fnDepth);
        if (node.thenStatement) visit(node.thenStatement, nesting + 1, fnDepth);
        if (node.elseStatement) {
          if (ts.isIfStatement(node.elseStatement)) {
            visit(node.elseStatement, nesting, fnDepth);
          } else {
            cognitive += 1; // bare `else`
            visit(node.elseStatement, nesting + 1, fnDepth);
          }
        }
        return;
      }
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.SwitchStatement:
      case ts.SyntaxKind.ConditionalExpression: {
        cyclomatic++;
        cognitive += 1 + nesting;
        ts.forEachChild(node, (c) => visit(c, nesting + 1, fnDepth));
        return;
      }
      case ts.SyntaxKind.CaseClause:
        // switch already charged once; individual cases are free in cognitive
        if (node.statements.length > 0) cyclomatic++;
        break;
      case ts.SyntaxKind.BinaryExpression:
        if (LOGICAL.has(node.operatorToken.kind)) {
          cyclomatic++;
          // A run of the same operator scores once, not once per token.
          const isRunRoot = !(
            node.parent &&
            ts.isBinaryExpression(node.parent) &&
            node.parent.operatorToken.kind === node.operatorToken.kind
          );
          if (isRunRoot) cognitive += 1; // no nesting penalty on booleans
        }
        break;
      case ts.SyntaxKind.LabeledStatement:
        cognitive += 1;
        break;
    }

    ts.forEachChild(node, (c) => visit(c, nesting, fnDepth));
  }

  ts.forEachChild(sf, (c) => visit(c, 0, 0));

  const sloc = src.split("\n").filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).length;

  return { cognitive, cyclomatic: cyclomatic + functions, functions, sloc, maxNesting };
}

/* ---------- combine ---------- */

const churn = collectChurn();
const rows = [];

for (const [rel, s] of churn) {
  if (!SOURCE_RE.test(rel)) continue;
  if (!INCLUDE.some((p) => rel === p || rel.startsWith(p.replace(/\/$/, "") + "/")))
    continue;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue; // deleted files are not hotspots

  let m;
  try {
    m = analyzeFile(abs);
  } catch {
    continue;
  }

  rows.push({
    file: rel,
    commits: s.commits.size,
    authors: s.authors.size,
    linesAdded: s.added,
    linesRemoved: s.removed,
    lastTouched: s.last ? s.last.slice(0, 10) : null,
    ...m,
  });
}

if (rows.length === 0) {
  console.error(
    `No source files matched (since="${SINCE}", include=${INCLUDE.join(",")}).`
  );
  process.exit(1);
}

const maxCommits = Math.max(...rows.map((r) => r.commits));
const maxCognitive = Math.max(...rows.map((r) => r.cognitive));

for (const r of rows) {
  r.churnNorm = r.commits / maxCommits;
  r.complexityNorm = maxCognitive ? r.cognitive / maxCognitive : 0;
  r.score = +(r.churnNorm * r.complexityNorm * 100).toFixed(1);
  r.quadrant =
    r.churnNorm >= 0.5 && r.complexityNorm >= 0.5
      ? "HOTSPOT"
      : r.churnNorm >= 0.5
        ? "churning (simple)"
        : r.complexityNorm >= 0.5
          ? "complex (stable)"
          : "quiet";
}

rows.sort((a, b) => b.score - a.score);

if (argv.out) {
  fs.writeFileSync(String(argv.out), JSON.stringify({ since: SINCE, rows }, null, 2));
}
if (argv.json) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

/* ---------- report ---------- */

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log(`\nHotspots: churn x complexity  (since "${SINCE}", ${rows.length} files)\n`);
console.log(
  pad("", 3) +
    lpad("SCORE", 6) +
    lpad("COMMITS", 9) +
    lpad("COGN", 6) +
    lpad("CYCLO", 7) +
    lpad("SLOC", 6) +
    lpad("AUTH", 6) +
    "  FILE"
);
console.log("-".repeat(96));

rows.slice(0, TOP).forEach((r) => {
  const flag = r.quadrant === "HOTSPOT" ? "!! " : "   ";
  console.log(
    flag +
      lpad(r.score, 6) +
      lpad(r.commits, 9) +
      lpad(r.cognitive, 6) +
      lpad(r.cyclomatic, 7) +
      lpad(r.sloc, 6) +
      lpad(r.authors, 6) +
      "  " +
      r.file
  );
});

const hot = rows.filter((r) => r.quadrant === "HOTSPOT");
console.log("\nQuadrants (relative to the busiest / most complex file in range):");
for (const q of ["HOTSPOT", "churning (simple)", "complex (stable)", "quiet"]) {
  console.log(`  ${pad(q, 20)} ${rows.filter((r) => r.quadrant === q).length}`);
}
if (hot.length) {
  console.log(`\nRefactor here first - high complexity AND actively changing:`);
  for (const r of hot) {
    console.log(`  ${r.file}  (${r.commits} commits, cognitive ${r.cognitive})`);
  }
}
console.log();
