const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '../..');
const cliDir = __dirname;

const srcTemplates = path.join(rootDir, 'templates');
const destTemplates = path.join(cliDir, 'templates');

const srcAgents = path.join(rootDir, 'AGENTS.md');
const destAgents = path.join(cliDir, 'AGENTS.md');

// Helper to recursively copy directories
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying templates to CLI package...');
if (fs.existsSync(srcTemplates)) {
  if (fs.existsSync(destTemplates)) {
    fs.rmSync(destTemplates, { recursive: true, force: true });
  }
  copyDirSync(srcTemplates, destTemplates);
  console.log('  ✅ Templates copied.');
} else {
  console.error('  ❌ Source templates folder not found at:', srcTemplates);
}

console.log('Copying AGENTS.md to CLI package...');
if (fs.existsSync(srcAgents)) {
  fs.copyFileSync(srcAgents, destAgents);
  console.log('  ✅ AGENTS.md copied.');
} else {
  console.error('  ❌ Source AGENTS.md not found at:', srcAgents);
}

const srcKnowledge = path.join(cliDir, 'src', 'knowledge');
const destKnowledge = path.join(cliDir, 'dist', 'knowledge');

console.log('Copying knowledge base to CLI dist package...');
if (fs.existsSync(srcKnowledge)) {
  if (fs.existsSync(destKnowledge)) {
    fs.rmSync(destKnowledge, { recursive: true, force: true });
  }
  copyDirSync(srcKnowledge, destKnowledge);
  console.log('  ✅ Knowledge base copied.');
} else {
  console.error('  ❌ Source knowledge folder not found at:', srcKnowledge);
}
