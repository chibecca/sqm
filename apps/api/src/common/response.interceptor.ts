import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

/**
 * Wraps successful responses in a consistent envelope.
 * Errors are handled separately by HttpExceptionFilter.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiSuccess<unknown>> {
    const req = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        requestId: req.requestId ?? '',
      })),
    );
  }
}
