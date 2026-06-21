-- supabase/migrations/009_menu_import.sql
-- Full menu import from the real printed menu (Lê Gia Ẩm Thực Truyền Thống).
-- Recipe quantities for everything outside the original Bún Riêu bowls are
-- estimates based on typical Vietnamese restaurant portion sizes — the user
-- explicitly authorized estimation here since no real reference numbers were
-- available. Adjust freely via Settings/Kho after reviewing.
--
-- All new items start at quantity 0 — fill in real counts via the Kho
-- tap-to-edit count feature, not this migration.

-- ============================================================
-- 0. New units already added to the app-level ItemUnit type;
--    extend the DB-level CHECK constraint to match.
-- ============================================================
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_unit_check;
ALTER TABLE items
  ADD CONSTRAINT items_unit_check
  CHECK (unit IN ('g', 'ml', 'gói', 'phần', 'miếng', 'bó', 'viên', 'chai', 'quả', 'lon', 'nậm', 'cái'));

-- ============================================================
-- 1. Rename existing "Chả" to match the real menu's "Giò tai"
--    (same product, different name in the original seed data).
-- ============================================================
UPDATE items SET name_vi = 'Giò tai', name_en = 'Pork ear roll' WHERE name_vi = 'Chả';

-- ============================================================
-- 2. New ingredient items (one row per existing branch each).
-- ============================================================
INSERT INTO items (branch_id, name_vi, name_en, unit, quantity, low_threshold)
SELECT id, v.name_vi, v.name_en, v.unit, 0, v.low_threshold
FROM branches, (VALUES
  ('Bò',               'Beef',                 'g',    3000),
  ('Gà',               'Chicken',              'g',    3000),
  ('Chân gà',          'Chicken feet',         'g',    1000),
  ('Sụn gà',           'Chicken cartilage',    'g',    1000),
  ('Cánh gà',          'Chicken wings',        'g',    1000),
  ('Ếch',              'Frog',                 'g',    2000),
  ('Tôm',              'Shrimp',               'g',    1500),
  ('Tóp mỡ',           'Crispy pork fat',      'g',    1000),
  ('Trạch',            'Mudfish/eel',          'g',    1000),
  ('Mực',              'Squid',                'g',    1000),
  ('Ngao',             'Clams',                'g',    1500),
  ('Đậu mỡ',           'Fried fatty tofu',     'miếng', 10),
  ('Trứng vịt lộn',    'Balut',                'quả',  10),
  ('Trứng gà ta',      'Free-range chicken egg', 'quả', 10),
  ('Rau muống',        'Water spinach',        'bó',   5),
  ('Rau cải',          'Mustard greens',       'bó',   5),
  ('Rau susu',         'Chayote greens',       'bó',   5),
  ('Dưa chuột',        'Cucumber',             'quả',  10),
  ('Xoài xanh',        'Green mango',          'quả',  10),
  ('Củ đậu',           'Jicama',               'g',    1000),
  ('Ngô',              'Corn',                 'quả',  10),
  ('Khoai lang',       'Sweet potato',         'g',    1000),
  ('Khoai tây',        'Potato',               'g',    1000),
  ('Nem chua',         'Fermented pork roll',  'miếng', 10),
  ('Nấm',              'Mushroom',             'g',    500),
  ('Rau lẩu',          'Hotpot mixed vegetables', 'g', 1000),
  ('Váng đậu',         'Tofu skin',            'g',    500),
  ('Chả ốc',           'Snail paste',          'g',    500),
  ('Xúc xích',         'Sausage',              'cái',  10),
  ('Tràng trứng gà non','Chicken oviduct',     'g',    500),
  ('Quẩy',             'Fried dough stick',    'cái',  10),
  ('Thịt dải',         'Pork belly strip',     'g',    1000),
  ('Má heo',           'Pork cheek',           'g',    1000),
  ('Cocacola',         'Coca-Cola',            'lon',  10),
  ('Nước cam (lon)',   'Canned orange drink',  'lon',  10),
  ('Lavie',            'Lavie bottled water',  'chai', 10),
  ('Rượu dừa',         'Coconut wine',         'quả',  3),
  ('Rượu Mận',         'Plum wine',            'nậm',  2),
  ('Rượu táo mèo',     'Wild apple wine',      'nậm',  2),
  ('Rượu nếp cái hoa vàng', 'Golden rice wine', 'nậm', 2),
  ('Rượu mơ',          'Apricot wine',         'chai', 2),
  ('Bia Sài Gòn',      'Saigon beer',          'chai', 10),
  ('Bia Tiger',        'Tiger beer',           'chai', 10)
) AS v(name_vi, name_en, unit, low_threshold);

-- ============================================================
-- 3. Deactivate the 3 placeholder Bún Riêu dishes — replaced
--    below by the menu's real bowl variants. Deactivating (not
--    deleting) preserves any existing order history.
-- ============================================================
UPDATE dishes SET is_active = false
WHERE name_vi IN ('Bún riêu chay', 'Bún riêu đặc biệt', 'Bún riêu thường');

-- ============================================================
-- 4. New dishes (one row per existing branch each).
-- ============================================================
INSERT INTO dishes (branch_id, name_vi, name_en, price, category, is_topping)
SELECT id, v.name_vi, v.name_en, v.price, v.category, v.is_topping
FROM branches, (VALUES
  -- Bún riêu bowls
  ('Bát đặc biệt',                 'Special bowl',                       60000, 'Bún riêu', false),
  ('Bát đặc biệt không đậu',       'Special bowl, no tofu',              55000, 'Bún riêu', false),
  ('Bát đặc biệt không trứng',     'Special bowl, no egg',               55000, 'Bún riêu', false),
  ('Bát đặc biệt không giò',       'Special bowl, no pork roll',         55000, 'Bún riêu', false),
  ('Bát đặc biệt không mọc',       'Special bowl, no pork balls',        45000, 'Bún riêu', false),
  ('Bát đặc biệt không bò',        'Special bowl, no beef',              40000, 'Bún riêu', false),
  ('Bún riêu bò',                  'Beef bún riêu',                      35000, 'Bún riêu', false),
  ('Bát bún cho em bé dưới 6 tuổi','Free bowl for children under 6',         0, 'Bún riêu', false),
  ('Bún ăn thêm',                  'Free extra noodles',                     0, 'Bún riêu', false),

  -- Đồ gọi thêm (regular toppings)
  ('Mọc thêm',          'Extra pork balls',        8000, 'Đồ gọi thêm', true),
  ('Đậu mỡ chiên',       'Fried fatty tofu',        5000, 'Đồ gọi thêm', true),
  ('Giò tai thêm',       'Extra pork ear roll',     8000, 'Đồ gọi thêm', true),
  ('Trứng vịt lộn',      'Balut',                  10000, 'Đồ gọi thêm', true),
  ('Bò thêm',            'Extra beef',             15000, 'Đồ gọi thêm', true),
  ('Tóp mỡ thêm',        'Extra crispy pork fat',  10000, 'Đồ gọi thêm', true),
  ('Quẩy',               'Fried dough stick',       3000, 'Đồ gọi thêm', true),
  ('Trứng gà ta trần',   'Soft-boiled free-range egg', 15000, 'Đồ gọi thêm', true),

  -- Đồ gọi thêm lẩu (hotpot add-ons)
  ('Nhãn lẩu riêu (nhỏ)', 'Riêu hotpot refill (small)', 230000, 'Đồ gọi thêm lẩu', true),
  ('Nhãn lẩu riêu (to)',  'Riêu hotpot refill (large)', 390000, 'Đồ gọi thêm lẩu', true),
  ('Nhãn lẩu ếch (nhỏ)',  'Frog hotpot refill (small)', 230000, 'Đồ gọi thêm lẩu', true),
  ('Nhãn lẩu ếch (to)',   'Frog hotpot refill (large)', 390000, 'Đồ gọi thêm lẩu', true),
  ('Nhãn lẩu thái (nhỏ)', 'Thai hotpot refill (small)', 290000, 'Đồ gọi thêm lẩu', true),
  ('Nhãn lẩu thái (to)',  'Thai hotpot refill (large)', 390000, 'Đồ gọi thêm lẩu', true),
  ('Gà ta thêm lẩu (nửa con)', 'Chicken hotpot add-on (half)', 200000, 'Đồ gọi thêm lẩu', true),
  ('Gà ta thêm lẩu (1 con)',   'Chicken hotpot add-on (whole)', 390000, 'Đồ gọi thêm lẩu', true),
  ('Ba chỉ bò Mỹ thêm lẩu', 'US beef hotpot add-on', 150000, 'Đồ gọi thêm lẩu', true),
  ('Sụn gà thêm lẩu',     'Chicken cartilage hotpot add-on', 150000, 'Đồ gọi thêm lẩu', true),
  ('Tràng trứng gà non thêm lẩu', 'Chicken oviduct hotpot add-on', 150000, 'Đồ gọi thêm lẩu', true),
  ('Chả ốc ống nứa thêm lẩu', 'Snail paste hotpot add-on', 95000, 'Đồ gọi thêm lẩu', true),
  ('Mực thêm lẩu',        'Squid hotpot add-on', 150000, 'Đồ gọi thêm lẩu', true),
  ('Tôm thêm lẩu',        'Shrimp hotpot add-on', 150000, 'Đồ gọi thêm lẩu', true),
  ('Ngao thêm lẩu',       'Clams hotpot add-on', 35000, 'Đồ gọi thêm lẩu', true),
  ('Xúc xích thêm lẩu',   'Sausage hotpot add-on', 65000, 'Đồ gọi thêm lẩu', true),
  ('Trứng vịt lộn sống (lẩu)', 'Raw balut for hotpot', 10000, 'Đồ gọi thêm lẩu', true),
  ('Giò tai thêm lẩu',    'Pork ear roll hotpot add-on', 50000, 'Đồ gọi thêm lẩu', true),
  ('Đậu phụ thêm lẩu',    'Tofu hotpot add-on', 30000, 'Đồ gọi thêm lẩu', true),
  ('Ngô ngọt thêm lẩu',   'Sweet corn hotpot add-on', 30000, 'Đồ gọi thêm lẩu', true),
  ('Rau + nấm thêm lẩu',  'Vegetables + mushroom hotpot add-on', 35000, 'Đồ gọi thêm lẩu', true),
  ('Nấm thêm lẩu',        'Mushroom hotpot add-on', 30000, 'Đồ gọi thêm lẩu', true),
  ('Váng đậu',            'Tofu skin', 40000, 'Đồ gọi thêm lẩu', true),

  -- Lẩu (hotpot mains)
  ('Lẩu riêu cua tóp mỡ (nhỏ)', 'Crab hotpot with pork fat (small, 2-3 people)', 290000, 'Lẩu', false),
  ('Lẩu riêu cua tóp mỡ (to)',  'Crab hotpot with pork fat (large, 4-5 people)', 490000, 'Lẩu', false),
  ('Lẩu ếch măng cay (nhỏ)',    'Spicy frog hotpot (small, 2-3 people)', 290000, 'Lẩu', false),
  ('Lẩu ếch măng cay (to)',     'Spicy frog hotpot (large, 4-5 people)', 490000, 'Lẩu', false),
  ('Lẩu gà',                    'Chicken hotpot (whole pot)', 550000, 'Lẩu', false),
  ('Lẩu thái hải sản (nhỏ)',    'Thai seafood hotpot (small, 2-3 people)', 350000, 'Lẩu', false),
  ('Lẩu thái hải sản (to)',     'Thai seafood hotpot (large, 4-5 people)', 490000, 'Lẩu', false),

  -- Món đặc trưng (specialty dishes + sides)
  ('Tôm nướng',           'Grilled shrimp', 150000, 'Món đặc trưng', false),
  ('Tôm hấp bia',         'Beer-steamed shrimp', 150000, 'Món đặc trưng', false),
  ('Tóp mỡ xào dưa',      'Crispy pork fat stir-fried with pickled mustard', 165000, 'Món đặc trưng', false),
  ('Tóp mỡ chiên cay',    'Spicy fried crispy pork fat', 165000, 'Món đặc trưng', false),
  ('Trạch chiên giòn',    'Crispy fried mudfish', 165000, 'Món đặc trưng', false),
  ('Đậu phụ chiên giòn',  'Crispy fried tofu', 40000, 'Món đặc trưng', false),
  ('Đậu phụ tẩm mỡ hành', 'Tofu with scallion oil', 65000, 'Món đặc trưng', false),
  ('Salad rau',           'Vegetable salad', 65000, 'Món đặc trưng', false),
  ('Ngô chiên',           'Fried corn', 40000, 'Món đặc trưng', false),
  ('Khoai lang chiên',    'Fried sweet potato', 40000, 'Món đặc trưng', false),
  ('Khoai tây chiên',     'Fried potato', 40000, 'Món đặc trưng', false),
  ('Khoai tây lắc phô mai', 'Cheese fries', 55000, 'Món đặc trưng', false),
  ('Nem chua rán',        'Fried fermented pork roll', 75000, 'Món đặc trưng', false),
  ('Dưa chuột chẻ',       'Sliced cucumber', 40000, 'Món đặc trưng', false),
  ('Xoài xanh',           'Green mango', 40000, 'Món đặc trưng', false),
  ('Củ đậu',              'Jicama', 40000, 'Món đặc trưng', false),
  ('Rau muống xào tỏi',   'Water spinach stir-fried with garlic', 45000, 'Món đặc trưng', false),
  ('Rau muống xào bò',    'Water spinach stir-fried with beef', 150000, 'Món đặc trưng', false),
  ('Rau cải xào tỏi',     'Mustard greens stir-fried with garlic', 45000, 'Món đặc trưng', false),
  ('Rau cải xào bò',      'Mustard greens stir-fried with beef', 150000, 'Món đặc trưng', false),
  ('Rau susu xào tỏi',    'Chayote greens stir-fried with garlic', 45000, 'Món đặc trưng', false),
  ('Rau susu xào bò',     'Chayote greens stir-fried with beef', 150000, 'Món đặc trưng', false),
  ('Thịt dải nướng',      'Grilled pork belly strip', 195000, 'Món đặc trưng', false),
  ('Má heo nướng',        'Grilled pork cheek', 195000, 'Món đặc trưng', false),
  ('Tràng trứng cháy tỏi','Garlic-charred chicken oviduct', 195000, 'Món đặc trưng', false),

  -- Món bò
  ('Bò bít tết',          'Beef steak', 195000, 'Món bò', false),
  ('Bò sốt tiêu đen',     'Beef in black pepper sauce', 195000, 'Món bò', false),
  ('Bò sốt me',           'Beef in tamarind sauce', 195000, 'Món bò', false),
  ('Bò cháy tỏi',         'Garlic-charred beef', 195000, 'Món bò', false),
  ('Bò xào dưa',          'Beef stir-fried with pickled mustard', 150000, 'Món bò', false),
  ('Bò xào măng trúc',    'Beef stir-fried with bamboo shoots', 150000, 'Món bò', false),
  ('Bắp bò nộm rau tiến vua', 'Beef shank salad with tiến vua greens', 150000, 'Món bò', false),

  -- Món gà
  ('Gà chiên mắm tỏi (nửa con)', 'Fried chicken with garlic fish sauce (half)', 165000, 'Món gà', false),
  ('Gà chiên mắm tỏi (1 con)',   'Fried chicken with garlic fish sauce (whole)', 295000, 'Món gà', false),
  ('Gà rang muối hải sản (nửa con)', 'Salt-roasted chicken (half)', 165000, 'Món gà', false),
  ('Gà rang muối hải sản (1 con)',   'Salt-roasted chicken (whole)', 295000, 'Món gà', false),
  ('Gà rang gừng (nửa con)', 'Ginger-roasted chicken (half)', 165000, 'Món gà', false),
  ('Gà rang gừng (1 con)',   'Ginger-roasted chicken (whole)', 295000, 'Món gà', false),
  ('Chân gà dầm cóc sốt thái', 'Chicken feet with green ambarella, Thai sauce', 85000, 'Món gà', false),
  ('Chân gà dầm xoài sốt thái', 'Chicken feet with mango, Thai sauce', 85000, 'Món gà', false),
  ('Chân gà rang muối hải sản', 'Salt-roasted chicken feet', 85000, 'Món gà', false),
  ('Chân gà chiên mắm tỏi',    'Fried chicken feet with garlic fish sauce', 85000, 'Món gà', false),
  ('Nộm chân gà rút xương',    'Boneless chicken feet salad', 85000, 'Món gà', false),
  ('Chân gà ngâm xả tắc',      'Chicken feet pickled in lemongrass and kumquat', 85000, 'Món gà', false),
  ('Sụn gà rang muối hải sản', 'Salt-roasted chicken cartilage', 95000, 'Món gà', false),
  ('Sụn gà chiên mắm tỏi',     'Fried chicken cartilage with garlic fish sauce', 95000, 'Món gà', false),
  ('Cánh gà chiên mắm tỏi',    'Fried chicken wings with garlic fish sauce', 85000, 'Món gà', false),
  ('Cánh gà rang muối hải sản','Salt-roasted chicken wings', 85000, 'Món gà', false),

  -- Món ếch
  ('Ếch sốt trứng muối',  'Frog in salted egg sauce', 165000, 'Món ếch', false),
  ('Ếch sốt chua ngọt',   'Frog in sweet and sour sauce', 165000, 'Món ếch', false),
  ('Ếch rang muối',       'Salt-roasted frog', 165000, 'Món ếch', false),
  ('Ếch chiên mắm',       'Fried frog with fish sauce', 165000, 'Món ếch', false),
  ('Ếch xào măng cay',    'Frog stir-fried with spicy bamboo shoots', 165000, 'Món ếch', false),
  ('Ếch sốt me',          'Frog in tamarind sauce', 165000, 'Món ếch', false),
  ('Da ếch chiên cay',    'Spicy fried frog skin', 105000, 'Món ếch', false),
  ('Tủ và ếch xào dưa',   'Frog and tủ và stir-fried with pickled mustard', 165000, 'Món ếch', false),
  ('Tủ và ếch chiên cay', 'Spicy fried frog and tủ và', 165000, 'Món ếch', false),

  -- Đồ uống
  ('Cam tươi ép',         'Fresh-squeezed orange juice', 35000, 'Đồ uống', false),
  ('Dứa ép',              'Fresh pineapple juice', 35000, 'Đồ uống', false),
  ('Dưa hấu ép',          'Fresh watermelon juice', 35000, 'Đồ uống', false),
  ('Trà tắc Ô long',      'Oolong tea with kumquat', 25000, 'Đồ uống', false),
  ('Trà thảo mộc',        'Herbal tea', 25000, 'Đồ uống', false),
  ('Trà sâm dứa (cốc)',   'Pandan ginseng tea (cup)', 5000, 'Đồ uống', false),
  ('Trà sâm dứa (ca)',    'Pandan ginseng tea (jug)', 40000, 'Đồ uống', false),
  ('Sữa đậu nành',        'Soy milk', 10000, 'Đồ uống', false),
  ('Cocacola',            'Coca-Cola', 20000, 'Đồ uống', false),
  ('Nước cam (lon)',      'Canned orange drink', 20000, 'Đồ uống', false),
  ('Lavie',               'Lavie bottled water', 15000, 'Đồ uống', false),
  ('Rượu dừa',            'Coconut wine', 75000, 'Đồ uống', false),
  ('Rượu Mận',            'Plum wine', 85000, 'Đồ uống', false),
  ('Rượu táo mèo',        'Wild apple wine', 75000, 'Đồ uống', false),
  ('Rượu nếp cái hoa vàng', 'Golden rice wine', 75000, 'Đồ uống', false),
  ('Rượu mơ',             'Apricot wine', 120000, 'Đồ uống', false),
  ('Bia Sài Gòn',         'Saigon beer', 20000, 'Đồ uống', false),
  ('Bia Tiger',           'Tiger beer', 25000, 'Đồ uống', false)
) AS v(name_vi, name_en, price, category, is_topping);

-- ============================================================
-- 5. Recipe lines. Quantities outside the original Bún tươi
--    150g (already correct) are estimates — adjust freely.
--    Joined on matching branch_id so multi-branch data stays
--    correctly paired.
-- ============================================================

-- Helper pattern repeated below:
-- INSERT INTO recipe_lines (dish_id, item_id, qty_per_serving)
-- SELECT d.id, i.id, <qty> FROM dishes d JOIN items i ON i.branch_id = d.branch_id
-- WHERE d.name_vi = '<dish>' AND i.name_vi = '<item>';

-- Bún riêu bowls — shared base (bún, riêu cua, hành lá, rau sống) plus their
-- specific named ingredients, one unit of each per bowl (matching how "thêm"
-- toppings are priced as +1 unit on top of what's already included).
INSERT INTO recipe_lines (dish_id, item_id, qty_per_serving)
SELECT d.id, i.id, x.qty
FROM dishes d
JOIN items i ON i.branch_id = d.branch_id
JOIN (VALUES
  ('Bát đặc biệt', 'Bún tươi', 150), ('Bát đặc biệt', 'Riêu cua', 1), ('Bát đặc biệt', 'Hành lá', 1), ('Bát đặc biệt', 'Rau sống', 1),
  ('Bát đặc biệt', 'Bò', 40), ('Bát đặc biệt', 'Giò tai', 1), ('Bát đặc biệt', 'Đậu mỡ', 1), ('Bát đặc biệt', 'Mọc', 3), ('Bát đặc biệt', 'Trứng vịt lộn', 1),

  ('Bát đặc biệt không đậu', 'Bún tươi', 150), ('Bát đặc biệt không đậu', 'Riêu cua', 1), ('Bát đặc biệt không đậu', 'Hành lá', 1), ('Bát đặc biệt không đậu', 'Rau sống', 1),
  ('Bát đặc biệt không đậu', 'Bò', 40), ('Bát đặc biệt không đậu', 'Giò tai', 1), ('Bát đặc biệt không đậu', 'Mọc', 3), ('Bát đặc biệt không đậu', 'Trứng vịt lộn', 1),

  ('Bát đặc biệt không trứng', 'Bún tươi', 150), ('Bát đặc biệt không trứng', 'Riêu cua', 1), ('Bát đặc biệt không trứng', 'Hành lá', 1), ('Bát đặc biệt không trứng', 'Rau sống', 1),
  ('Bát đặc biệt không trứng', 'Bò', 40), ('Bát đặc biệt không trứng', 'Giò tai', 1), ('Bát đặc biệt không trứng', 'Đậu mỡ', 1), ('Bát đặc biệt không trứng', 'Mọc', 3),

  ('Bát đặc biệt không giò', 'Bún tươi', 150), ('Bát đặc biệt không giò', 'Riêu cua', 1), ('Bát đặc biệt không giò', 'Hành lá', 1), ('Bát đặc biệt không giò', 'Rau sống', 1),
  ('Bát đặc biệt không giò', 'Bò', 40), ('Bát đặc biệt không giò', 'Đậu mỡ', 1), ('Bát đặc biệt không giò', 'Mọc', 3), ('Bát đặc biệt không giò', 'Trứng vịt lộn', 1),

  ('Bát đặc biệt không mọc', 'Bún tươi', 150), ('Bát đặc biệt không mọc', 'Riêu cua', 1), ('Bát đặc biệt không mọc', 'Hành lá', 1), ('Bát đặc biệt không mọc', 'Rau sống', 1),
  ('Bát đặc biệt không mọc', 'Bò', 40), ('Bát đặc biệt không mọc', 'Giò tai', 1), ('Bát đặc biệt không mọc', 'Đậu mỡ', 1), ('Bát đặc biệt không mọc', 'Trứng vịt lộn', 1),

  ('Bát đặc biệt không bò', 'Bún tươi', 150), ('Bát đặc biệt không bò', 'Riêu cua', 1), ('Bát đặc biệt không bò', 'Hành lá', 1), ('Bát đặc biệt không bò', 'Rau sống', 1),
  ('Bát đặc biệt không bò', 'Giò tai', 1), ('Bát đặc biệt không bò', 'Đậu mỡ', 1), ('Bát đặc biệt không bò', 'Mọc', 3), ('Bát đặc biệt không bò', 'Trứng vịt lộn', 1),

  ('Bún riêu bò', 'Bún tươi', 150), ('Bún riêu bò', 'Riêu cua', 1), ('Bún riêu bò', 'Hành lá', 1), ('Bún riêu bò', 'Rau sống', 1), ('Bún riêu bò', 'Bò', 40),

  ('Bát bún cho em bé dưới 6 tuổi', 'Bún tươi', 100),
  ('Bún ăn thêm', 'Bún tươi', 100),

  -- Đồ gọi thêm
  ('Mọc thêm', 'Mọc', 1), ('Đậu mỡ chiên', 'Đậu mỡ', 1), ('Giò tai thêm', 'Giò tai', 1),
  ('Trứng vịt lộn', 'Trứng vịt lộn', 1), ('Bò thêm', 'Bò', 50), ('Tóp mỡ thêm', 'Tóp mỡ', 80),
  ('Trứng gà ta trần', 'Trứng gà ta', 1), ('Quẩy', 'Quẩy', 1),

  -- Đồ gọi thêm lẩu
  ('Nhãn lẩu riêu (nhỏ)', 'Riêu cua', 3), ('Nhãn lẩu riêu (nhỏ)', 'Tóp mỡ', 100),
  ('Nhãn lẩu riêu (to)', 'Riêu cua', 5), ('Nhãn lẩu riêu (to)', 'Tóp mỡ', 180),
  ('Nhãn lẩu ếch (nhỏ)', 'Ếch', 400), ('Nhãn lẩu ếch (to)', 'Ếch', 700),
  ('Nhãn lẩu thái (nhỏ)', 'Tôm', 150), ('Nhãn lẩu thái (nhỏ)', 'Mực', 100), ('Nhãn lẩu thái (nhỏ)', 'Ngao', 150),
  ('Nhãn lẩu thái (to)', 'Tôm', 250), ('Nhãn lẩu thái (to)', 'Mực', 180), ('Nhãn lẩu thái (to)', 'Ngao', 250),
  ('Gà ta thêm lẩu (nửa con)', 'Gà', 650), ('Gà ta thêm lẩu (1 con)', 'Gà', 1300),
  ('Ba chỉ bò Mỹ thêm lẩu', 'Bò', 300), ('Sụn gà thêm lẩu', 'Sụn gà', 200),
  ('Tràng trứng gà non thêm lẩu', 'Tràng trứng gà non', 200), ('Chả ốc ống nứa thêm lẩu', 'Chả ốc', 150),
  ('Mực thêm lẩu', 'Mực', 200), ('Tôm thêm lẩu', 'Tôm', 200), ('Ngao thêm lẩu', 'Ngao', 300),
  ('Xúc xích thêm lẩu', 'Xúc xích', 4), ('Trứng vịt lộn sống (lẩu)', 'Trứng vịt lộn', 1),
  ('Giò tai thêm lẩu', 'Giò tai', 3), ('Đậu phụ thêm lẩu', 'Đậu hũ', 2), ('Ngô ngọt thêm lẩu', 'Ngô', 2),
  ('Rau + nấm thêm lẩu', 'Rau lẩu', 300), ('Rau + nấm thêm lẩu', 'Nấm', 150),
  ('Nấm thêm lẩu', 'Nấm', 200), ('Váng đậu', 'Váng đậu', 100),

  -- Lẩu mains (same composition as their "Nhãn lẩu" refill counterpart)
  ('Lẩu riêu cua tóp mỡ (nhỏ)', 'Riêu cua', 3), ('Lẩu riêu cua tóp mỡ (nhỏ)', 'Tóp mỡ', 100),
  ('Lẩu riêu cua tóp mỡ (to)', 'Riêu cua', 5), ('Lẩu riêu cua tóp mỡ (to)', 'Tóp mỡ', 180),
  ('Lẩu ếch măng cay (nhỏ)', 'Ếch', 400), ('Lẩu ếch măng cay (to)', 'Ếch', 700),
  ('Lẩu thái hải sản (nhỏ)', 'Tôm', 150), ('Lẩu thái hải sản (nhỏ)', 'Mực', 100), ('Lẩu thái hải sản (nhỏ)', 'Ngao', 150),
  ('Lẩu thái hải sản (to)', 'Tôm', 250), ('Lẩu thái hải sản (to)', 'Mực', 180), ('Lẩu thái hải sản (to)', 'Ngao', 250),
  ('Lẩu gà', 'Gà', 1300),

  -- Món đặc trưng
  ('Tôm nướng', 'Tôm', 200), ('Tôm hấp bia', 'Tôm', 200),
  ('Tóp mỡ xào dưa', 'Tóp mỡ', 150), ('Tóp mỡ chiên cay', 'Tóp mỡ', 150),
  ('Trạch chiên giòn', 'Trạch', 200),
  ('Đậu phụ chiên giòn', 'Đậu hũ', 4), ('Đậu phụ tẩm mỡ hành', 'Đậu hũ', 4),
  ('Salad rau', 'Rau sống', 1),
  ('Ngô chiên', 'Ngô', 2), ('Khoai lang chiên', 'Khoai lang', 200), ('Khoai tây chiên', 'Khoai tây', 200), ('Khoai tây lắc phô mai', 'Khoai tây', 200),
  ('Nem chua rán', 'Nem chua', 4),
  ('Dưa chuột chẻ', 'Dưa chuột', 2), ('Xoài xanh', 'Xoài xanh', 1), ('Củ đậu', 'Củ đậu', 200),
  ('Rau muống xào tỏi', 'Rau muống', 1), ('Rau muống xào bò', 'Rau muống', 1), ('Rau muống xào bò', 'Bò', 150),
  ('Rau cải xào tỏi', 'Rau cải', 1), ('Rau cải xào bò', 'Rau cải', 1), ('Rau cải xào bò', 'Bò', 150),
  ('Rau susu xào tỏi', 'Rau susu', 1), ('Rau susu xào bò', 'Rau susu', 1), ('Rau susu xào bò', 'Bò', 150),
  ('Thịt dải nướng', 'Thịt dải', 200), ('Má heo nướng', 'Má heo', 200), ('Tràng trứng cháy tỏi', 'Tràng trứng gà non', 200),

  -- Món bò
  ('Bò bít tết', 'Bò', 220), ('Bò sốt tiêu đen', 'Bò', 220), ('Bò sốt me', 'Bò', 220), ('Bò cháy tỏi', 'Bò', 220),
  ('Bò xào dưa', 'Bò', 180), ('Bò xào măng trúc', 'Bò', 180), ('Bắp bò nộm rau tiến vua', 'Bò', 180),

  -- Món gà
  ('Gà chiên mắm tỏi (nửa con)', 'Gà', 650), ('Gà chiên mắm tỏi (1 con)', 'Gà', 1300),
  ('Gà rang muối hải sản (nửa con)', 'Gà', 650), ('Gà rang muối hải sản (1 con)', 'Gà', 1300),
  ('Gà rang gừng (nửa con)', 'Gà', 650), ('Gà rang gừng (1 con)', 'Gà', 1300),
  ('Chân gà dầm cóc sốt thái', 'Chân gà', 200), ('Chân gà dầm xoài sốt thái', 'Chân gà', 200),
  ('Chân gà rang muối hải sản', 'Chân gà', 200), ('Chân gà chiên mắm tỏi', 'Chân gà', 200),
  ('Nộm chân gà rút xương', 'Chân gà', 200), ('Chân gà ngâm xả tắc', 'Chân gà', 200),
  ('Sụn gà rang muối hải sản', 'Sụn gà', 200), ('Sụn gà chiên mắm tỏi', 'Sụn gà', 200),
  ('Cánh gà chiên mắm tỏi', 'Cánh gà', 250), ('Cánh gà rang muối hải sản', 'Cánh gà', 250),

  -- Món ếch
  ('Ếch sốt trứng muối', 'Ếch', 280), ('Ếch sốt chua ngọt', 'Ếch', 280), ('Ếch rang muối', 'Ếch', 280),
  ('Ếch chiên mắm', 'Ếch', 280), ('Ếch xào măng cay', 'Ếch', 280), ('Ếch sốt me', 'Ếch', 280),
  ('Da ếch chiên cay', 'Ếch', 120), ('Tủ và ếch xào dưa', 'Ếch', 280), ('Tủ và ếch chiên cay', 'Ếch', 280),

  -- Đồ uống (only packaged/bottled drinks get a stock link — fresh-made
  -- juices and teas are made to order with no countable stock unit)
  ('Cocacola', 'Cocacola', 1), ('Nước cam (lon)', 'Nước cam (lon)', 1), ('Lavie', 'Lavie', 1),
  ('Rượu dừa', 'Rượu dừa', 1), ('Rượu Mận', 'Rượu Mận', 1), ('Rượu táo mèo', 'Rượu táo mèo', 1),
  ('Rượu nếp cái hoa vàng', 'Rượu nếp cái hoa vàng', 1), ('Rượu mơ', 'Rượu mơ', 1),
  ('Bia Sài Gòn', 'Bia Sài Gòn', 1), ('Bia Tiger', 'Bia Tiger', 1)
) AS x(dish_name, item_name, qty) ON x.dish_name = d.name_vi AND x.item_name = i.name_vi;
