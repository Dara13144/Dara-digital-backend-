-- ============================================================================
-- Supabase Seed Data: seed.sql
-- Digital Products Store Telegram Mini App
-- ============================================================================

-- 1. Insert Standard Roles
INSERT INTO roles (id, name, description)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Full system access and settings management'),
    ('00000000-0000-0000-0000-000000000002', 'ADMIN', 'Store manager and orders processing'),
    ('00000000-0000-0000-0000-000000000003', 'STAFF', 'Customer support and inventory viewer'),
    ('00000000-0000-0000-0000-000000000004', 'USER', 'Standard store customer')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Default Categories
INSERT INTO categories (id, name, name_km, slug, icon, image_url, description, sort_order, status)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        'Game Keys',
        'កូដហ្គេម (Game Keys)',
        'game-keys',
        'Gamepad2',
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
        'Steam, Epic Games, PlayStation, Xbox, and Origin activation keys',
        1,
        'active'
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        'Gift Cards',
        'កាតកាដូ (Gift Cards)',
        'gift-cards',
        'Gift',
        'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop&q=80',
        'Apple iTunes, Google Play, Steam Wallet, Netflix gift cards',
        2,
        'active'
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        'Software & Tools',
        'កម្មវិធីកុំព្យូទ័រ (Software)',
        'software-tools',
        'Code2',
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
        'Windows 11 Pro, Office 365, Antivirus, and Developer Tool licenses',
        3,
        'active'
    ),
    (
        '10000000-0000-0000-0000-000000000004',
        'Premium Subscriptions',
        'គណនីពិសេស (Premium)',
        'premium-subscriptions',
        'Sparkles',
        'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80',
        'Spotify, YouTube Premium, Canva Pro, ChatGPT Plus, and VPN accounts',
        4,
        'active'
    ),
    (
        '10000000-0000-0000-0000-000000000005',
        'Telegram & Discord',
        'តេលេក្រាម & ឌីសខត (Social)',
        'telegram-discord',
        'Send',
        'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80',
        'Telegram Premium Gift codes, Discord Nitro 1/3/12 Months, Boosts',
        5,
        'active'
    ),
    (
        '10000000-0000-0000-0000-000000000006',
        'Game Top-Up',
        'បញ្ចូលលុយហ្គេម (Top Up)',
        'game-top-up',
        'Zap',
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
        'Mobile Legends Diamonds, PUBG UC, Free Fire Diamonds, Valorant Points',
        6,
        'active'
    )
ON CONFLICT (slug) DO NOTHING;

-- 3. Insert Products
INSERT INTO products (
    id, category_id, name, name_km, slug, description, description_km,
    images, price, discount_price, currency, stock_type, stock_quantity,
    sold_quantity, status, featured, published, rating, instructions
)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'Cyberpunk 2077: Phantom Liberty (Steam Key)',
        'Cyberpunk 2077: Phantom Liberty (Steam Key)',
        'cyberpunk-2077-phantom-liberty-steam',
        'Original Steam CD-Key for Cyberpunk 2077 Phantom Liberty Expansion. Global activation with instant delivery.',
        'កូដហ្គេម Cyberpunk 2077 Phantom Liberty លើ Steam ពិតប្រាកដ ១០០% ផ្ដល់ជូនភ្លាមៗ។',
        ARRAY['https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80'],
        29.99,
        24.99,
        'USD',
        'code',
        3,
        15,
        'published',
        true,
        true,
        4.95,
        '1. Open Steam client.\n2. Click Games -> Activate a Product on Steam.\n3. Enter the delivered key and click Next.'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002',
        'Apple Gift Card $10 (US Region)',
        'កាតកាដូ Apple $10 (សហរដ្ឋអាមេរិក)',
        'apple-gift-card-10-us',
        'Digital Apple Gift Card $10 USD for App Store, iTunes, and iCloud subscriptions on US accounts.',
        'កាត App Store & iTunes $10 USD សម្រាប់គណនីសហរដ្ឋអាមេរិក ប្រើទិញ App និង Subscriptions។',
        ARRAY['https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop&q=80'],
        10.50,
        9.90,
        'USD',
        'code',
        4,
        42,
        'published',
        true,
        true,
        5.00,
        '1. Open App Store.\n2. Tap your profile icon.\n3. Tap "Redeem Gift Card or Code" and enter your code.'
    ),
    (
        '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000003',
        'Windows 11 Professional OEM Key (1 PC)',
        'Windows 11 Pro OEM Key (1 PC)',
        'windows-11-pro-oem-key',
        'Lifetime genuine activation key for Windows 11 Professional 64/32 Bit for 1 PC.',
        'កូដកម្មវិធី Windows 11 Pro ពិតប្រាកដ ប្រើបានមួយជីវិតសម្រាប់កុំព្យូទ័រ ១ គ្រឿង។',
        ARRAY['https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80'],
        12.00,
        7.50,
        'USD',
        'code',
        5,
        128,
        'published',
        true,
        true,
        4.98,
        '1. Go to Settings > System > Activation.\n2. Click "Change product key" and paste the key.'
    ),
    (
        '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000005',
        'Telegram Premium 3 Months Gift Code',
        'Telegram Premium 3 ខែ (Gift Code)',
        'telegram-premium-3-months',
        'Instant Telegram Premium 3-Month activation link/code. 4GB uploads, fast downloads, exclusive badges.',
        'តេលេក្រាមពិសេស ៣ ខែ ផ្ដល់ជូនល្បឿនទាញយកលឿន និងរូបសញ្ញាផ្តាច់មុខ។',
        ARRAY['https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80'],
        11.99,
        9.99,
        'USD',
        'link',
        3,
        96,
        'published',
        true,
        true,
        4.99,
        'Open the delivered https://t.me/giftcode/... link directly on Telegram to activate.'
    ),
    (
        '20000000-0000-0000-0000-000000000005',
        '10000000-0000-0000-0000-000000000004',
        'Canva Pro 1 Year Private Invite',
        'Canva Pro ១ ឆ្នាំ (Invite)',
        'canva-pro-1-year-invite',
        'Canva Pro subscription linked to your personal email with unlimited templates, AI tools, and background remover.',
        'គណនី Canva Pro ១ ឆ្នាំ ប្រើប្រាស់មុខងារ AI និង Templates គ្មានដែនកំណត់។',
        ARRAY['https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80'],
        15.00,
        8.99,
        'USD',
        'link',
        3,
        74,
        'published',
        true,
        true,
        4.92,
        'Click the invitation link delivered in your order and log in with your Canva account.'
    ),
    (
        '20000000-0000-0000-0000-000000000006',
        '10000000-0000-0000-0000-000000000006',
        'Mobile Legends 296 Diamonds Direct Top-Up',
        'ពេជ្រ Mobile Legends 296 Diamonds',
        'mobile-legends-296-diamonds',
        'Official Mobile Legends 296 Diamonds top-up code for quick redemption.',
        'បញ្ចូលពេជ្រ Mobile Legends 296 Diamonds ចូលគណនីរហ័សទាន់ចិត្ត។',
        ARRAY['https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'],
        5.50,
        4.99,
        'USD',
        'code',
        3,
        310,
        'published',
        true,
        true,
        4.90,
        'Redeem on Mobile Legends official redemption page or inside game redeem dialog.'
    )
ON CONFLICT (slug) DO NOTHING;

-- 4. Insert Initial Stock Items (Pre-hashed SHA-256 for integrity)
INSERT INTO stock_items (product_id, stock_type, payload, stock_hash, status)
VALUES
    -- Cyberpunk 2077
    ('20000000-0000-0000-0000-000000000001', 'code', 'STEAM-CP77-A1B2-C3D4-E5F6', encode(digest('STEAM-CP77-A1B2-C3D4-E5F6', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000001', 'code', 'STEAM-CP77-G7H8-I9J0-K1L2', encode(digest('STEAM-CP77-G7H8-I9J0-K1L2', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000001', 'code', 'STEAM-CP77-M3N4-O5P6-Q7R8', encode(digest('STEAM-CP77-M3N4-O5P6-Q7R8', 'sha256'), 'hex'), 'available'),

    -- Apple Gift Card $10
    ('20000000-0000-0000-0000-000000000002', 'code', 'XAPL-9988-7766-5544-3322', encode(digest('XAPL-9988-7766-5544-3322', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000002', 'code', 'XAPL-1122-3344-5566-7788', encode(digest('XAPL-1122-3344-5566-7788', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000002', 'code', 'XAPL-4455-6677-8899-0011', encode(digest('XAPL-4455-6677-8899-0011', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000002', 'code', 'XAPL-5566-7788-9900-1122', encode(digest('XAPL-5566-7788-9900-1122', 'sha256'), 'hex'), 'available'),

    -- Windows 11 Pro OEM
    ('20000000-0000-0000-0000-000000000003', 'code', 'VK7JG-NPHTM-C97JM-9MPGT-3V66T', encode(digest('VK7JG-NPHTM-C97JM-9MPGT-3V66T', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000003', 'code', 'W269N-WFGWX-YVC9B-4J6C9-T83GX', encode(digest('W269N-WFGWX-YVC9B-4J6C9-T83GX', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000003', 'code', 'MH37W-N47XK-V7XM9-C7227-GCQG9', encode(digest('MH37W-N47XK-V7XM9-C7227-GCQG9', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000003', 'code', 'NRG8B-VKK3Q-CXVCJ-9G2XF-6Q84J', encode(digest('NRG8B-VKK3Q-CXVCJ-9G2XF-6Q84J', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000003', 'code', '9F2HK-N7836-K9P86-HM388-29HCT', encode(digest('9F2HK-N7836-K9P86-HM388-29HCT', 'sha256'), 'hex'), 'available'),

    -- Telegram Premium Links
    ('20000000-0000-0000-0000-000000000004', 'link', 'https://t.me/giftcode/TG-PREM-3M-A7B8C9D0', encode(digest('https://t.me/giftcode/TG-PREM-3M-A7B8C9D0', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000004', 'link', 'https://t.me/giftcode/TG-PREM-3M-E1F2G3H4', encode(digest('https://t.me/giftcode/TG-PREM-3M-E1F2G3H4', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000004', 'link', 'https://t.me/giftcode/TG-PREM-3M-I5J6K7L8', encode(digest('https://t.me/giftcode/TG-PREM-3M-I5J6K7L8', 'sha256'), 'hex'), 'available'),

    -- Canva Pro Invite Links
    ('20000000-0000-0000-0000-000000000005', 'link', 'https://www.canva.com/brand/join?token=cnv_invite_771a2b', encode(digest('https://www.canva.com/brand/join?token=cnv_invite_771a2b', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000005', 'link', 'https://www.canva.com/brand/join?token=cnv_invite_882b3c', encode(digest('https://www.canva.com/brand/join?token=cnv_invite_882b3c', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000005', 'link', 'https://www.canva.com/brand/join?token=cnv_invite_993c4d', encode(digest('https://www.canva.com/brand/join?token=cnv_invite_993c4d', 'sha256'), 'hex'), 'available'),

    -- MLBB Diamonds
    ('20000000-0000-0000-0000-000000000006', 'code', 'MLBB-296D-8822-7711-4433', encode(digest('MLBB-296D-8822-7711-4433', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000006', 'code', 'MLBB-296D-5544-9988-1122', encode(digest('MLBB-296D-5544-9988-1122', 'sha256'), 'hex'), 'available'),
    ('20000000-0000-0000-0000-000000000006', 'code', 'MLBB-296D-3322-1100-6677', encode(digest('MLBB-296D-3322-1100-6677', 'sha256'), 'hex'), 'available')
ON CONFLICT (product_id, stock_hash) DO NOTHING;

-- 5. Insert Sample Coupons
INSERT INTO coupons (code, description, discount_type, discount_value, minimum_amount, maximum_discount, usage_limit, per_user_limit, active)
VALUES
    ('WELCOME10', 'Welcome 10% Discount on first purchase', 'percentage', 10.00, 5.00, 10.00, 1000, 1, true),
    ('DARAMINI2', '$2 off on orders above $15', 'fixed', 2.00, 15.00, NULL, 500, 2, true),
    ('SPECIAL50', 'VIP 50% discount up to $20', 'percentage', 50.00, 20.00, 20.00, 100, 1, true)
ON CONFLICT (code) DO NOTHING;

-- 6. Insert Store Settings
INSERT INTO settings (key, value, description)
VALUES
    ('store_name', '{"en": "DaraMini Digital Store", "km": "តារាមីនី ឌីជីថលស្ត័រ"}'::jsonb, 'Store public brand name'),
    ('store_currency', '"USD"'::jsonb, 'Base currency for transactions'),
    ('support_telegram', '"@DaraMiniSupport"'::jsonb, 'Telegram customer support handle'),
    ('maintenance_mode', 'false'::jsonb, 'Turn on to show maintenance screen'),
    ('low_stock_threshold', '3'::jsonb, 'Trigger admin alert when stock falls below this count'),
    ('min_order_amount', '1.00'::jsonb, 'Minimum checkout total amount'),
    ('max_order_amount', '2000.00'::jsonb, 'Maximum checkout total amount')
ON CONFLICT (key) DO NOTHING;
