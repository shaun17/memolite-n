export class MemoliteClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoliteClientError";
  }
}

export class MemoliteApiError extends MemoliteClientError {
  statusCode: number;
  responseBody: unknown;

  constructor(message: string, statusCode: number, responseBody: unknown) {
    super(message);
    this.name = "MemoliteApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
