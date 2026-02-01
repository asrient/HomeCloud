import { EmailClient, EmailMessage } from "@azure/communication-email";
import { AZ_CS_CONNECTION_STRING, AZ_CS_SENDER, IS_DEV } from "./config";

export class EmailService {
    private static instance: EmailService;
    private client: EmailClient | null = null;
    private senderAddress: string = "";

    private constructor() { }

    public static getInstance(): EmailService {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }

    public async sendEmail(email: string, subject: string, text: string, html?: string): Promise<void> {
        if (!this.client || IS_DEV) {
            console.log(`[EmailService] Email to: ${email}`);
            console.log(`[EmailService] Subject: ${subject}`);
            console.log(`[EmailService] Text: ${text}`);
            if (html) console.log(`[EmailService] HTML: ${html}`);
        }

        if (!this.client) {
            return;
        }

        const message: EmailMessage = {
            senderAddress: this.senderAddress,
            content: {
                subject,
                plainText: text,
                ...(html && { html }),
            },
            recipients: {
                to: [{ address: email }],
            },
        };

        try {
            // No need to poll for now.
            const poller = await this.client.beginSend(message);
            // const response = await poller.pollUntilDone();
            // console.log(`Email sent successfully. Message ID: ${response.id}`);
        } catch (error) {
            console.error("Failed to send email:", error);
            throw error;
        }
    }

    public async setup(): Promise<void> {
        if (AZ_CS_CONNECTION_STRING && AZ_CS_SENDER) {
            this.client = new EmailClient(AZ_CS_CONNECTION_STRING);
            this.senderAddress = AZ_CS_SENDER;
            console.log("Azure Communication Service is set up.");
        } else {
            console.warn('Warning: Emails will be logged to console only.');
        }
    }
}

export default EmailService.getInstance();
