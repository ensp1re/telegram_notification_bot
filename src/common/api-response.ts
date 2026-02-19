import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
} from "@nestjs/common";
import { Observable, map } from "rxjs";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { classifyError, errorTypeToHttpStatus } from "./errors";

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export class ApiErrorDetail {
  @ApiProperty({ example: "email" })
  field!: string;

  @ApiProperty({ example: "Invalid email format" })
  message!: string;
}

export class ApiResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: "Tweets fetched successfully" })
  message!: string;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional({ type: [ApiErrorDetail], nullable: true })
  errors?: ApiErrorDetail[] | null;
}

export function ok<T>(data: T, message = "Success"): ApiResponseDto<T> {
  return { success: true, message, data, errors: null };
}

export function fail(
  message: string,
  errors: ApiErrorDetail[] | null = null,
): ApiResponseDto<null> {
  return { success: false, message, data: null, errors };
}

// ---------------------------------------------------------------------------
// Global interceptor — wraps every successful response in the envelope
// ---------------------------------------------------------------------------

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseDto> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === "object" && "success" in data) {
          return data as ApiResponseDto;
        }
        return ok(data);
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Global exception filter — formats every error into the envelope
// ---------------------------------------------------------------------------

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let errors: ApiErrorDetail[] | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message =
          typeof b["message"] === "string"
            ? b["message"]
            : Array.isArray(b["message"])
              ? (b["message"] as string[]).join("; ")
              : String(b["error"] ?? "Request failed");

        if (Array.isArray(b["errors"])) {
          errors = b["errors"] as ApiErrorDetail[];
        }
      }
    } else if (exception instanceof Error) {
      const errorType = classifyError(exception);
      status = errorTypeToHttpStatus(errorType);
      message = exception.message.slice(0, 300);
    }

    this.logger.error(`[${status}] ${message}`);

    response.status(status).json(fail(message, errors));
  }
}
