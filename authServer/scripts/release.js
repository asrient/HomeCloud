const { execSync } = require('child_process');
const readline = require('readline');

const version = require('../package.json').version;
const tag = `auth-v${version}`;

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
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
    console.log(`\nReleasing ${tag}\n`);

    run('git add package.json');
    run(`git commit -m ${tag}`);
    run(`git tag ${tag}`);

    console.log();
    const yes = await confirm(`Push commit and tag "${tag}" to origin? (y/N) `);
    if (!yes) {
        console.log('Aborted. Commit and tag are local only.');
        return;
    }

    run('git push');
    run(`git push origin ${tag}`);
    console.log(`\nDone! Released ${tag}`);
}

main().catch((err) => {
    console.error('Release failed:', err.message);
    process.exit(1);
});
