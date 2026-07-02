import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const backupsDir = path.join(rootDir, '_backups');

const action = process.argv[2];
const version = process.argv[3];

if (!action || !version) {
    console.error("Usage: node backup-manager.js <save|restore> <version>");
    process.exit(1);
}

const snapshotDir = path.join(backupsDir, `v${version}`);

if (action === 'save') {
    console.log(`[Backup Manager] Saving snapshot v${version}...`);
    
    // 1. Export DB
    console.log("-> Exporting MongoDB database to master-translation-db.json...");
    try {
        execSync("npm run db:export", { stdio: 'inherit', cwd: rootDir });
    } catch (e) {
        console.error("Failed to export DB. Ensure MongoDB is running and script exists.");
        process.exit(1);
    }
    
    if (fs.existsSync(snapshotDir)) {
        console.warn(`Snapshot v${version} already exists. Overwriting...`);
        fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.mkdirSync(path.join(snapshotDir, 'db'));
    fs.mkdirSync(path.join(snapshotDir, 'source_code'));
    
    // Copy DB
    if (fs.existsSync(path.join(rootDir, 'master-translation-db.json'))) {
        fs.copyFileSync(path.join(rootDir, 'master-translation-db.json'), path.join(snapshotDir, 'db', 'master-translation-db.json'));
    }
    
    // Copy Output and Config
    if (fs.existsSync(path.join(rootDir, 'output'))) {
        fs.cpSync(path.join(rootDir, 'output'), path.join(snapshotDir, 'output'), { recursive: true });
    }
    if (fs.existsSync(path.join(rootDir, 'config'))) {
        fs.cpSync(path.join(rootDir, 'config'), path.join(snapshotDir, 'config'), { recursive: true });
    }
    
    // Copy Source Code
    const codeDirs = ['tools', 'scripts', 'dashboard', 'package.json', 'LOCALIZATION_DECISION_LOG.md', 'PROJECT_PLAN.md', 'ARCHITECTURE_REVIEW.md', 'TRANSLATION_ALTERNATIVES.md'];
    for (const item of codeDirs) {
        const srcPath = path.join(rootDir, item);
        if (fs.existsSync(srcPath)) {
            const destPath = path.join(snapshotDir, 'source_code', item);
            if (fs.statSync(srcPath).isDirectory()) {
                fs.cpSync(srcPath, destPath, { recursive: true });
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    
    console.log(`[+] Backup v${version} created successfully at _backups/v${version}`);

} else if (action === 'restore') {
    console.log(`[Backup Manager] Restoring snapshot v${version}...`);
    
    if (!fs.existsSync(snapshotDir)) {
        console.error(`Error: Snapshot v${version} not found at _backups/v${version}`);
        process.exit(1);
    }
    
    // Restore DB
    if (fs.existsSync(path.join(snapshotDir, 'db', 'master-translation-db.json'))) {
        fs.copyFileSync(path.join(snapshotDir, 'db', 'master-translation-db.json'), path.join(rootDir, 'master-translation-db.json'));
    }
    
    // Restore Output and Config
    if (fs.existsSync(path.join(snapshotDir, 'output'))) {
        fs.cpSync(path.join(snapshotDir, 'output'), path.join(rootDir, 'output'), { recursive: true });
    }
    if (fs.existsSync(path.join(snapshotDir, 'config'))) {
        fs.cpSync(path.join(snapshotDir, 'config'), path.join(rootDir, 'config'), { recursive: true });
    }
    
    // Restore Source Code
    const sourceCodePath = path.join(snapshotDir, 'source_code');
    if (fs.existsSync(sourceCodePath)) {
        const items = fs.readdirSync(sourceCodePath);
        for (const item of items) {
            const srcPath = path.join(sourceCodePath, item);
            const destPath = path.join(rootDir, item);
            if (fs.statSync(srcPath).isDirectory()) {
                fs.cpSync(srcPath, destPath, { recursive: true });
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    
    // Run DB migrate
    console.log("-> Restoring MongoDB database...");
    try {
        execSync("npm run db:migrate", { stdio: 'inherit', cwd: rootDir });
    } catch (e) {
        console.error("Failed to restore DB.");
        process.exit(1);
    }
    
    console.log(`[+] System rolled back to v${version} successfully!`);
} else {
    console.error("Invalid action. Use 'save' or 'restore'.");
    process.exit(1);
}
