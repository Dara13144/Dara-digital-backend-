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

        -- For code/account/file/link/text stocks that require inventory rows (Gamepass & Robux bypass)
        IF v_item.stock_type IN ('code', 'account', 'link', 'text', 'file') 
           AND NOT EXISTS (
               SELECT 1 FROM products p 
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.id = v_item.product_id 
                 AND (
                     p.stock_type = 'manual' 
                     OR c.slug IN ('gamepass', 'topup', 'robux') 
                     OR LOWER(p.name) LIKE '%gamepass%' 
                     OR LOWER(p.name) LIKE '%robux%' 
                     OR LOWER(p.name) LIKE '%top-up%'
                     OR LOWER(p.name) LIKE '%topup%'
                     OR LOWER(p.name) LIKE '%r$%'
                 )
           ) THEN
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
