import readline from "readline";

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/**
 * Interactive CLI setup wizard for linking the server to an account.
 */
export async function runSetupWizard(): Promise<void> {
    const localSc = modules.getLocalServiceController();

    console.log('\n--- HomeCloud Server Setup ---\n');
    console.log(`Device Name: ${modules.config.DEVICE_NAME}`);
    console.log(`Fingerprint: ${modules.config.FINGERPRINT}\n`);

    const email = await prompt('Enter your email to link this device: ');
    if (!email) {
        console.log('No email provided. Setup cancelled.');
        return;
    }

    try {
        const linkResponse = await localSc.app.linkAccount(email);
        console.log(`\nA verification email has been sent to ${email}.`);

        if (linkResponse.requiresVerification) {
            const code = await prompt('Enter the verification code: ');
            if (!code) {
                console.log('No code provided. Setup cancelled.');
                return;
            }
            await localSc.account.verifyLink(linkResponse.requestId, code);
            console.log('\nAccount linked successfully!\n');
        } else {
            console.log('\nAccount linked successfully!\n');
        }
    } catch (error: any) {
        console.error('\nFailed to link account:', error.message || error);
        console.log('You can try again by restarting the server.');
    }
}
