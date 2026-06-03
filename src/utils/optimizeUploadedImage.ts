import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface OptimizeImageResult {
  filename: string;
  bytes: number;
  optimized: boolean;
}

const SKIP_OPTIMIZE_MIMES = new Set(['image/svg+xml', 'image/gif']);

function imageMaxDimension(): number {
  const n = parseInt(process.env.IMAGE_MAX_DIMENSION || '2560', 10);
  return Number.isFinite(n) ? Math.min(8192, Math.max(640, n)) : 2560;
}

function webpQuality(): number {
  const n = parseInt(process.env.IMAGE_WEBP_QUALITY || '82', 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(50, n)) : 82;
}

/**
 * Upload хийгдсэн зургийг WebP болгон resize + шахаж хадгална.
 * Алдаа гарвал анхны файлыг үлдээнэ (upload амжилтгүй болгохгүй).
 */
export async function optimizeUploadedImage(
  filePath: string,
  mimetype: string
): Promise<OptimizeImageResult> {
  const originalName = path.basename(filePath);
  const stat = fs.statSync(filePath);

  if (SKIP_OPTIMIZE_MIMES.has(mimetype)) {
    return { filename: originalName, bytes: stat.size, optimized: false };
  }

  const maxDim = imageMaxDimension();
  const quality = webpQuality();
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}.webp`);

  try {
    const input = sharp(filePath, { failOn: 'none' }).rotate();
    const meta = await input.metadata();

    let pipeline = input.resize(maxDim, maxDim, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    if (meta.hasAlpha) {
      pipeline = pipeline.webp({ quality, effort: 4, alphaQuality: quality });
    } else {
      pipeline = pipeline.webp({ quality, effort: 4 });
    }

    await pipeline.toFile(outPath);

    const outStat = fs.statSync(outPath);
    if (outStat.size >= stat.size) {
      fs.unlinkSync(outPath);
      return { filename: originalName, bytes: stat.size, optimized: false };
    }

    fs.unlinkSync(filePath);
    return {
      filename: path.basename(outPath),
      bytes: outStat.size,
      optimized: true,
    };
  } catch (err) {
    console.warn('[upload] Зураг шахахад алдаа — анхны файл хадгална:', err);
    return { filename: originalName, bytes: stat.size, optimized: false };
  }
}
