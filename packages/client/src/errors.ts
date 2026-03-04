export class AscError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "AscError";
  }
}

export class AscTimeoutError extends AscError {
  constructor(taskId: string, timeoutMs: number) {
    super(
      "TIMEOUT",
      `Task ${taskId} did not complete within ${timeoutMs}ms`,
      408,
      true,
    );
    this.name = "AscTimeoutError";
  }
}
