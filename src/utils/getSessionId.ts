import { Request } from 'express';
import { AppError } from '../middleware/errorHandler';

export const getSessionId = (req: Request): string => {
  const sessionId =
    (req.headers['x-session-id'] as string) || (req.cookies?.session_id as string);

  if (!sessionId) {
    throw new AppError(400, 'Session ID шаардлагатай. Header-т x-session-id илгээнэ үү.');
  }
  return sessionId;
};
