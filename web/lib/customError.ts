import { ErrorType, ErrorResponse } from './types';

export default class CustomError extends Error {
    data: any = null;
    fields: { [key: string]: string[] } | null = null;
    code: string | null = null;
    type: ErrorType = ErrorType.Generic;

    constructor(type: ErrorType = ErrorType.Generic, message: string, data?: any) {
        super(message);
        if (data) {
            this.fields = data.fields || null;
            this.code = data.code || null;
            delete data.fields;
            delete data.code;
            this.data = data;
        }
        this.type = type;
    }

    static fromErrorResponse(errorResponse: ErrorResponse) {
        const resp: any = { ...errorResponse };
        delete resp.message;
        delete resp.type;
        return new CustomError(errorResponse.type || ErrorType.Generic, errorResponse.message || 'Error', errorResponse);
    }

    static from(e: Error | CustomError | any): CustomError {
        if (e instanceof CustomError) {
            console.log('CustomError.from:', e);
            return e;
        }
        const err = new CustomError(ErrorType.Generic, e.message);
        err.stack = e.stack;
        return err;
    }
}
