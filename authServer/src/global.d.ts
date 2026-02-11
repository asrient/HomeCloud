// Extend Express Request interface to include 'ctx'
declare global {
    namespace Express {
        interface Request {
            ctx: Record<string, any>;
        }
    }
}

export {};
