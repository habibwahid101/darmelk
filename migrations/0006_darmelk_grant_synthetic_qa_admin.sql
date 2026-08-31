-- Temporary, owner-approved production QA grant for one unmistakably
-- synthetic Darmelk identity. A later migration removes this role after the
-- remaining admin workflow checks complete; no real member is affected.
update members m
   set role = 'admin', updated_at = now()
  from "user" u
 where m.user_id = u.id
   and lower(u.email) = 'darmelk-prod-qa-admin-20260831@example.com';
