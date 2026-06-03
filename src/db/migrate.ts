import pool from '../config/database';

const createTables = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── 1. USERS (admin) ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(255) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        role        VARCHAR(20) NOT NULL DEFAULT 'admin'
                      CHECK (role IN ('admin', 'superadmin')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 2. PRODUCTS ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          VARCHAR(255) NOT NULL,
        description   TEXT,
        price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
        image_url     TEXT,
        category      VARCHAR(100),
        stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // ── 2a. COLORS (admin palette) ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS colors (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) UNIQUE NOT NULL,
        hex_code    VARCHAR(7) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sizes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(30) UNIQUE NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        image_url   TEXT NOT NULL,
        is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_colors (
        product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        color_id    UUID NOT NULL REFERENCES colors(id) ON DELETE RESTRICT,
        PRIMARY KEY (product_id, color_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_color_images (
        product_id        UUID NOT NULL,
        color_id          UUID NOT NULL,
        product_image_id  UUID NOT NULL REFERENCES product_images(id) ON DELETE CASCADE,
        PRIMARY KEY (product_id, color_id),
        FOREIGN KEY (product_id, color_id) REFERENCES product_colors(product_id, color_id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
      SELECT id, image_url, TRUE, 0
      FROM products
      WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
      AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id);
    `);

    // ── 2b. CATEGORIES (canonical list; products.category matches name) ─
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) UNIQUE NOT NULL,
        parent_id   UUID REFERENCES categories(id) ON DELETE RESTRICT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT;
    `);

    await client.query(`
      INSERT INTO categories (name)
      SELECT DISTINCT TRIM(category)::varchar(100)
      FROM products
      WHERE category IS NOT NULL AND TRIM(category) <> ''
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO categories (name) VALUES
        ('Малгай'),
        ('Ороолт'),
        ('Бээлий'),
        ('Хүүхдийн'),
        ('Бэлэн хувцас')
      ON CONFLICT (name) DO NOTHING;
    `);

    // ── 3. CARTS ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id    VARCHAR(255) UNIQUE NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 4. CART ITEMS ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (cart_id, product_id)
      );
    `);

    // ── 5. ORDERS ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number      VARCHAR(50) UNIQUE NOT NULL,
        customer_name     VARCHAR(255) NOT NULL,
        customer_email    VARCHAR(255) NOT NULL,
        customer_phone    VARCHAR(50),
        shipping_address  TEXT NOT NULL,
        subtotal          NUMERIC(10,2) NOT NULL,
        shipping_fee      NUMERIC(10,2) NOT NULL DEFAULT 10000.00,
        total             NUMERIC(10,2) NOT NULL,
        status            VARCHAR(30) NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending','confirmed','delivered','cancelled'
                            )),
        payment_method    VARCHAR(30) NOT NULL DEFAULT 'bank_transfer'
                            CHECK (payment_method IN ('bank_transfer','cash_on_delivery')),
        payment_status    VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                            CHECK (payment_status IN ('unpaid','paid','refunded')),
        notes             TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 6. ORDER ITEMS ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        name        VARCHAR(255) NOT NULL,
        price       NUMERIC(10,2) NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        subtotal    NUMERIC(10,2) NOT NULL
      );
    `);

    // ── 7. AUTO-UPDATE updated_at trigger ─────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const triggerTables = ['users','products','carts','cart_items','orders'];
    for (const table of triggerTables) {
      await client.query(`
        DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table};
        CREATE TRIGGER trg_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    }

    // ── 8. INDEXES ────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
      CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
      CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_colors_product ON product_colors(product_id);
      CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
    `);

    // ── 8c. Төлбөрийн 6 тэмдэгтийн код (дансны гүйлгээний утга) ─────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS checkout_reference_codes (
        session_id VARCHAR(255) PRIMARY KEY,
        code VARCHAR(6) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref_code VARCHAR(6);
    `);

    // ── Өнгө бүрт нөөц + сагс/захиалгад өнгө ─────────────────────────────
    await client.query(`
      ALTER TABLE product_colors ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);
    `);

    await client.query(`
      ALTER TABLE product_colors
      ADD COLUMN IF NOT EXISTS size_stocks JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query(`
      ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES colors(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_no_color
      ON cart_items (cart_id, product_id) WHERE color_id IS NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_with_color
      ON cart_items (cart_id, product_id, color_id) WHERE color_id IS NOT NULL;
    `);

    await client.query(`
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES colors(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color_name VARCHAR(100);
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_ref_code_unique
      ON orders (payment_ref_code)
      WHERE payment_ref_code IS NOT NULL;
    `);

    // ── 8d. Сайтын тохиргоо (нүүр hero зураг г.м) ───────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key           VARCHAR(100) PRIMARY KEY,
        value         TEXT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 8b. Захиалгын төлөв: зөвхөн 4 (хуучин processing/shipped шилжүүлэх) ─
    await client.query(`UPDATE orders SET status = 'delivered' WHERE status = 'shipped'`);
    await client.query(`UPDATE orders SET status = 'confirmed' WHERE status = 'processing'`);
    await client.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check`);
    await client.query(`
      ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending','confirmed','delivered','cancelled'))
    `);

    await client.query('COMMIT');
    console.log('✅ Бүх хүснэгт амжилттай үүслээ');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration алдаа:', err);
    throw err;
  } finally {
    client.release();
  }
};

createTables()
  .then(() => {
    console.log('🎉 Migration дууслаа');
    process.exit(0);
  })
  .catch(() => process.exit(1));
