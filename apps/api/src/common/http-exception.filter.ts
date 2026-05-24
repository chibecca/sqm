import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? '';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        code = httpStatusToCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        code = (r.code as string) ?? httpStatusToCode(status);
        message = (r.message as string) ?? message;
        details = r.details;
      }
    } else if (exception instanceof Error) {
      // Unexpected error - log full stack but don't leak details to the client
      this.logger.error(`Unhandled exception [${requestId}]: ${exception.message}`, exception.stack);
      message = 'Internal server error';
    }

    const body: ApiErrorBody = {
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
      requestId,
    };

    response.status(status).json(body);
  }
}

function httpStatusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR',
  };
  return map[status] ?? 'ERROR';
}
