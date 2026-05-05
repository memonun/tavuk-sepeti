/**
 * Result<T, E> — discriminated union for fallible operations.
 *
 * Domain and application layers return `Result` rather than throwing. Throwing
 * is reserved for programmer errors (invariants, parse failures from trusted
 * sources). Anything that can fail in normal operation — DB, external API,
 * user input — becomes an `Err`.
 *
 * Reads as values: callers pattern-match instead of writing try/catch trees.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

// ---- Constructors -----------------------------------------------------------

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// ---- Predicates -------------------------------------------------------------

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

// ---- Combinators ------------------------------------------------------------

/** Transform the success value; pass errors through unchanged. */
export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Transform the error; pass success through unchanged. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/** Chain a fallible operation. The classic monadic bind. */
export function andThen<T, U, E>(
  r: Result<T, E>,
  fn: (v: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

/** Async version of `andThen`. */
export async function andThenAsync<T, U, E>(
  r: Result<T, E>,
  fn: (v: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> {
  return r.ok ? await fn(r.value) : r;
}

// ---- Extraction -------------------------------------------------------------

/** Throw if `Err`. Use only at boundaries where failure is unrecoverable. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new UnwrapError(r.error);
}

/** Return success value or fall back. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Pattern-match. */
export function match<T, E, A, B>(
  r: Result<T, E>,
  branches: { ok: (v: T) => A; err: (e: E) => B },
): A | B {
  return r.ok ? branches.ok(r.value) : branches.err(r.error);
}

// ---- Boundary helpers -------------------------------------------------------

/** Wrap a throwing sync function. Use at the edges (DB drivers, fs, JSON). */
export function trySync<T, E = unknown>(
  fn: () => T,
  onError: (e: unknown) => E = (e) => e as E,
): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    return err(onError(e));
  }
}

/** Wrap a throwing async function. */
export async function tryAsync<T, E = unknown>(
  fn: () => Promise<T>,
  onError: (e: unknown) => E = (e) => e as E,
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(onError(e));
  }
}

// ---- Internal ---------------------------------------------------------------

class UnwrapError extends Error {
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super(
      cause instanceof Error
        ? `Result.unwrap on Err: ${cause.message}`
        : `Result.unwrap on Err: ${JSON.stringify(cause)}`,
    );
    this.name = "UnwrapError";
    this.cause = cause;
  }
}
