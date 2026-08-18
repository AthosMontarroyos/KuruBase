export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = "Authentication is required"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Access is denied"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function badRequest(message: string, details?: Record<string, unknown>): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}
