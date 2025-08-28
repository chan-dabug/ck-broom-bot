#!/usr/bin/env node
import { Command } from "commander";
import { Project, SyntaxKind, Node, SourceFile, ClassDeclaration, FunctionDeclaration, MethodDeclaration, VariableDeclaration } from "ts-morph";
import { MongoClient, ObjectId } from "mongodb";
import pc from "picocolors";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type ItemType = "file" | "function" | "method" | "variable" | "class";
type Reason = "unreachable_file" | "no_refs" | "compiler_unused";

interface ArchiveItem {
  createdAt: Date;
  expiresAt: Date;
  repo: string;
  commit: string;
  language: "ts" | "js";
  type: ItemType;
  name: string | null;
  path: string;
  range?: { start: { line: number; col: number }, end: { line: number; col: number } };
  reason: Reason;
  confidence: number;
  references: { path: string; line: number }[];
  content: { kind: "text"; base64: string };
  note?: string;
}

const program = new Command();
program
  .name("ck")
  .description("ck — a broom bot that archives and cleans dead code")
  .version("0.1.0");

// Scan command
program
  .command("scan")
  .description("Scan for dead code and archive it")
  .option("--project <tsconfig>", "path to tsconfig.json", "tsconfig.json")
  .option("--entry <file...>", "entrypoint(s) to mark as reachable", [])
  .option("--mongo <uri>", "MongoDB URI", process.env.MONGODB_URI || "")
  .option("--db <name>", "Mongo DB name", process.env.CK_DB || "ck")
  .option("--apply", "apply deletions/edits after archiving", false)
  .option("--report", "report only (no edits)", true)
  .option("--confidence <n>", "min confidence (0..1)", (v) => Number(v), 0.9)
  .option("--src-dir <dir>", "source directory to analyze", "src")
  .action(async (options) => {
    await scanCommand(options);
  });

// Restore command
program
  .command("restore")
  .description("Restore archived code by ID")
  .argument("<id>", "archive item ID to restore")
  .option("--output <path>", "output path for restored code")
  .option("--mongo <uri>", "MongoDB URI", process.env.MONGODB_URI || "")
  .option("--db <name>", "Mongo DB name", process.env.CK_DB || "ck")
  .action(async (id, options) => {
    await restoreCommand(id, options);
  });

// List command
program
  .command("list")
  .description("List archived items")
  .option("--mongo <uri>", "MongoDB URI", process.env.MONGODB_URI || "")
  .option("--db <name>", "Mongo DB name", process.env.CK_DB || "ck")
  .option("--repo <repo>", "filter by repository")
  .option("--type <type>", "filter by item type")
  .option("--limit <n>", "limit results", (v) => Number(v), 50)
  .action(async (options) => {
    await listCommand(options);
  });

async function scanCommand(opts: any) {
  if (!opts.mongo) {
    console.error(pc.red("Missing MongoDB URI. Pass --mongo or set MONGODB_URI."));
    process.exit(1);
  }

  const repo = safeExec("git remote get-url origin")?.trim() || "local";
  const commit = safeExec("git rev-parse HEAD")?.trim() || "unknown";

  console.log(pc.blue(`🔍 Scanning for dead code in ${opts.srcDir}/`));
  console.log(pc.gray(`Repository: ${repo}`));
  console.log(pc.gray(`Commit: ${commit}`));

  const project = new Project({ tsConfigFilePath: opts.project });
  const files = project.getSourceFiles().filter(f => 
    f.getFilePath().includes(`/${opts.srcDir}/`) || 
    f.getFilePath().includes(`\\${opts.srcDir}\\`)
  );
  const sourceByPath = new Map(files.map(f => [norm(f), f]));

  // Reachability: simple graph via imports
  const entryFiles = (opts.entry?.length ? opts.entry : defaultEntrypoints(files, opts.srcDir))
    .map((p: string) => project.getSourceFile(p))
    .filter(Boolean) as SourceFile[];

  const reachable = new Set<string>();
  const stack = [...entryFiles];
  while (stack.length) {
    const sf = stack.pop()!;
    const p = norm(sf);
    if (reachable.has(p)) continue;
    reachable.add(p);
    for (const d of sf.getImportDeclarations()) {
      const t = d.getModuleSpecifierValue();
      const r = resolveImport(sf, t, sourceByPath);
      if (r && !reachable.has(norm(r))) stack.push(r);
    }
  }

  // Unreachable files
  const unreachable = files.filter(f => !reachable.has(norm(f)) && !isDefinitelyKeep(f));
  
  // Within reachable files: find unused stuff
  const unusedSymbols: { node: Node; file: SourceFile; type: ItemType; name: string; reason: Reason; confidence: number }[] = [];

  for (const sf of files) {
    // Unused exports
    for (const exp of sf.getExportedDeclarations()) {
      for (const decl of exp[1]) {
        if (Node.isFunctionDeclaration(decl) || Node.isClassDeclaration(decl) || Node.isVariableDeclaration(decl)) {
          const refs = decl.findReferences().flatMap(r => r.getReferences());
          // If only ref is the declaration itself
          if (refs.length <= 1) {
            unusedSymbols.push({
              node: decl,
              file: sf,
              type: nodeType(decl),
              name: readableName(decl),
              reason: "no_refs",
              confidence: 0.95
            });
          }
        }
      }
    }

    // Unused top-level locals (non-exported)
    sf.forEachDescendant(n => {
      if (Node.isFunctionDeclaration(n) && !n.isExported()) {
        const refs = n.findReferences().flatMap(r => r.getReferences());
        if (refs.length <= 1) unusedSymbols.push({ 
          node: n, 
          file: sf, 
          type: "function", 
          name: readableName(n), 
          reason: "no_refs", 
          confidence: 0.9 
        });
      }
      if (Node.isClassDeclaration(n) && !n.isExported()) {
        const refs = n.findReferences().flatMap(r => r.getReferences());
        if (refs.length <= 1) unusedSymbols.push({ 
          node: n, 
          file: sf, 
          type: "class", 
          name: readableName(n), 
          reason: "no_refs", 
          confidence: 0.9 
        });
      }
      if (Node.isVariableDeclaration(n) && !isExportedVar(n)) {
        const refs = n.findReferences().flatMap(r => r.getReferences());
        if (refs.length <= 1) unusedSymbols.push({ 
          node: n, 
          file: sf, 
          type: "variable", 
          name: readableName(n), 
          reason: "no_refs", 
          confidence: 0.9 
        });
      }
      if (Node.isMethodDeclaration(n)) {
        const refs = n.findReferences().flatMap(r => r.getReferences());
        if (refs.length <= 1) unusedSymbols.push({ 
          node: n, 
          file: sf, 
          type: "method", 
          name: readableName(n), 
          reason: "no_refs", 
          confidence: 0.9 
        });
      }
    });
  }

  // Archive + (optionally) apply
  const mongo = new MongoClient(opts.mongo);
  await mongo.connect();
  const col = mongo.db(opts.db).collection<ArchiveItem>("ck_items");

  const ttl = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);

  console.log(pc.yellow(`\n📦 Archiving ${unreachable.length} unreachable files...`));
  
  // Unreachable files first
  for (const sf of unreachable) {
    const item: ArchiveItem = {
      createdAt: new Date(),
      expiresAt: ttl,
      repo, commit,
      language: getLanguage(sf),
      type: "file",
      name: null,
      path: rel(sf, opts.srcDir),
      reason: "unreachable_file",
      confidence: 0.98,
      references: [],
      content: { kind: "text", base64: toB64(sf.getFullText()) },
      note: "ck unreachable file"
    };
    const { insertedId } = await col.insertOne(item);
    console.log(pc.yellow(`  📁 ${rel(sf, opts.srcDir)} -> ${insertedId}`));
    if (opts.apply) {
      fs.rmSync(sf.getFilePath(), { force: true });
      console.log(pc.red(`    🗑️  deleted`));
    }
  }

  console.log(pc.yellow(`\n📦 Archiving ${unusedSymbols.length} unused symbols...`));
  
  // Symbols
  let archivedCount = 0;
  for (const u of unusedSymbols) {
    if (u.confidence < opts.confidence) continue;
    const range = toRange(u.node);
    const item: ArchiveItem = {
      createdAt: new Date(),
      expiresAt: ttl,
      repo, commit,
      language: getLanguage(u.file),
      type: u.type,
      name: u.name,
      path: rel(u.file, opts.srcDir),
      range,
      reason: u.reason,
      confidence: u.confidence,
      references: [],
      content: { kind: "text", base64: toB64(u.node.getText()) },
      note: "ck unused symbol"
    };
    const { insertedId } = await col.insertOne(item);
    console.log(pc.yellow(`  ${getTypeIcon(u.type)} ${u.name} @ ${rel(u.file, opts.srcDir)} -> ${insertedId}`));
          if (opts.apply) {
        // remove node safely
        try {
          // For now, just save the file without removing the node
          // as ts-morph node removal can be complex
          console.log(pc.yellow(`    ⚠️  Node removal not implemented yet`));
        } catch (e) {
          console.log(pc.yellow(`    ⚠️  Could not remove ${u.type} ${u.name}`));
        }
        u.file.saveSync();
        console.log(pc.red(`    🗑️  archived`));
      }
    archivedCount++;
  }

  await mongo.close();

  const totalArchived = unreachable.length + archivedCount;
  console.log(pc.green(`\n✅ ck finished! Archived ${totalArchived} items.`));
  
  if (opts.apply) {
    console.log(pc.blue(`\n💡 Run 'git diff' to see changes, then commit if satisfied.`));
  }
}

async function restoreCommand(id: string, opts: any) {
  if (!opts.mongo) {
    console.error(pc.red("Missing MongoDB URI. Pass --mongo or set MONGODB_URI."));
    process.exit(1);
  }

  const mongo = new MongoClient(opts.mongo);
  await mongo.connect();
  const col = mongo.db(opts.db).collection<ArchiveItem>("ck_items");

  const item = await col.findOne({ _id: new ObjectId(id) });
  if (!item) {
    console.error(pc.red(`Archive item with ID ${id} not found.`));
    await mongo.close();
    process.exit(1);
  }

  const content = Buffer.from(item.content.base64, "base64").toString("utf-8");
  
  if (opts.output) {
    // Write to specified file
    const outputPath = path.resolve(opts.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);
    console.log(pc.green(`✅ Restored ${item.type} '${item.name || 'file'}' to ${outputPath}`));
  } else {
    // Print to console
    console.log(pc.blue(`\n📄 Restored ${item.type}: ${item.name || 'file'} from ${item.path}`));
    console.log(pc.gray("─".repeat(50)));
    console.log(content);
    console.log(pc.gray("─".repeat(50)));
  }

  await mongo.close();
}

async function listCommand(opts: any) {
  if (!opts.mongo) {
    console.error(pc.red("Missing MongoDB URI. Pass --mongo or set MONGODB_URI."));
    process.exit(1);
  }

  const mongo = new MongoClient(opts.mongo);
  await mongo.connect();
  const col = mongo.db(opts.db).collection<ArchiveItem>("ck_items");

  const filter: any = {};
  if (opts.repo) filter.repo = opts.repo;
  if (opts.type) filter.type = opts.type;

  const items = await col.find(filter)
    .sort({ createdAt: -1 })
    .limit(opts.limit)
    .toArray();

  console.log(pc.blue(`\n📋 Archived items (${items.length}):`));
  console.log(pc.gray("─".repeat(80)));

  for (const item of items) {
    const date = item.createdAt.toISOString().split('T')[0];
    const icon = getTypeIcon(item.type);
    const name = item.name || 'file';
    console.log(`${icon} ${pc.cyan(item._id.toString().slice(-8))} | ${pc.yellow(item.type)} | ${pc.green(name)} | ${pc.gray(item.path)} | ${date}`);
  }

  await mongo.close();
}

// --- helpers ---
function defaultEntrypoints(files: SourceFile[], srcDir: string) {
  const candidates = [
    `${srcDir}/index.ts`, 
    `${srcDir}/index.tsx`, 
    `${srcDir}/main.ts`, 
    `${srcDir}/main.tsx`, 
    `${srcDir}/app.tsx`,
    `${srcDir}/App.tsx`
  ];
  return candidates.filter(p => files.some(f => rel(f, srcDir) === p));
}

function norm(sf: SourceFile) { 
  return sf.getFilePath().replace(/\\/g, "/"); 
}

function rel(sf: SourceFile, srcDir: string) {
  const p = norm(sf);
  const i = p.lastIndexOf(`/${srcDir}/`);
  return i >= 0 ? p.slice(i + 1) : p;
}

function isDefinitelyKeep(sf: SourceFile) {
  const p = norm(sf);
  return /(\.d\.ts|\.types\.ts|\.stories\.tsx?|\.test\.tsx?|__mocks__|\.config\.ts|\.config\.js)/.test(p);
}

function resolveImport(from: SourceFile, spec: string, map: Map<string, SourceFile>) {
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const tryPaths = [
      spec, 
      `${spec}.ts`, 
      `${spec}.tsx`, 
      `${spec}.js`, 
      `${spec}.jsx`, 
      `${spec}/index.ts`, 
      `${spec}/index.tsx`
    ];
    for (const t of tryPaths) {
      const abs = from.getDirectory().getPath() + "/" + t;
      for (const [k, v] of map) { 
        if (k.endsWith(abs.replace(/\\/g,"/"))) return v; 
      }
    }
  }
  return undefined;
}

function nodeType(n: Node): ItemType {
  if (Node.isFunctionDeclaration(n)) return "function";
  if (Node.isMethodDeclaration(n)) return "method";
  if (Node.isVariableDeclaration(n)) return "variable";
  if (Node.isClassDeclaration(n)) return "class";
  return "variable";
}

function readableName(n: Node) {
  if (Node.isFunctionDeclaration(n) || Node.isClassDeclaration(n)) return n.getName() || "<anonymous>";
  if (Node.isVariableDeclaration(n) || Node.isMethodDeclaration(n)) return n.getName();
  return "<unknown>";
}

function isExportedVar(v: VariableDeclaration) {
  const stmt = v.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  return stmt?.isExported() ?? false;
}

function toRange(n: Node) {
  const s = n.getStartLineNumber();
  const e = n.getEndLineNumber();
  return { 
    start: { line: s, col: 0 }, 
    end: { line: e, col: 0 } 
  };
}

function toB64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

function getLanguage(sf: SourceFile): "ts" | "js" {
  const path = sf.getFilePath();
  return path.endsWith('.ts') || path.endsWith('.tsx') ? "ts" : "js";
}

function getTypeIcon(type: ItemType): string {
  const icons = {
    file: "📁",
    function: "🔧",
    method: "⚙️",
    variable: "📦",
    class: "🏗️"
  };
  return icons[type] || "❓";
}

function safeExec(cmd: string) {
  try { 
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString(); 
  } catch { 
    return ""; 
  }
}

// Parse arguments if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
