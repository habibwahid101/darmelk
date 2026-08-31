-- Close the temporary, owner-approved production QA elevation. Preserve the
-- synthetic identity and its activation/admin audit history; only remove the
-- elevated role so no persistent QA administrator remains.
update members m
   set role = 'member', updated_at = now()
  from "user" u
 where m.user_id = u.id
   and lower(u.email) = 'darmelk-prod-qa-admin-20260831@example.com';
