# ck 🧹

**ck** is a broom bot that archives and cleans dead code. It finds unreachable files, unused exports, methods, and variables, stores them in a NoSQL database for later use, and optionally removes them from your codebase.

## Features

- 🔍 **Static Analysis**: Uses ts-morph for accurate TypeScript/JavaScript analysis
- 📦 **Smart Archiving**: Stores dead code with full metadata in MongoDB
- 🗑️ **Safe Cleanup**: Optionally removes dead code with confidence scoring
- 🔄 **Restore Capability**: Retrieve archived code by ID when needed
- 🛡️ **Safety Rails**: Report-only mode by default, configurable ignore patterns
- 📊 **Rich Metadata**: Tracks repository, commit, confidence, and usage patterns

## Installation

```bash
npm install ck
```

Or install globally:

```bash
npm install -g ck
```

## Quick Start

### 1. Set up MongoDB

You'll need a MongoDB instance. Set your connection string:

```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/ck"
export CK_DB="ck"
```

### 2. Scan for dead code (report only)

```bash
ck scan --project tsconfig.json --entry src/index.tsx
```

### 3. Apply cleanup (removes dead code)

```bash
ck scan --project tsconfig.json --entry src/index.tsx --apply
```

## Commands

### `ck scan` - Find and archive dead code

```bash
ck scan [options]
```

**Options:**
- `--project <tsconfig>` - Path to tsconfig.json (default: tsconfig.json)
- `--entry <file...>` - Entrypoint files to mark as reachable
- `--mongo <uri>` - MongoDB connection URI
- `--db <name>` - Database name (default: ck)
- `--apply` - Apply deletions/edits after archiving
- `--report` - Report only, no edits (default: true)
- `--confidence <n>` - Minimum confidence threshold 0-1 (default: 0.9)
- `--src-dir <dir>` - Source directory to analyze (default: src)

**Examples:**

```bash
# Report only - safe to run
ck scan --entry src/index.tsx

# Apply cleanup - removes dead code
ck scan --entry src/index.tsx --apply

# Custom confidence threshold
ck scan --entry src/index.tsx --confidence 0.95

# Custom source directory
ck scan --entry src/index.tsx --src-dir lib
```

### `ck restore` - Restore archived code

```bash
ck restore <id> [options]
```

**Options:**
- `--output <path>` - Output file path for restored code
- `--mongo <uri>` - MongoDB connection URI
- `--db <name>` - Database name (default: ck)

**Examples:**

```bash
# Restore to console
ck restore 507f1f77bcf86cd799439011

# Restore to file
ck restore 507f1f77bcf86cd799439011 --output restored/oldFunction.ts
```

### `ck list` - List archived items

```bash
ck list [options]
```

**Options:**
- `--mongo <uri>` - MongoDB connection URI
- `--db <name>` - Database name (default: ck)
- `--repo <repo>` - Filter by repository
- `--type <type>` - Filter by item type (file, function, method, variable, class)
- `--limit <n>` - Limit results (default: 50)

**Examples:**

```bash
# List all archived items
ck list

# Filter by type
ck list --type function

# Filter by repository
ck list --repo github.com/org/repo

# Limit results
ck list --limit 10
```

## Configuration

Create a `ck.config.json` file in your project root:

```json
{
  "srcDir": "src",
  "confidence": 0.9,
  "ttlDays": 90,
  "ignorePatterns": [
    "**/*.d.ts",
    "**/*.test.ts",
    "**/*.stories.tsx",
    "**/__mocks__/**"
  ],
  "entrypoints": [
    "src/index.ts",
    "src/app.tsx"
  ],
  "safeDelete": true,
  "backupBeforeDelete": true
}
```

## MongoDB Schema

The package creates a `ck_items` collection with the following structure:

```typescript
interface ArchiveItem {
  _id: ObjectId;
  createdAt: Date;
  expiresAt: Date;          // TTL for automatic cleanup
  repo: string;             // Repository URL
  commit: string;           // Git commit hash
  language: "ts" | "js";   // Source language
  type: "file" | "function" | "method" | "variable" | "class";
  name: string | null;      // Symbol name (null for files)
  path: string;             // File path relative to src
  range?: {                 // Symbol location (for non-files)
    start: { line: number; col: number };
    end: { line: number; col: number };
  };
  reason: "unreachable_file" | "no_refs" | "compiler_unused";
  confidence: number;       // 0.0 to 1.0
  references: Array<{ path: string; line: number }>;
  content: {                // Base64 encoded source code
    kind: "text";
    base64: string;
  };
  note?: string;
}
```

## GitHub Actions Integration

Create `.github/workflows/ck.yml` for automated cleanup:

```yaml
name: ck sweep
on:
  workflow_dispatch:
  schedule:
    - cron: "0 5 * * 1" # Mondays at 5 AM

jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run build
      - env:
          MONGODB_URI: ${{ secrets.CK_MONGODB_URI }}
        run: |
          npx ck scan --entry src/index.tsx --apply
          git config user.name "ck-bot"
          git config user.email "ck-bot@users.noreply.github.com"
          git checkout -b ck/sweep-${{ github.run_id }}
          git add -A
          git commit -m "ck: sweep dead code"
          git push -u origin ck/sweep-${{ github.run_id }}
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "ck: sweep dead code"
          branch: ck/sweep-${{ github.run_id }}
          body: "This PR was created by ck to remove archived dead code."
```

## How It Works

1. **Dependency Analysis**: Builds a dependency graph from your entrypoints
2. **Reachability Check**: Marks files as reachable or unreachable
3. **Symbol Analysis**: Finds unused exports, functions, methods, and variables
4. **Confidence Scoring**: Assigns confidence levels based on analysis quality
5. **Archiving**: Stores dead code with full metadata in MongoDB
6. **Cleanup**: Optionally removes dead code from your codebase

## Safety Features

- **Report Mode**: Default behavior - no files are modified
- **Confidence Threshold**: Only removes code above confidence threshold
- **Ignore Patterns**: Automatically ignores tests, types, and generated files
- **TTL**: Archived items expire after 90 days (configurable)
- **Git Integration**: Works with your existing git workflow

## Supported Languages

Currently supports:
- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)

Future support planned for:
- Python
- Java
- Go
- Rust

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Issues: [GitHub Issues](https://github.com/your-username/ck/issues)
- Discussions: [GitHub Discussions](https://github.com/your-username/ck/discussions)

---

**ck** - Keeping your codebase clean, one sweep at a time! 🧹✨
