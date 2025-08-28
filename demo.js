#!/usr/bin/env node

/**
 * Demo script for the ck package
 * This shows how to use ck programmatically
 */

import { MongoClient } from 'mongodb';

// Example usage of ck package
console.log('🧹 ck - Dead Code Cleanup Bot Demo\n');

console.log('📋 Available Commands:');
console.log('  ck scan --entry src/index.tsx --report');
console.log('  ck scan --entry src/index.tsx --apply');
console.log('  ck restore <id> --output path/to/file');
console.log('  ck list --type function\n');

console.log('🔧 Setup Required:');
console.log('  1. Set MONGODB_URI environment variable');
console.log('  2. Ensure your project has a tsconfig.json');
console.log('  3. Run: npm install ck\n');

console.log('💡 Example Workflow:');
console.log('  1. Scan for dead code: ck scan --entry src/index.tsx');
console.log('  2. Review what would be removed');
console.log('  3. Apply cleanup: ck scan --entry src/index.tsx --apply');
console.log('  4. Restore if needed: ck restore <id> --output restored.ts\n');

console.log('🚀 Try it out:');
console.log('  npx ck scan --entry src/index.tsx --report');
console.log('  npx ck scan --entry src/index.tsx --apply');
console.log('  npx ck list');

console.log('\n✨ ck - Keeping your codebase clean!');
