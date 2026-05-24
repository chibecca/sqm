import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Validate any request payload against a Zod schema.
 *
 * Use via UsePipes:
 *   @UsePipes(new ZodValidationPipe(MySchema))
 *
 * Or via a decorator factory @Body() decorator alternative; here we just
 * provide the pipe and let controllers compose it.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: formatZodIssues(result.error),
      });
    }
    return result.data;
  }
}

export function formatZodIssues(error: ZodError): Array<{ field: string; issue: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '<root>',
    issue: issue.message,
  }));
}
