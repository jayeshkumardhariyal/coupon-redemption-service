class AppError extends Error {
  constructor(message, statusCode, options = {}) {
    super(message);
    this.responseCode = 1;
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.errors = options?.errors || [];

    Error.captureStackTrace(this, this.constructor);
  }
}
export default AppError;
