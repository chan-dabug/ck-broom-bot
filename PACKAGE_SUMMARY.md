# ck Package Summary

![ck-bot](ck-bot.gif)

## What We Built

**ck** ck the broom bot is a complete npm package for cleaning up dead code. It's designed to:

1. **Find Dead Code**: Uses static analysis to identify unreachable files and unused symbols
2. **Archive Safely**: Stores all dead code in MongoDB with rich metadata
3. **Clean Up**: Optionally removes dead code from your codebase
4. **Restore**: Allows you to retrieve archived code when needed

## Package Structure

```
ck/
├── src/
│   └── index.ts          # Main CLI application
├── dist/                 # Built JavaScript files
├── examples/             # Example usage and test project
├── .github/workflows/    # GitHub Actions for automation
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── ck.config.json       # Default configuration
├── README.md            # Comprehensive documentation
├── LICENSE              # MIT license
├── .gitignore           # Git ignore patterns
└── demo.js              # Demo script
```

## Key Features

### 🔍 **Smart Detection**
- **Reachability Analysis**: Builds dependency graphs from entrypoints
- **Symbol Analysis**: Finds unused exports, functions, methods, variables, and classes
- **Confidence Scoring**: Assigns confidence levels to avoid false positives
- **Ignore Patterns**: Automatically excludes tests, types, and generated files

### 📦 **Safe Archiving**
- **MongoDB Storage**: NoSQL database with TTL for automatic cleanup
- **Rich Metadata**: Tracks repository, commit, confidence, and usage patterns
- **Base64 Encoding**: Stores full source code for easy restoration
- **90-Day TTL**: Automatic cleanup of old archives

### 🛡️ **Safety Features**
- **Report Mode**: Default behavior - no files are modified
- **Confidence Threshold**: Configurable minimum confidence (default: 90%)
- **Git Integration**: Works with existing git workflows
- **Backup Strategy**: All code is archived before removal

## Commands

### `ck scan` - Find and Archive Dead Code
```bash
# Report only (safe)
ck scan --entry src/index.tsx

# Apply cleanup (removes dead code)
ck scan --entry src/index.tsx --apply

# Custom confidence threshold
ck scan --entry src/index.tsx --confidence 0.95
```

### `ck restore` - Retrieve Archived Code
```bash
# Restore to console
ck restore 507f1f77bcf86cd799439011

# Restore to file
ck restore 507f1f77bcf86cd799439011 --output restored/function.ts
```

### `ck list` - View Archived Items
```bash
# List all items
ck list

# Filter by type
ck list --type function

# Filter by repository
ck list --repo github.com/org/repo
```

## Installation & Usage

### 1. Install the Package
```bash
npm install ck
```

### 2. Set Up MongoDB
```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/ck"
export CK_DB="ck"
```

### 3. Run Your First Scan
```bash
# Safe report mode
ck scan --entry src/index.tsx

# Apply cleanup
ck scan --entry src/index.tsx --apply
```

## Configuration

Create `ck.config.json` in your project root:

```json
{
  "srcDir": "src",
  "confidence": 0.9,
  "ttlDays": 90,
  "ignorePatterns": [
    "**/*.test.ts",
    "**/*.d.ts",
    "**/__mocks__/**"
  ],
  "entrypoints": [
    "src/index.ts",
    "src/app.tsx"
  ]
}
```

## GitHub Actions Integration

The package includes a complete GitHub Actions workflow that:

- Runs automatically every Monday
- Scans for dead code
- Creates pull requests with cleanup changes
- Archives removed code to MongoDB
- Provides detailed PR descriptions

## MongoDB Schema

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
  range?: {                 // Symbol location
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

## Example Project

The package includes a test project in `examples/test-project/` that demonstrates:

- Unused exported functions
- Unused private functions
- Unused classes and methods
- Unused variables
- How ck identifies and archives them

## Safety Considerations

- **Default Safe**: Runs in report mode by default
- **Confidence Threshold**: Only removes high-confidence dead code
- **Full Archiving**: Everything is stored before removal
- **Git Integration**: Works with version control
- **TTL Cleanup**: Archives automatically expire

## Future Enhancements

- **Language Support**: Python, Java, Go, Rust
- **Advanced Analysis**: Dynamic import detection
- **IDE Integration**: VS Code extension
- **Team Features**: Shared archives and collaboration
- **Metrics**: Dead code analytics and reporting

## Getting Help

- **Documentation**: Comprehensive README.md
- **Examples**: Test project and demo script
- **GitHub Actions**: Automated workflow examples
- **Configuration**: Flexible configuration options

---

**ck** is production-ready and designed to be safe, reliable, and easy to use. It's perfect for teams that want to maintain clean codebases while preserving the ability to restore removed code when needed.
