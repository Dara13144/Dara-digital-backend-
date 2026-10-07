-- ============================================================================
-- Supabase Schema Migration: 001_initial_schema.sql
-- Digital Products Store Telegram Mini App
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing enum types if re-running
DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('active', 'suspended', 'banned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE product_status_enum AS ENUM ('draft', 'published', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_type_enum AS ENUM ('manual', 'code', 'account', 'file', 'link', 'text');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_status_enum AS ENUM ('available', 'reserved', 'sold', 'disabled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'PENDING_PAYMENT',
        'PAYMENT_PROCESSING',
        'PAID',
        'STOCK_RESERVED',
        'DELIVERING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'REFUND_PENDING',
        'REFUNDED',
        'STOCK_ERROR'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM (
        'PENDING',
        'PROCESSING',
        'PAID',
        'FAILED',
        'CANCELLED',
        'EXPIRED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE wallet_tx_type_enum AS ENUM (
        'DEPOSIT',
        'PURCHASE',
        'REFUND',
        'ADMIN_CREDIT',
        'ADMIN_DEBIT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE discount_type_enum AS ENUM ('percentage', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 1. USERS & ROLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    avatar_url TEXT,
    email VARCHAR(255),
    phone VARCHAR(50),
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_spent >= 0),
    order_count INT NOT NULL DEFAULT 0 CHECK (order_count >= 0),
    status user_status_enum NOT NULL DEFAULT 'active',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    name_km VARCHAR(100),
    slug VARCHAR(120) UNIQUE NOT NULL,
    icon VARCHAR(100),
    image_url TEXT,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS & IMAGES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    name_km VARCHAR(255),
    slug VARCHAR(280) UNIQUE NOT NULL,
    description TEXT,
    description_km TEXT,
    images TEXT[] DEFAULT ARRAY[]::TEXT[],
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    discount_price NUMERIC(12, 2) CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price < price)),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    stock_type stock_type_enum NOT NULL DEFAULT 'code',
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    sold_quantity INT NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
    status product_status_enum NOT NULL DEFAULT 'published',
    featured BOOLEAN NOT NULL DEFAULT false,
    published BOOLEAN NOT NULL DEFAULT true,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    instructions TEXT,
    badge VARCHAR(100),
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. STOCK INVENTORY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_type stock_type_enum NOT NULL,
    payload TEXT NOT NULL, -- Encrypted or cleartext code/account/link/text
    stock_hash VARCHAR(64) NOT NULL, -- SHA256 of payload to prevent duplicates per product
    status stock_status_enum NOT NULL DEFAULT 'available',
    order_id UUID,
    reserved_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_product_stock_hash UNIQUE (product_id, stock_hash)
);

-- ----------------------------------------------------------------------------
-- 5. COUPONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type discount_type_enum NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    minimum_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    maximum_discount NUMERIC(12, 2),
    usage_limit INT,
    used_count INT NOT NULL DEFAULT 0,
    per_user_limit INT NOT NULL DEFAULT 1,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. ORDERS & ORDER ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status order_status_enum NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_method VARCHAR(50) NOT NULL DEFAULT 'aba_payway',
    admin_notes TEXT,
    customer_notes TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    stock_type stock_type_enum NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    discount_applied NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. PAYMENTS & PAYMENT EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    gateway VARCHAR(50) NOT NULL DEFAULT 'aba_payway',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status payment_status_enum NOT NULL DEFAULT 'PENDING',
    payment_url TEXT,
    raw_request JSONB,
    raw_response JSONB,
    callback_payload JSONB,
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. DIGITAL DELIVERIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    stock_item_id UUID REFERENCES stock_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    delivery_type stock_type_enum NOT NULL,
    delivery_payload TEXT NOT NULL, -- The actual delivered secret code, credentials, or link
    file_path TEXT,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_viewed BOOLEAN NOT NULL DEFAULT false,
    viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. WALLETS & LEDGER TRANSACTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type wallet_tx_type_enum NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    balance_before NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    reference VARCHAR(100),
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. NOTIFICATIONS, FAVORITES & AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    title_km VARCHAR(255),
    message TEXT NOT NULL,
    message_km TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'order',
    is_read BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_favorite UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(100),
    metadata JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    changes JSONB,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. INDEXES FOR PERFORMANCE & INTEGRITY
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_published ON products(published);

CREATE INDEX IF NOT EXISTS idx_stock_items_product_id ON stock_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON stock_items(status);
CREATE INDEX IF NOT EXISTS idx_stock_items_available ON stock_items(product_id, status) WHERE status = 'available';

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_product_id ON deliveries(product_id);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id ON wallet_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
-- ============================================================================
-- Supabase Schema Migration: 002_functions_and_triggers.sql
-- Functions, Atomic Inventory Locking, Ledger Transactions & Triggers
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DROP TRIGGER IF EXISTS trigger_set_updated_at_users ON users;
CREATE TRIGGER trigger_set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_categories ON categories;
CREATE TRIGGER trigger_set_updated_at_categories
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_products ON products;
CREATE TRIGGER trigger_set_updated_at_products
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_stock_items ON stock_items;
CREATE TRIGGER trigger_set_updated_at_stock_items
    BEFORE UPDATE ON stock_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_orders ON orders;
CREATE TRIGGER trigger_set_updated_at_orders
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_payments ON payments;
CREATE TRIGGER trigger_set_updated_at_payments
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_wallets ON wallets;
CREATE TRIGGER trigger_set_updated_at_wallets
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_settings ON settings;
CREATE TRIGGER trigger_set_updated_at_settings
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------------------
-- Sync product stock count automatically when stock_items change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_product_stock_counts()
RETURNS TRIGGER AS $$
DECLARE
    target_product_id UUID;
BEGIN
    target_product_id := COALESCE(NEW.product_id, OLD.product_id);
    
    UPDATE products
    SET 
        stock_quantity = (
            SELECT COUNT(*) 
            FROM stock_items 
            WHERE product_id = target_product_id AND status = 'available'
        ),
        sold_quantity = (
            SELECT COUNT(*) 
            FROM stock_items 
            WHERE product_id = target_product_id AND status = 'sold'
        ),
        updated_at = NOW()
    WHERE id = target_product_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_product_stock ON stock_items;
CREATE TRIGGER trigger_sync_product_stock
    AFTER INSERT OR UPDATE OR DELETE ON stock_items
    FOR EACH ROW EXECUTE FUNCTION sync_product_stock_counts();


-- ----------------------------------------------------------------------------
-- Atomic Stock Reservation & Delivery Stored Procedure
-- Solves Race Conditions using SELECT ... FOR UPDATE SKIP LOCKED
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_order_stock_delivery(p_order_id UUID)
RETURNS TABLE (
    delivery_id UUID,
    order_item_id UUID,
    product_id UUID,
    delivery_type stock_type_enum,
    delivery_payload TEXT
) AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_stock_record RECORD;
    v_needed_count INT;
    v_allocated_count INT;
    v_stock_ids UUID[];
BEGIN
    -- Verify Order exists
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- If already delivered, just return existing deliveries
    IF EXISTS (SELECT 1 FROM deliveries WHERE order_id = p_order_id) THEN
        RETURN QUERY
        SELECT d.id, d.order_item_id, d.product_id, d.delivery_type, d.delivery_payload
        FROM deliveries d
        WHERE d.order_id = p_order_id;
        RETURN;
    END IF;

    -- Loop through each order item to lock and allocate stock
    FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
        v_needed_count := v_item.quantity;
        v_allocated_count := 0;

        -- For code/account/file/link/text stocks that require inventory rows
        IF v_item.stock_type IN ('code', 'account', 'link', 'text', 'file') THEN
            -- Select and lock specific available stock rows
            FOR v_stock_record IN 
                SELECT s.id, s.payload, s.stock_type 
                FROM stock_items s 
                WHERE s.product_id = v_item.product_id 
                  AND s.status = 'available' 
                ORDER BY s.created_at ASC 
                LIMIT v_needed_count 
                FOR UPDATE SKIP LOCKED
            LOOP
                -- Mark stock row as sold and tied to order
                UPDATE stock_items 
                SET status = 'sold', 
                    order_id = p_order_id, 
                    sold_at = NOW(), 
                    updated_at = NOW() 
                WHERE id = v_stock_record.id;

                -- Insert into deliveries table
                INSERT INTO deliveries (
                    order_id,
                    order_item_id,
                    stock_item_id,
                    product_id,
                    delivery_type,
                    delivery_payload,
                    delivered_at
                ) VALUES (
                    p_order_id,
                    v_item.id,
                    v_stock_record.id,
                    v_item.product_id,
                    v_stock_record.stock_type,
                    v_stock_record.payload,
                    NOW()
                );

                v_allocated_count := v_allocated_count + 1;
            END LOOP;

            -- If we could not allocate required quantity, raise exception to rollback transaction
            IF v_allocated_count < v_needed_count THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Required %, available % for product %', 
                    v_needed_count, v_allocated_count, v_item.product_name;
            END IF;

        ELSE -- Manual delivery stock
            INSERT INTO deliveries (
                order_id,
                order_item_id,
                product_id,
                delivery_type,
                delivery_payload,
                delivered_at
            ) VALUES (
                p_order_id,
                v_item.id,
                v_item.product_id,
                v_item.stock_type,
                'Order received. Manual delivery in progress by store support.',
                NOW()
            );
        END IF;
    END LOOP;

    -- Update Order status to COMPLETED
    UPDATE orders 
    SET status = 'COMPLETED', updated_at = NOW() 
    WHERE id = p_order_id;

    -- Increment User total spent & order count
    UPDATE users
    SET total_spent = total_spent + v_order.total_amount,
        order_count = order_count + 1,
        updated_at = NOW()
    WHERE id = v_order.user_id;

    -- Return the created deliveries
    RETURN QUERY
    SELECT d.id, d.order_item_id, d.product_id, d.delivery_type, d.delivery_payload
    FROM deliveries d
    WHERE d.order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------------------
-- Atomic Wallet Ledger Adjustment Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adjust_wallet_balance(
    p_user_id UUID,
    p_amount NUMERIC,
    p_type wallet_tx_type_enum,
    p_order_id UUID DEFAULT NULL,
    p_payment_id UUID DEFAULT NULL,
    p_reference TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
    transaction_id UUID,
    wallet_id UUID,
    new_balance NUMERIC
) AS $$
DECLARE
    v_wallet RECORD;
    v_balance_before NUMERIC;
    v_balance_after NUMERIC;
    v_tx_id UUID;
BEGIN
    -- Ensure wallet exists with row lock
    SELECT * INTO v_wallet 
    FROM wallets 
    WHERE user_id = p_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Auto-create wallet if it doesn't exist
        INSERT INTO wallets (user_id, balance, currency)
        VALUES (p_user_id, 0.00, 'USD')
        RETURNING * INTO v_wallet;
    END IF;

    v_balance_before := v_wallet.balance;
    v_balance_after := v_balance_before + p_amount;

    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Current balance is %, cannot debit %', v_balance_before, ABS(p_amount);
    END IF;

    -- Update wallet balance
    UPDATE wallets
    SET balance = v_balance_after, updated_at = NOW()
    WHERE id = v_wallet.id;

    -- Update user table cached balance
    UPDATE users
    SET balance = v_balance_after, updated_at = NOW()
    WHERE id = p_user_id;

    -- Create immutable ledger transaction record
    INSERT INTO wallet_transactions (
        wallet_id,
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        order_id,
        payment_id,
        reference,
        description,
        created_by,
        created_at
    ) VALUES (
        v_wallet.id,
        p_user_id,
        p_type,
        p_amount,
        v_balance_before,
        v_balance_after,
        p_order_id,
        p_payment_id,
        p_reference,
        p_description,
        p_created_by,
        NOW()
    ) RETURNING id INTO v_tx_id;

    RETURN QUERY
    SELECT v_tx_id, v_wallet.id, v_balance_after;
END;
$$ LANGUAGE plpgsql;
-- ============================================================================
-- Supabase Schema Migration: 003_rls_policies.sql
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current JWT user has admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() 
          AND r.name IN ('ADMIN', 'SUPER_ADMIN', 'STAFF')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Public Read Policies for Catalogs
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view active categories" 
    ON categories FOR SELECT 
    USING (status = 'active' OR is_admin());

CREATE POLICY "Public can view published products" 
    ON products FOR SELECT 
    USING (published = true OR is_admin());

CREATE POLICY "Public can view product images" 
    ON product_images FOR SELECT 
    USING (true);

CREATE POLICY "Public can view active settings"
    ON settings FOR SELECT
    USING (true);

-- ----------------------------------------------------------------------------
-- User Specific Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can read their own profile" 
    ON users FOR SELECT 
    USING (id = auth.uid() OR is_admin());

CREATE POLICY "Users can update their own basic profile" 
    ON users FOR UPDATE 
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Users can view their own orders" 
    ON orders FOR SELECT 
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Users can view their own order items" 
    ON order_items FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
              AND (orders.user_id = auth.uid() OR is_admin())
        )
    );

CREATE POLICY "Users can view their own payments" 
    ON payments FOR SELECT 
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Users can view their own deliveries" 
    ON deliveries FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = deliveries.order_id 
              AND (orders.user_id = auth.uid() OR is_admin())
        )
    );

CREATE POLICY "Users can view their own wallet" 
    ON wallets FOR SELECT 
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Users can view their own wallet transactions" 
    ON wallet_transactions FOR SELECT 
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Users can manage their own favorites" 
    ON favorites FOR ALL 
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own notifications" 
    ON notifications FOR ALL 
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Stock Items: Never accessible publicly; only through backend or admin
-- ----------------------------------------------------------------------------
CREATE POLICY "Admins can manage stock items"
    ON stock_items FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- ----------------------------------------------------------------------------
-- Admin Management Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Admins can manage categories" 
    ON categories FOR ALL 
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage products" 
    ON products FOR ALL 
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage coupons" 
    ON coupons FOR ALL 
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage orders" 
    ON orders FOR ALL 
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can view admin logs" 
    ON admin_logs FOR ALL 
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage settings" 
    ON settings FOR ALL 
    USING (is_admin())
    WITH CHECK (is_admin());
-- ============================================================================
-- Supabase Schema Migration: 004_gamepass_and_storage.sql
-- Storage Buckets, GamePass & Top-Up Attributes, Image Upload Policies
-- ============================================================================

-- 1. Ensure products table has badge and image_url columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_products_badge ON products(badge);

-- 2. Configure Supabase Storage Bucket for Product and Top-Up Images
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'images',
        'images',
        true,
        10485760, -- 10MB limit
        ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
    )
    ON CONFLICT (id) DO UPDATE SET
        public = true,
        file_size_limit = 10485760,
        allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
EXCEPTION
    WHEN undefined_table THEN
        -- If storage extension is managed externally
        NULL;
END $$;

-- 3. Storage Policies for Public Image Access and Uploads
DO $$
BEGIN
    -- Public read access to images bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Public Access to Images'
    ) THEN
        CREATE POLICY "Public Access to Images"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'images');
    END IF;

    -- Allow authenticated and service uploads to images bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Allow Uploads to Images'
    ) THEN
        CREATE POLICY "Allow Uploads to Images"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'images');
    END IF;

    -- Allow updates to images bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Allow Updates to Images'
    ) THEN
        CREATE POLICY "Allow Updates to Images"
        ON storage.objects FOR UPDATE
        USING (bucket_id = 'images');
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        NULL;
    WHEN insufficient_privilege THEN
        NULL;
END $$;
-- ============================================================================
-- Supabase Complete Seed Data: seed.sql
-- Working Store Catalog, GamePass Hub, Robux Packages, and Digital Items
-- ============================================================================

-- 1. Insert Standard Roles
INSERT INTO roles (id, name, description)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Full system access and settings management'),
    ('00000000-0000-0000-0000-000000000002', 'ADMIN', 'Store manager and orders processing'),
    ('00000000-0000-0000-0000-000000000003', 'STAFF', 'Customer support and inventory viewer'),
    ('00000000-0000-0000-0000-000000000004', 'USER', 'Standard store customer')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Categories
INSERT INTO categories (id, name, name_km, slug, icon, image_url, description, sort_order, status)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'Bloxfruits', 'Bloxfruits', 'bloxfruits', 'Gamepad2', '/categories/bloxfruits.png', 'Steam, Epic Games, PlayStation, Xbox, and Origin activation keys', 1, 'active'),
    ('10000000-0000-0000-0000-000000000002', 'Fruits', 'Fruits', 'fruits', 'Apple', '/categories/fruits.png', 'Apple iTunes, Google Play, Steam Wallet, Netflix gift cards', 2, 'active'),
    ('10000000-0000-0000-0000-000000000003', 'Gamepass', 'Gamepass', 'gamepass', 'Sparkles', '/categories/gamepass.png', 'Windows 11 Pro, Office 365, Antivirus, and Developer Tool licenses', 3, 'active'),
    ('10000000-0000-0000-0000-000000000006', 'Topup', 'Topup', 'topup', 'Zap', '/categories/topup.png', 'Robux & Game Currency Instant Top-Up Service', 4, 'active'),
    ('10000000-0000-0000-0000-000000000005', 'Telegram & Discord', 'ážáŸáž›áŸáž€áŸ’ážšáž¶áž˜ & ážŒáž¸ážŸážáž (Social)', 'telegram-discord', 'Send', 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80', 'Telegram Premium Gift codes, Discord Nitro 1/3/12 Months, Boosts', 5, 'inactive'),
    ('44afd8c3-5e4e-4ad1-b8cb-1ab72af32171', 'Steal an Egg ðŸ¥š', 'Steal an Egg ðŸ¥š', 'steal-an-egg', 'Gamepad2', 'https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/categories/categories_1791371071954_df497eb5.jpg', '', 6, 'active'),
    ('10000000-0000-0000-0000-000000000004', 'Game Keys', 'áž‚ážŽáž“áž¸áž–áž·ážŸáŸážŸ (Premium)', 'game-keys', 'Sparkles', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80', 'Spotify, YouTube Premium, Canva Pro, ChatGPT Plus, and VPN accounts', 99, 'active')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_km = EXCLUDED.name_km,
    slug = EXCLUDED.slug,
    image_url = EXCLUDED.image_url,
    status = EXCLUDED.status;

-- 3. Insert Products (Blox Fruits GamePass, Robux Top-Up & Digital Items)
INSERT INTO products (
    id, category_id, name, name_km, slug, description, description_km,
    images, price, discount_price, currency, stock_type, stock_quantity,
    sold_quantity, status, featured, published, rating, instructions, badge
)
VALUES
    ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Roblox Blox Fruits Account (Lv. 1763 + Midnight Blade + Saber + Fruits)', 'Roblox Blox Fruits Account (Lv. 1763 + ážŠáž¶ážœáž€áž˜áŸ’ážš + áž•áŸ’áž›áŸ‚ážˆáž¾)', 'roblox-blox-fruits-account-lv-1763-midnight-blade-saber-fruits', 'Roblox Blox Fruits Account Level 1763. Includes Midnight Blade, Saber, Oroshi, Koko, Pale 1st Form, Bazooka, Valkyrie Helmet, and full fruit inventory (Rubber, Diamond, Sand, Ice, Flame). Instant credential transfer.', 'áž‚ážŽáž“áž¸ Roblox Blox Fruits Level 1763 áž˜áž¶áž“ážŠáž¶ážœáž€áž˜áŸ’ážš Midnight Blade, Saber, Oroshi, Koko, Valkyrie Helmet áž“áž·áž„áž•áŸ’áž›áŸ‚ážˆáž¾áž€áŸ’áž“áž»áž„áž€áž¶ážáž¶áž”áž‡áž¶áž…áŸ’ážšáž¾áž“áŸ” áž•áŸ’ážŠáž›áŸ‹ username/password áž—áŸ’áž›áž¶áž˜áŸ—áŸ”', ARRAY['/products/blox_fruits_account.jpg']::TEXT[], 0.10, NULL, 'USD', 'account', 999, 1, 'published', true, true, 5.00, '1. Open Roblox.com and log in with the delivered username & password.
2. Change the password and link your personal email/2FA immediately.', NULL),
    ('ae016bce-230f-43d2-a534-87acf9c3b538', '10000000-0000-0000-0000-000000000001', 'Acc Steal An Eggâ¤ï¸', 'áž¢áž¶ážáŸ„áž“áž áŸ’áž‚áŸáž˜áž›áž½áž…áž–áž„ðŸ”¥', 'acc-steal-an-egg', 'ðŸ“¢Account Steal an eg For Sell ðŸ€

âž¡ï¸ accounts steal an egg
âž¡ï¸ Speed 3.6T
âž¡ï¸ Money/s 357B/s', '', ARRAY['https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600']::TEXT[], 32.99, NULL, 'USD', 'account', 1, 0, 'published', false, true, 5.00, '', NULL),
    ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000003', '2x Mastery GamePass (Blox Fruits)', 'GamePass 2x Mastery (Blox Fruits)', '2x-mastery-gamepass-blox-fruits', 'Blox Fruits 2x Mastery GamePass. Earn mastery twice as fast on all combat styles, swords, guns, and Blox Fruits.', 'GamePass 2x Mastery ážŸáž˜áŸ’ážšáž¶áž”áŸ‹ Blox Fruits áž‡áž½áž™áž¡áž¾áž„ Mastery áž›áž¿áž“áž‡áž¶áž„áž˜áž»áž“ áŸ¢ ážŠáž„áŸ”', ARRAY['/categories/gamepass.png']::TEXT[], 4.99, NULL, 'USD', 'manual', 999, 0, 'published', true, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Best Seller'),
    ('20000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000003', '2x Money GamePass (Blox Fruits)', 'GamePass 2x Money (Blox Fruits)', '2x-money-gamepass-blox-fruits', 'Blox Fruits 2x Money GamePass. Doubles all Beli earned from quests and defeating bosses.', 'GamePass 2x Money ážŸáž˜áŸ’ážšáž¶áž”áŸ‹ Blox Fruits áž‡áž½áž™áž”áž„áŸ’áž€áž¾áž“áž”áŸ’ážšáž¶áž€áŸ‹ Beli áŸ¢ ážŠáž„áž–áž¸ážšáž¶áž›áŸ‹áž”áŸážŸáž€áž€áž˜áŸ’áž˜ áž“áž·áž„áž€áž¶ážšáž€áž˜áŸ’áž…áž¶ážáŸ‹ BossáŸ”', ARRAY['/categories/gamepass.png']::TEXT[], 4.99, NULL, 'USD', 'manual', 999, 0, 'published', true, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Hot Deal'),
    ('20000000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-000000000003', 'Dark Blade (Yoru) GamePass', 'GamePass Dark Blade / Yoru', 'dark-blade-yoru-gamepass-blox-fruits', 'Blox Fruits Dark Blade (Yoru) Mythical Sword GamePass. Grants instant access to one of the most powerful swords.', 'GamePass Dark Blade (Yoru) ážŠáž¶ážœáž€áž˜áŸ’ážšážáŸ’áž“áž¶áž€áŸ‹ Mythical ážŠáŸáž˜áž¶áž“áž¥áž‘áŸ’áž’áž·áž–áž›áž”áŸ†áž•áž»ážáž€áŸ’áž“áž»áž„ Blox FruitsáŸ”', ARRAY['/categories/gamepass.png']::TEXT[], 12.99, NULL, 'USD', 'manual', 999, 0, 'published', true, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Mythical'),
    ('20000000-0000-0000-0000-000000000054', '10000000-0000-0000-0000-000000000003', 'Fast Boats (Luxury Boats) GamePass', 'GamePass Fast Boats', 'fast-boats-gamepass-blox-fruits', 'Blox Fruits Fast Boats GamePass. Unlocks the Miracle and Enforcer luxury speedboats.', 'GamePass Fast Boats ážŠáŸ„áŸ‡ážŸáŸ„ážšáž€áž¶ážŽáž¼ážáž›áŸ’áž”áž¿áž“áž›áž¿áž“ Miracle áž“áž·áž„ Enforcer áž€áŸ’áž“áž»áž„ Blox FruitsáŸ”', ARRAY['/categories/gamepass.png']::TEXT[], 3.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000055', '10000000-0000-0000-0000-000000000003', '2x Boss Drops GamePass', 'GamePass 2x Boss Drops', '2x-boss-drops-gamepass', 'Blox Fruits 2x Boss Drops GamePass. Doubles drop rates for rare items and accessories from bosses.', 'Blox Fruits 2x Boss Drops GamePass. Doubles drop rates for rare items and accessories from bosses.', ARRAY['https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/topup/topup_1791369869520_d3c48517.jpg']::TEXT[], 3.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Starter'),
    ('20000000-0000-0000-0000-000000000056', '10000000-0000-0000-0000-000000000003', '+1 Fruit Storage (+1 Capacity)', 'GamePass +1 Fruit Storage', '1-fruit-storage-1-capacity', 'Blox Fruits +1 Fruit Storage GamePass. Adds +1 capacity to your Treasure Inventory storage.', 'Blox Fruits +1 Fruit Storage GamePass. Adds +1 capacity to your Treasure Inventory storage.', ARRAY['https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/topup/topup_1791367441974_5a3c629a.jpg']::TEXT[], 2.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-24hours.', 'Best Value'),
    ('20000000-0000-0000-0000-000000000057', '10000000-0000-0000-0000-000000000003', 'Fruit Notifier GamePass', 'GamePass Fruit Notifier', 'fruit-notifier-gamepass', 'Blox Fruits Fruit Notifier GamePass. Notifies you on-screen with exact meter distance whenever a fruit spawns.', 'Blox Fruits Fruit Notifier GamePass. Notifies you on-screen with exact meter distance whenever a fruit spawns.', ARRAY['https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/topup/topup_1791371516852_c441396a.jpg']::TEXT[], 13.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-24hours.', 'VIP / Ultra'),
    ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004', 'CapCut Pro 1 Year VIP Subscription', 'CapCut Pro áŸ¡ áž†áŸ’áž“áž¶áŸ† (VIP Access)', 'capcut-pro-1-year-vip-subscription', 'CapCut Pro 1-Year VIP Subscription. Unlock all premium video transitions, effects, AI auto-captions, 4K 60FPS export, and cloud backup.', 'áž‚ážŽáž“áž¸ CapCut Pro áŸ¡ áž†áŸ’áž“áž¶áŸ† ážŠáŸ„áŸ‡ážŸáŸ„ážšáž˜áž»ážáž„áž¶ážš VIP Effects, Auto-Captions, 4K Export áž“áž·áž„ Cloud Storage áž‚áŸ’áž˜áž¶áž“ážŠáŸ‚áž“áž€áŸ†ážŽážáŸ‹áŸ”', ARRAY['/products/capcut_pro.png']::TEXT[], 0.10, NULL, 'USD', 'account', 3, 1, 'published', true, true, 4.98, 'Log in to CapCut on Mobile/PC using the provided email and password credentials.', NULL),
    ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000004', 'Google Gemini Advanced 2.0 Ultra (1 Month)', 'Google Gemini Advanced (1 ážáŸ‚)', 'google-gemini-advanced-20-ultra-1-month', 'Google Gemini Advanced AI subscription. 2 Million token context window, Google Workspace integration, Deep Research, and highest tier AI capabilities.', 'áž‚ážŽáž“áž¸ Google Gemini Advanced 2.0 áž”áŸ’ážšáž¾áž”áŸ’ážšáž¶ážŸáŸ‹ AI áž‡áŸ†áž“áž¶áž“áŸ‹ážáŸ’áž–ážŸáŸ‹áž”áŸ†áž•áž»áž Context 2M Tokens áž“áž·áž„ Deep ResearcháŸ”', ARRAY['/products/gemini_advanced.png']::TEXT[], 0.10, NULL, 'USD', 'account', 5, 0, 'published', true, true, 5.00, 'Sign in at https://gemini.google.com with the delivered account details.', NULL),
    ('20000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000006', '100 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 100 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '100-robux-fast-top-up', 'Instant delivery top-up package for 100 Robux Fast Top-Up.', 'Instant delivery top-up package for 100 Robux Fast Top-Up.', ARRAY['/categories/topup.png']::TEXT[], 0.10, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Please enter your Roblox Username or Player ID at checkout.', 'Popular'),
    ('20000000-0000-0000-0000-000000000200', '10000000-0000-0000-0000-000000000006', '200 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 200 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '200-robux-fast-top-up-0200', 'Instant automated Roblox Fast Top-Up for 200 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 200 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 1.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000300', '10000000-0000-0000-0000-000000000006', '300 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 300 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '300-robux-fast-top-up-0300', 'Instant automated Roblox Fast Top-Up for 300 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 300 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 2.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000400', '10000000-0000-0000-0000-000000000006', '400 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 400 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '400-robux-fast-top-up-0400', 'Instant automated Roblox Fast Top-Up for 400 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 400 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 3.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Special'),
    ('20000000-0000-0000-0000-000000000500', '10000000-0000-0000-0000-000000000006', '500 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 500 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '500-robux-fast-top-up-0500', 'Instant automated Roblox Fast Top-Up for 500 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 500 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 4.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Best Value'),
    ('20000000-0000-0000-0000-000000000600', '10000000-0000-0000-0000-000000000006', '600 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 600 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '600-robux-fast-top-up-0600', 'Instant automated Roblox Fast Top-Up for 600 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 600 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 5.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000700', '10000000-0000-0000-0000-000000000006', '700 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 700 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '700-robux-fast-top-up-0700', 'Instant automated Roblox Fast Top-Up for 700 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 700 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 6.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Special'),
    ('20000000-0000-0000-0000-000000000800', '10000000-0000-0000-0000-000000000006', '800 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 800 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '800-robux-fast-top-up-0800', 'Instant automated Roblox Fast Top-Up for 800 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 800 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 7.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Hot Deal'),
    ('20000000-0000-0000-0000-000000000900', '10000000-0000-0000-0000-000000000006', '900 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 900 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '900-robux-fast-top-up-0900', 'Instant automated Roblox Fast Top-Up for 900 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 900 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 8.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Special'),
    ('20000000-0000-0000-0000-000000001000', '10000000-0000-0000-0000-000000000006', '1,000 Robux Fast Top-Up', 'áž€áž‰áŸ’áž…áž”áŸ‹ 1,000 Robux áž—áŸ’áž›áž¶áž˜áŸ—', '1000-robux-fast-top-up-1000', 'Instant automated Roblox Fast Top-Up for 1,000 Robux Fast Top-Up. Zero password needed, safe 100%.', 'áž€áž‰áŸ’áž…áž”áŸ‹ 1,000 Robux áž—áŸ’áž›áž¶áž˜áŸ—', ARRAY['/categories/topup.png']::TEXT[], 9.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Super Value')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_km = EXCLUDED.name_km,
    price = EXCLUDED.price,
    discount_price = EXCLUDED.discount_price,
    images = EXCLUDED.images,
    badge = EXCLUDED.badge,
    description = EXCLUDED.description,
    instructions = EXCLUDED.instructions;

-- 4. Insert Default Coupons
INSERT INTO coupons (code, description, discount_type, discount_value, minimum_amount, maximum_discount, usage_limit, per_user_limit, active)
VALUES
    ('WELCOME10', 'Welcome 10% Discount on first purchase', 'percentage', 10.00, 5.00, 10.00, 1000, 1, true),
    ('DARAMINI2', '$2 off on orders above $15', 'fixed', 2.00, 15.00, NULL, 500, 2, true),
    ('SPECIAL50', 'VIP 50% discount up to $20', 'percentage', 50.00, 20.00, 20.00, 100, 1, true)
ON CONFLICT (code) DO NOTHING;

-- 5. Insert Store Settings
INSERT INTO settings (key, value, description)
VALUES
    ('store_name', '{"en": "DaraMini Digital Store", "km": "ážáž¶ážšáž¶áž˜áž¸áž“áž¸ ážŒáž¸áž‡áž¸ážáž›ážŸáŸ’ážáŸážš"}'::jsonb, 'Store public brand name'),
    ('store_currency', '"USD"'::jsonb, 'Base currency for transactions'),
    ('support_telegram', '"@rybunrak"'::jsonb, 'Telegram customer support handle'),
    ('maintenance_mode', 'false'::jsonb, 'Turn on to show maintenance screen'),
    ('low_stock_threshold', '3'::jsonb, 'Trigger admin alert when stock falls below this count'),
    ('min_order_amount', '0.10'::jsonb, 'Minimum checkout total amount'),
    ('max_order_amount', '2000.00'::jsonb, 'Maximum checkout total amount')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
