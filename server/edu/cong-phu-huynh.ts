import { createHash, randomBytes } from 'node:crypto';

/**
 * The private link of a parent (stage 3). The link is `/ph#<token>`: the token is 32 random bytes, shown once when the
 * link is made and never stored; only its SHA-256 is kept (`eduCongPhuHuynh.tokenHash`). The fragment after `#` is not
 * sent to the server by the browser, so a token never lands in an access log.
 */

/** A link opens for this many days. */
export const LINK_DAYS = 90;

/** 32 bytes in base64url is 43 characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/u;

export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** A string that cannot be a token is refused without touching the database. */
export const looksLikeToken = (value: string): boolean =>
  TOKEN_SHAPE.test(value);

export const expiryOf = (now: Date, days: number = LINK_DAYS): Date =>
  new Date(now.getTime() + days * 86_400_000);

/**
 * A fixed-window counter per key, held in this process. `hit` is false once a key has made `max` requests inside the
 * window. Not shared between instances: it slows guessing down, it is not what keeps a link secret (43 random
 * characters do that).
 */
export function createLimiter(options: {
  readonly max: number;
  readonly windowMs: number;
  readonly now?: () => number;
}): { hit(key: string): boolean } {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const at = now();
      if (windows.size > 10_000) {
        for (const [name, window] of windows)
          if (window.resetAt <= at) windows.delete(name);
      }
      const window = windows.get(key);
      if (!window || window.resetAt <= at) {
        windows.set(key, { count: 1, resetAt: at + options.windowMs });
        return true;
      }
      window.count += 1;
      return window.count <= options.max;
    },
  };
}
