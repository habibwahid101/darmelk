-- Close the temporary representative live-production QA elevation. Preserve
-- synthetic activation, booking, reversal and admin audit history.
update members m
   set role = 'member', updated_at = now()
  from "user" u
 where m.user_id = u.id
   and lower(u.email) = 'darmelk-live-qa-admin-20260901@example.com';
