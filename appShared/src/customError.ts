export enum ErrorType {
  Validation = "Validation",
  Security = "Security",
  Generic = "Generic",
  Coded = "Coded",
}

export enum ErrorCode {
  FS_DRIVER_FETCH = "FS_DRIVER_FETCH",
  STORAGE_FETCH = "STORAGE_FETCH",
  LIMIT_REACHED = "LIMIT_REACHED",
  AGENT_NETWORK = "AGENT_NETWORK",
  ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND",
}

export type ErrorResponse = {
  message: string;
  type: ErrorType;
  code?: ErrorCode;
  fields?: { [key: string]: string[] };
  [key: string]: any;
};

export default class CustomError extends Error {
  data: any = {};
  type: ErrorType = ErrorType.Generic;

  constructor(type: ErrorType = ErrorType.Generic, message: string, data?: any) {
    super(message);
    this.data = data || {};
    this.type = type;
  }

  toObject(includeStack: boolean): ErrorResponse {
    const resp: ErrorResponse = {
      message: this.message,
      type: this.type,
      ...this.data,
    };
    if (includeStack) {
      resp.stack = this.stack;
    }
    return resp;
  }

  static from(e: Error | CustomError | any): CustomError {
    if (e instanceof CustomError) {
      return e;
    }
    const err = new CustomError(ErrorType.Generic, e.message || 'Error');
    err.stack = e.stack;
    return err;
  }

  static validation(
    errors: { [key: string]: string[] },
    message = "Validation error",
  ) {
    return new CustomError(ErrorType.Validation, message, {
      fields: errors,
    });
  }

  static validationSingle(field: string, message: string) {
    return this.validation(
      { [field]: [message] },
      `Validation Error: ${message}`,
    );
  }

  static security(message: string, data?: { [key: string]: any }) {
    return new CustomError(ErrorType.Security, message, data);
  }

  static generic(message: string, data?: { [key: string]: any }) {
    return new CustomError(ErrorType.Generic, message, data);
  }

  static code(code: ErrorCode, message: string, data?: { [key: string]: any }) {
    return new CustomError(ErrorType.Coded, message, {
      code,
      ...data,
    });
  }

  static fromErrorResponse(errorResponse: ErrorResponse) {
    const resp: any = { ...errorResponse };
    delete resp.message;
    delete resp.type;
    return new CustomError(errorResponse.type || ErrorType.Generic, errorResponse.message || 'Error', resp);
  }
}
