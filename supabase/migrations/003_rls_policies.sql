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
