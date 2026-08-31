-- Temporary representative live-production QA elevation for one exact,
-- synthetic identity. Migration 0009 removes it after the admin checks.
update members m
   set role = 'admin', updated_at = now()
  from "user" u
 where m.user_id = u.id
   and lower(u.email) = 'darmelk-live-qa-admin-20260901@example.com';
