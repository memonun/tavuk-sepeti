export { ErrorCode, DEFAULT_HTTP_STATUS } from "@/shared/errors/error-codes";
export {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  InvalidTransitionError,
  ExternalApiError,
} from "@/shared/errors/app-error";
export {
  envelopeOk,
  envelopeErr,
  type ApiResult,
  type EnvelopeOptions,
} from "@/shared/errors/error-envelope";
