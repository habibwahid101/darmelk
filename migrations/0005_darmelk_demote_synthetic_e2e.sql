-- The approved production E2E identity was the first member provisioned and
-- exposed the unsafe legacy "first member becomes admin" bootstrap rule.
-- Demote only that synthetic identity; real administrators remain controlled
-- exclusively through the ADMIN_EMAILS production setting.
update members m
   set role = 'member', updated_at = now()
  from "user" u
 where m.user_id = u.id
   and lower(u.email) = 'darmelk-e2e-20260830-1432@example.com'
   and m.role = 'admin';
