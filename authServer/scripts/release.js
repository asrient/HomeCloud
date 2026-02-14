const { execSync } = require('child_process');
const readline = require('readline');

const bumpType = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage: node scripts/release.js <patch|minor|major>');
    process.exit(1);
}

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

function runSilent(cmd) {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function confirm(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}

async function main() {
    const currentVersion = require('../package.json').version;
    run(`npm version --no-git-tag-version ${bumpType}`);
    const newVersion = runSilent('node -p "require(\'./package.json\').version"');
    const tag = `auth-v${newVersion}`;

    console.log(`\n${currentVersion} -> ${newVersion}`);
    const yes = await confirm(`Release ${tag}? (y/N) `);
    if (!yes) {
        console.log('Aborting. Restoring version...');
        run(`npm version --no-git-tag-version ${currentVersion}`);
        console.log('Reverted.');
        return;
    }

    run('git add package.json package-lock.json');
    run(`git commit -m ${tag}`);
    run(`git tag ${tag}`);
    run('git push');
    run(`git push origin ${tag}`);
    console.log(`\nDone! Released ${tag}`);
}

main().catch((err) => {
    console.error('Release failed:', err.message);
    process.exit(1);
});
