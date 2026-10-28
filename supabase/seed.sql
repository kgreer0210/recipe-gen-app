-- =============================================================================
-- FAKE SEED DATA for local development and preview branches.
--
-- Every user, email, password, and Stripe id in this file is made up.
-- NEVER run this file against production. It is applied by
-- `npx supabase db reset` (see [db.seed] in supabase/config.toml).
--
-- Test logins (local only): test.cook@example.com / password123 (free plan)
--                           test.pro@example.com  / password123 (pro plan)
--
-- Idempotent: every insert uses ON CONFLICT DO NOTHING with fixed UUIDs.
-- Does not touch mobile_waitlist or user_usage_counters.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- AUTH USERS (+ email identities, as Supabase local seeding expects)
-- -----------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'test.cook@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Test Cook"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'test.pro@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Test Pro"}',
    now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_object('sub', '00000000-0000-4000-8000-000000000001', 'email', 'test.cook@example.com', 'email_verified', true, 'provider', 'email'),
    'email', now(), now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    jsonb_build_object('sub', '00000000-0000-4000-8000-000000000002', 'email', 'test.pro@example.com', 'email_verified', true, 'provider', 'email'),
    'email', now(), now(), now()
  )
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- USER SETTINGS
-- -----------------------------------------------------------------------------

insert into public.user_settings (user_id, timezone, default_servings, dietary_preferences, disliked_ingredients)
values
  ('00000000-0000-4000-8000-000000000001', 'America/New_York', 2, '{}', '{"cilantro"}'),
  ('00000000-0000-4000-8000-000000000002', 'America/Chicago', 4, '{"vegetarian"}', '{}')
on conflict (user_id) do nothing;


-- -----------------------------------------------------------------------------
-- RECIPES
-- -----------------------------------------------------------------------------

insert into public.recipes (id, user_id, title, cuisine, meal_type, prep_time, cook_time, protein, servings, ingredients, instructions)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Test Lemon Garlic Chicken', 'Italian', 'dinner', '10 min', '25 min', 'chicken', 2,
    '[{"name":"Chicken breast","amount":1,"unit":"lb","category":"Meat"},{"name":"Garlic","amount":4,"unit":"clove","category":"Produce"},{"name":"Lemon","amount":1,"unit":"count","category":"Produce"},{"name":"Olive oil","amount":2,"unit":"tbsp","category":"Pantry"}]',
    '["Season the chicken with salt and pepper.","Sear in olive oil until golden on both sides.","Add garlic and lemon juice, then simmer until cooked through."]'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Test Black Bean Tacos', 'Mexican', 'dinner', '15 min', '10 min', 'beans', 2,
    '[{"name":"Black beans","amount":1,"unit":"count","category":"Pantry"},{"name":"Cumin","amount":1,"unit":"tsp","category":"Spices"},{"name":"Lime","amount":1,"unit":"count","category":"Produce"}]',
    '["Warm the beans with cumin.","Spoon into tortillas and finish with lime."]'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Test Overnight Oats', 'American', 'breakfast', '5 min', '0 min', 'none', 1,
    '[{"name":"Rolled oats","amount":0.5,"unit":"cup","category":"Pantry"},{"name":"Milk","amount":0.5,"unit":"cup","category":"Dairy"}]',
    '["Combine oats and milk in a jar.","Refrigerate overnight."]'
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000002',
    'Test Veggie Chickpea Curry', 'Indian', 'dinner', '15 min', '30 min', 'chickpeas', 4,
    '[{"name":"Chickpeas","amount":2,"unit":"count","category":"Pantry"},{"name":"Coconut milk","amount":1,"unit":"count","category":"Pantry"},{"name":"Curry powder","amount":2,"unit":"tsp","category":"Spices"}]',
    '["Toast the curry powder in oil.","Add chickpeas and coconut milk, then simmer 20 minutes."]'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000002',
    'Test Pasta Primavera', 'Italian', 'dinner', '10 min', '20 min', 'none', 4,
    '[{"name":"Pasta","amount":8,"unit":"oz","category":"Pantry"},{"name":"Garlic","amount":2,"unit":"clove","category":"Produce"}]',
    '["Boil the pasta.","Saute garlic and vegetables, then toss together."]'
  )
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- WEEKLY PLAN (current UTC week; day_of_week 0 = Monday, meal_slot as in CHECK)
-- -----------------------------------------------------------------------------

insert into public.weekly_plan (id, user_id, recipe_id, day_of_week, meal_slot)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 0, 'dinner'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 1, 'breakfast'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 2, 'dinner'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000201', 0, 'dinner'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000202', 3, 'dinner')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- GROCERY LIST AND PANTRY
-- -----------------------------------------------------------------------------

insert into public.grocery_list (id, user_id, name, amount, unit, category, is_checked, name_normalized, source, plan_week_start)
values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 'Garlic', 4, 'clove', 'Produce', false, 'garlic', 'plan', date_trunc('week', timezone('utc', now()))::date),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 'Lemon', 1, 'count', 'Produce', false, 'lemon', 'plan', date_trunc('week', timezone('utc', now()))::date),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 'Milk', 1, 'cup', 'Dairy', true, 'milk', 'manual', null),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000002', 'Chickpeas', 2, 'count', 'Pantry', false, 'chickpeas', 'plan', date_trunc('week', timezone('utc', now()))::date),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000002', 'Coconut milk', 1, 'count', 'Pantry', false, 'coconut milk', 'manual', null)
on conflict (id) do nothing;

insert into public.pantry_items (id, user_id, name, name_normalized, amount, unit, category, source)
values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', 'Olive oil', 'olive oil', 500, 'ml', 'Pantry', 'manual'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000001', 'Rice', 'rice', 2, 'cup', 'Pantry', 'manual'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000002', 'Chickpeas', 'chickpeas', 1, 'count', 'Pantry', 'leftover')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- SUBSCRIPTION: the pro test user. Stripe ids are fake and match no real object.
-- -----------------------------------------------------------------------------

insert into public.subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, status, price_id, plan_key)
values
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000002',
    'cus_test_fake_0002',
    'sub_test_fake_0002',
    'active',
    'price_test_fake_pro',
    'pro'
  )
on conflict (user_id) do nothing;
