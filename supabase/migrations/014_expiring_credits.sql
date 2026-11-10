-- 014: expiring_credits(days) - unused credits and certificates expiring within N days.
-- Feeds the monthly email (Claude scheduled task, 1st of each month, to Stephen's Gmail).
-- Applied to the live DB 2026-11-10 via Supabase MCP.
create or replace function public.expiring_credits(days int default 60)
returns table (kind text, owner text, card text, item text, remaining_cents int, expires date, days_left int)
language sql stable
set search_path = public
as $$
with base as (
  select cr.id, c.owner, c.display_name, cr.name, cr.amount_cents, cr.period_type, cr.ends_permanently,
         c.anniversary_month am, c.anniversary_day ad,
         extract(year from current_date)::int y, extract(month from current_date)::int m
  from credits cr join cards c on c.id = cr.card_id
  where cr.active and c.active and not cr.autopilot and cr.period_type <> 'ended'
    and (not cr.single_instance or cr.is_primary_instance)
    and (cr.ends_permanently is null or cr.ends_permanently >= current_date)
    and cr.name not in ('Global Entry / TSA PreCheck — $120 every 4 years', 'CLEAR+', 'Blacklane Credit',
                        'Lyft Pink Credit', 'Peloton Credit', 'DoorDash DashPass Credit',
                        'Airbnb Experiences Credit (unlock w/ Luxe stay)')
), keyed as (
  select b.*,
    case b.period_type
      when 'monthly'    then to_char(current_date, 'YYYY-MM')
      when 'quarterly'  then y || '-Q' || ceil(m / 3.0)::int
      when 'semiannual' then y || '-' || case when m <= 6 then 'H1' else 'H2' end
      when 'cardmember_year' then 'cmy-' || case when am is null or ad is null then y
                                                 when current_date >= make_date(y, am, ad) then y else y - 1 end
      else y::text end as pk,
    case b.period_type
      when 'monthly'    then (date_trunc('month', current_date) + interval '1 month - 1 day')::date
      when 'quarterly'  then (date_trunc('quarter', current_date) + interval '3 months - 1 day')::date
      when 'semiannual' then case when m <= 6 then make_date(y, 6, 30) else make_date(y, 12, 31) end
      when 'cardmember_year' then case when am is null or ad is null then make_date(y, 12, 31)
                                       when current_date >= make_date(y, am, ad) then make_date(y + 1, am, ad) - 1
                                       else make_date(y, am, ad) - 1 end
      else make_date(y, 12, 31) end as pend
  from base b
), open_credits as (
  select 'credit'::text kind, k.owner, k.display_name card, k.name item,
         greatest(0, k.amount_cents - coalesce(u.amount_used_cents, 0)) remaining_cents,
         least(k.pend, coalesce(k.ends_permanently, k.pend)) expires
  from keyed k left join usage_log u on u.credit_id = k.id and u.period_key = k.pk
), certs as (
  select 'certificate'::text, c.owner, c.display_name, ce.name,
         coalesce(case when ce.is_balance_tracked then ce.balance_cents end, ce.value_high_cents, 0), ce.expires_at
  from certificates ce join cards c on c.id = ce.card_id
  where ce.status in ('active', 'pending', 'committed') and ce.expires_at is not null
)
select x.kind, x.owner, x.card, x.item, x.remaining_cents, x.expires, (x.expires - current_date)
from (select * from open_credits where remaining_cents > 0 union all select * from certs) x
where x.expires >= current_date and x.expires - current_date <= days
order by x.expires, x.remaining_cents desc, x.owner, x.card
$$;
revoke execute on function public.expiring_credits(int) from anon, authenticated;
