import bcrypt from 'bcryptjs';
import pool from '../config/database';

const seed = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Admin хэрэглэгч ───────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['Admin', 'admin@delguur.mn', hashedPassword, 'superadmin']);
    console.log('✅ Admin хэрэглэгч үүслээ  →  admin@delguur.mn / admin123');

    // ── Барааны жишээ өгөгдөл ─────────────────────────────────────────
    const products = [
      {
        name: 'Classic Hoodie',
        description: 'Зөөлөн хөвөн hoodie. Өдөр тутмын хэрэглэлд тохиромжтой.',
        price: 89.99,
        image_url: 'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=800',
        category: 'Хувцас',
        stock: 50,
      },
      {
        name: 'Urban Sneakers',
        description: 'Хөнгөн, тухтай гудсан гутал. Спорт болон хотын хэрэглэлд.',
        price: 129.99,
        image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
        category: 'Гутал',
        stock: 30,
      },
      {
        name: 'Leather Tote Bag',
        description: 'Жинхэнэ арьсан том цүнх. Ажил болон аялалд тохиромжтой.',
        price: 199.99,
        image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800',
        category: 'Цүнх',
        stock: 20,
      },
      {
        name: 'Minimalist Watch',
        description: 'Цэвэрхэн загвартай цаг. Sapphire crystal шил, 50м усны тэсвэртэй.',
        price: 249.99,
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
        category: 'Цаг',
        stock: 15,
      },
      {
        name: 'Essential T-Shirt',
        description: '100% органик хөвөн. Энгийн, тав тухтай өдөр тутмын футболк.',
        price: 39.99,
        image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
        category: 'Хувцас',
        stock: 100,
      },
      {
        name: 'Travel Backpack',
        description: '30L багтаамжтай, laptopt тасалгаатай аялалын уут.',
        price: 159.99,
        image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
        category: 'Цүнх',
        stock: 25,
      },
    ];

    for (const p of products) {
      await client.query(`
        INSERT INTO products (name, description, price, image_url, category, stock)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [p.name, p.description, p.price, p.image_url, p.category, p.stock]);
    }
    console.log(`✅ ${products.length} бараа нэмэгдлээ`);

    await client.query('COMMIT');
    console.log('🎉 Seed дууслаа');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed алдаа:', err);
    throw err;
  } finally {
    client.release();
  }
};

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
