export class EmailService {
    private static instance: EmailService;

    private constructor() {}

    public static getInstance(): EmailService {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }

    public sendEmail(email: string, text: string): void {
        // Dummy implementation
        console.log(`Sending email to ${email} with text: "${text}"`);
    }

    public async setup() {
        // Setup email service (e.g., configure SMTP settings)
        console.log('Email service is up.');
    }
}

export default EmailService.getInstance();
