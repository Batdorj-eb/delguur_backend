import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';

const HERO_IMAGE_KEY = 'hero_image_url';

async function getHeroImageUrl(): Promise<string | null> {
  const r = await pool.query<{ value: string | null }>(
    'SELECT value FROM site_settings WHERE key = $1',
    [HERO_IMAGE_KEY]
  );
  const v = r.rows[0]?.value;
  return v != null && String(v).trim() !== '' ? String(v).trim() : null;
}

// ── GET /public/site (public) ─────────────────────────────────────────
export const getPublicSite = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hero_image_url = await getHeroImageUrl();
    res.json(<ApiResponse<{ hero_image_url: string | null }>>{
      success: true,
      data: { hero_image_url },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/site (admin) ───────────────────────────────────────────
export const getAdminSite = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hero_image_url = await getHeroImageUrl();
    res.json(<ApiResponse<{ hero_image_url: string | null }>>{
      success: true,
      data: { hero_image_url },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /admin/site (admin) ─────────────────────────────────────────
export const patchAdminSite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { hero_image_url } = req.body as { hero_image_url?: string | null };

    if (hero_image_url !== undefined) {
      const normalized =
        hero_image_url == null || String(hero_image_url).trim() === ''
          ? null
          : String(hero_image_url).trim();

      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [HERO_IMAGE_KEY, normalized]
      );
    } else {
      throw new AppError(400, 'hero_image_url талбар шаардлагатай.');
    }

    const nextUrl = await getHeroImageUrl();
    res.json(<ApiResponse<{ hero_image_url: string | null }>>{
      success: true,
      message: 'Хадгалагдлаа.',
      data: { hero_image_url: nextUrl },
    });
  } catch (err) {
    next(err);
  }
};
