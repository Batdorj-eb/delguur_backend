import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { ApiResponse } from '../types';
import { getSessionId } from '../utils/getSessionId';
import { AppError } from '../middleware/errorHandler';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSix(): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return s;
}

/** POST /checkout/reference-code — сесс тутамд нэг 6 тэмдэгтийн код */
export const allocateCheckoutReferenceCode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);

    const existing = await pool.query<{ code: string }>(
      'SELECT code FROM checkout_reference_codes WHERE session_id = $1',
      [sessionId]
    );
    if (existing.rows[0]) {
      res.json(<ApiResponse<{ code: string }>>{
        success: true,
        data: { code: existing.rows[0].code },
      });
      return;
    }

    for (let attempt = 0; attempt < 80; attempt++) {
      const code = randomSix();
      try {
        await pool.query(
          `INSERT INTO checkout_reference_codes (session_id, code) VALUES ($1, $2)`,
          [sessionId, code]
        );
        res.json(<ApiResponse<{ code: string }>>{ success: true, data: { code } });
        return;
      } catch (e: unknown) {
        const pg = e as { code?: string };
        if (pg.code === '23505') continue;
        throw e;
      }
    }

    throw new AppError(503, 'Төлбөрийн код үүсгэхэд түр завсарлагаа гарлаа. Дахин оролдоно уу.');
  } catch (err) {
    next(err);
  }
};
