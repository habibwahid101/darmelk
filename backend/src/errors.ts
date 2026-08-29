export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new ApiError(400, code, message);
export const unauthorized = (message = "Sign in required") =>
  new ApiError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed") =>
  new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found") =>
  new ApiError(404, "not_found", message);
export const conflict = (message: string) =>
  new ApiError(409, "conflict", message);
