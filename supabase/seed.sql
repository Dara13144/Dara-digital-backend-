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
    ('10000000-0000-0000-0000-000000000005', 'Telegram & Discord', 'តេលេក្រាម & ឌីសខត (Social)', 'telegram-discord', 'Send', 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80', 'Telegram Premium Gift codes, Discord Nitro 1/3/12 Months, Boosts', 5, 'inactive'),
    ('44afd8c3-5e4e-4ad1-b8cb-1ab72af32171', 'Steal an Egg 🥚', 'Steal an Egg 🥚', 'steal-an-egg', 'Gamepad2', 'https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/categories/categories_1791371071954_df497eb5.jpg', '', 6, 'active'),
    ('10000000-0000-0000-0000-000000000004', 'Game Keys', 'គណនីពិសេស (Premium)', 'game-keys', 'Sparkles', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80', 'Spotify, YouTube Premium, Canva Pro, ChatGPT Plus, and VPN accounts', 99, 'active')
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
    ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Roblox Blox Fruits Account (Lv. 1763 + Midnight Blade + Saber + Fruits)', 'Roblox Blox Fruits Account (Lv. 1763 + ដាវកម្រ + ផ្លែឈើ)', 'roblox-blox-fruits-account-lv-1763-midnight-blade-saber-fruits', 'Roblox Blox Fruits Account Level 1763. Includes Midnight Blade, Saber, Oroshi, Koko, Pale 1st Form, Bazooka, Valkyrie Helmet, and full fruit inventory (Rubber, Diamond, Sand, Ice, Flame). Instant credential transfer.', 'គណនី Roblox Blox Fruits Level 1763 មានដាវកម្រ Midnight Blade, Saber, Oroshi, Koko, Valkyrie Helmet និងផ្លែឈើក្នុងកាតាបជាច្រើន។ ផ្ដល់ username/password ភ្លាមៗ។', ARRAY['/products/blox_fruits_account.jpg']::TEXT[], 0.10, NULL, 'USD', 'account', 999, 1, 'published', true, true, 5.00, '1. Open Roblox.com and log in with the delivered username & password.
2. Change the password and link your personal email/2FA immediately.', NULL),
    ('ae016bce-230f-43d2-a534-87acf9c3b538', '10000000-0000-0000-0000-000000000001', 'Acc Steal An Egg❤️', 'អាខោនហ្គេមលួចពង🔥', 'acc-steal-an-egg', '📢Account Steal an eg For Sell 🍀

➡️ accounts steal an egg
➡️ Speed 3.6T
➡️ Money/s 357B/s', '', ARRAY['https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600']::TEXT[], 32.99, NULL, 'USD', 'account', 1, 0, 'published', false, true, 5.00, '', NULL),
    ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000003', '2x Mastery GamePass (Blox Fruits)', 'GamePass 2x Mastery (Blox Fruits)', '2x-mastery-gamepass-blox-fruits', 'Blox Fruits 2x Mastery GamePass. Earn mastery twice as fast on all combat styles, swords, guns, and Blox Fruits.', 'GamePass 2x Mastery សម្រាប់ Blox Fruits ជួយឡើង Mastery លឿនជាងមុន ២ ដង។', ARRAY['/categories/gamepass.png']::TEXT[], 4.99, NULL, 'USD', 'manual', 999, 0, 'published', true, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Best Seller'),
    ('20000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000003', '2x Money GamePass (Blox Fruits)', 'GamePass 2x Money (Blox Fruits)', '2x-money-gamepass-blox-fruits', 'Blox Fruits 2x Money GamePass. Doubles all Beli earned from quests and defeating bosses.', 'GamePass 2x Money សម្រាប់ Blox Fruits ជួយបង្កើនប្រាក់ Beli ២ ដងពីរាល់បេសកកម្ម និងការកម្ចាត់ Boss។', ARRAY['/categories/gamepass.png']::TEXT[], 4.99, NULL, 'USD', 'manual', 999, 0, 'published', true, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Hot Deal'),
    ('20000000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-000000000003', 'Dark Blade (Yoru) GamePass', 'GamePass Dark Blade / Yoru', 'dark-blade-yoru-gamepass-blox-fruits', 'Blox Fruits Dark Blade (Yoru) Mythical Sword GamePass. Grants instant access to one of the most powerful swords.', 'GamePass Dark Blade (Yoru) ដាវកម្រថ្នាក់ Mythical ដ៏មានឥទ្ធិពលបំផុតក្នុង Blox Fruits។', ARRAY['/categories/gamepass.png']::TEXT[], 12.99, NULL, 'USD', 'manual', 999, 0, 'published', true, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Mythical'),
    ('20000000-0000-0000-0000-000000000054', '10000000-0000-0000-0000-000000000003', 'Fast Boats (Luxury Boats) GamePass', 'GamePass Fast Boats', 'fast-boats-gamepass-blox-fruits', 'Blox Fruits Fast Boats GamePass. Unlocks the Miracle and Enforcer luxury speedboats.', 'GamePass Fast Boats ដោះសោរកាណូតល្បឿនលឿន Miracle និង Enforcer ក្នុង Blox Fruits។', ARRAY['/categories/gamepass.png']::TEXT[], 3.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000055', '10000000-0000-0000-0000-000000000003', '2x Boss Drops GamePass', 'GamePass 2x Boss Drops', '2x-boss-drops-gamepass', 'Blox Fruits 2x Boss Drops GamePass. Doubles drop rates for rare items and accessories from bosses.', 'Blox Fruits 2x Boss Drops GamePass. Doubles drop rates for rare items and accessories from bosses.', ARRAY['https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/topup/topup_1791369869520_d3c48517.jpg']::TEXT[], 3.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Starter'),
    ('20000000-0000-0000-0000-000000000056', '10000000-0000-0000-0000-000000000003', '+1 Fruit Storage (+1 Capacity)', 'GamePass +1 Fruit Storage', '1-fruit-storage-1-capacity', 'Blox Fruits +1 Fruit Storage GamePass. Adds +1 capacity to your Treasure Inventory storage.', 'Blox Fruits +1 Fruit Storage GamePass. Adds +1 capacity to your Treasure Inventory storage.', ARRAY['https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/topup/topup_1791367441974_5a3c629a.jpg']::TEXT[], 2.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-24hours.', 'Best Value'),
    ('20000000-0000-0000-0000-000000000057', '10000000-0000-0000-0000-000000000003', 'Fruit Notifier GamePass', 'GamePass Fruit Notifier', 'fruit-notifier-gamepass', 'Blox Fruits Fruit Notifier GamePass. Notifies you on-screen with exact meter distance whenever a fruit spawns.', 'Blox Fruits Fruit Notifier GamePass. Notifies you on-screen with exact meter distance whenever a fruit spawns.', ARRAY['https://ghstmiubmmfogscpohek.supabase.co/storage/v1/object/public/images/topup/topup_1791371516852_c441396a.jpg']::TEXT[], 13.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-24hours.', 'VIP / Ultra'),
    ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004', 'CapCut Pro 1 Year VIP Subscription', 'CapCut Pro ១ ឆ្នាំ (VIP Access)', 'capcut-pro-1-year-vip-subscription', 'CapCut Pro 1-Year VIP Subscription. Unlock all premium video transitions, effects, AI auto-captions, 4K 60FPS export, and cloud backup.', 'គណនី CapCut Pro ១ ឆ្នាំ ដោះសោរមុខងារ VIP Effects, Auto-Captions, 4K Export និង Cloud Storage គ្មានដែនកំណត់។', ARRAY['/products/capcut_pro.png']::TEXT[], 0.10, NULL, 'USD', 'account', 3, 1, 'published', true, true, 4.98, 'Log in to CapCut on Mobile/PC using the provided email and password credentials.', NULL),
    ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000004', 'Google Gemini Advanced 2.0 Ultra (1 Month)', 'Google Gemini Advanced (1 ខែ)', 'google-gemini-advanced-20-ultra-1-month', 'Google Gemini Advanced AI subscription. 2 Million token context window, Google Workspace integration, Deep Research, and highest tier AI capabilities.', 'គណនី Google Gemini Advanced 2.0 ប្រើប្រាស់ AI ជំនាន់ខ្ពស់បំផុត Context 2M Tokens និង Deep Research។', ARRAY['/products/gemini_advanced.png']::TEXT[], 0.10, NULL, 'USD', 'account', 5, 0, 'published', true, true, 5.00, 'Sign in at https://gemini.google.com with the delivered account details.', NULL),
    ('20000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000006', '100 Robux Fast Top-Up', 'កញ្ចប់ 100 Robux ភ្លាមៗ', '100-robux-fast-top-up', 'Instant delivery top-up package for 100 Robux Fast Top-Up.', 'Instant delivery top-up package for 100 Robux Fast Top-Up.', ARRAY['/categories/topup.png']::TEXT[], 0.10, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Please enter your Roblox Username or Player ID at checkout.', 'Popular'),
    ('20000000-0000-0000-0000-000000000200', '10000000-0000-0000-0000-000000000006', '200 Robux Fast Top-Up', 'កញ្ចប់ 200 Robux ភ្លាមៗ', '200-robux-fast-top-up-0200', 'Instant automated Roblox Fast Top-Up for 200 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 200 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 1.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000300', '10000000-0000-0000-0000-000000000006', '300 Robux Fast Top-Up', 'កញ្ចប់ 300 Robux ភ្លាមៗ', '300-robux-fast-top-up-0300', 'Instant automated Roblox Fast Top-Up for 300 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 300 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 2.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000400', '10000000-0000-0000-0000-000000000006', '400 Robux Fast Top-Up', 'កញ្ចប់ 400 Robux ភ្លាមៗ', '400-robux-fast-top-up-0400', 'Instant automated Roblox Fast Top-Up for 400 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 400 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 3.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Special'),
    ('20000000-0000-0000-0000-000000000500', '10000000-0000-0000-0000-000000000006', '500 Robux Fast Top-Up', 'កញ្ចប់ 500 Robux ភ្លាមៗ', '500-robux-fast-top-up-0500', 'Instant automated Roblox Fast Top-Up for 500 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 500 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 4.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Best Value'),
    ('20000000-0000-0000-0000-000000000600', '10000000-0000-0000-0000-000000000006', '600 Robux Fast Top-Up', 'កញ្ចប់ 600 Robux ភ្លាមៗ', '600-robux-fast-top-up-0600', 'Instant automated Roblox Fast Top-Up for 600 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 600 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 5.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Popular'),
    ('20000000-0000-0000-0000-000000000700', '10000000-0000-0000-0000-000000000006', '700 Robux Fast Top-Up', 'កញ្ចប់ 700 Robux ភ្លាមៗ', '700-robux-fast-top-up-0700', 'Instant automated Roblox Fast Top-Up for 700 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 700 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 6.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Special'),
    ('20000000-0000-0000-0000-000000000800', '10000000-0000-0000-0000-000000000006', '800 Robux Fast Top-Up', 'កញ្ចប់ 800 Robux ភ្លាមៗ', '800-robux-fast-top-up-0800', 'Instant automated Roblox Fast Top-Up for 800 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 800 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 7.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Hot Deal'),
    ('20000000-0000-0000-0000-000000000900', '10000000-0000-0000-0000-000000000006', '900 Robux Fast Top-Up', 'កញ្ចប់ 900 Robux ភ្លាមៗ', '900-robux-fast-top-up-0900', 'Instant automated Roblox Fast Top-Up for 900 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 900 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 8.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Special'),
    ('20000000-0000-0000-0000-000000001000', '10000000-0000-0000-0000-000000000006', '1,000 Robux Fast Top-Up', 'កញ្ចប់ 1,000 Robux ភ្លាមៗ', '1000-robux-fast-top-up-1000', 'Instant automated Roblox Fast Top-Up for 1,000 Robux Fast Top-Up. Zero password needed, safe 100%.', 'កញ្ចប់ 1,000 Robux ភ្លាមៗ', ARRAY['/categories/topup.png']::TEXT[], 9.99, NULL, 'USD', 'manual', 999, 0, 'published', false, true, 5.00, 'Enter your Roblox Username or Player ID. Delivery is instant automated within 1-3 minutes.', 'Super Value')
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
    ('store_name', '{"en": "DaraMini Digital Store", "km": "តារាមីនី ឌីជីថលស្ត័រ"}'::jsonb, 'Store public brand name'),
    ('store_currency', '"USD"'::jsonb, 'Base currency for transactions'),
    ('support_telegram', '"@rybunrak"'::jsonb, 'Telegram customer support handle'),
    ('maintenance_mode', 'false'::jsonb, 'Turn on to show maintenance screen'),
    ('low_stock_threshold', '3'::jsonb, 'Trigger admin alert when stock falls below this count'),
    ('min_order_amount', '0.10'::jsonb, 'Minimum checkout total amount'),
    ('max_order_amount', '2000.00'::jsonb, 'Maximum checkout total amount')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
