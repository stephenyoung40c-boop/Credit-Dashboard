-- 013: one-query hotel credit snapshot + hotel library seeded from tracker history
-- Applied to the live DB 2026-11-10 via Supabase MCP.
--
--   select * from v_open_hotel_credits;                      -- open hotel credits right now
--   select * from hotel_credit_snapshot(date '2027-01-10');  -- credits as of a future charge date

update hotel_bookings set hotel_name = replace(hotel_name, '&amp;', '&') where hotel_name like '%&amp;%';
update hotel_weekends set best = replace(best, '&amp;', '&') where best like '%&amp;%';

create or replace function public.hotel_credit_snapshot(as_of date default current_date)
returns table (
  priority int, owner text, card text, credit text, program text, portal text,
  amount_cents int, used_cents int, remaining_cents int,
  per_booking_cap_cents int, min_nights int,
  period_key text, period_end date, days_left int, note text
)
language sql stable
set search_path = public
as $$
with base as (
  select cr.id, c.owner, c.display_name, cr.name, cr.amount_cents, cr.period_type, cr.ends_permanently,
         c.anniversary_month am, c.anniversary_day ad,
         extract(year from as_of)::int y, extract(month from as_of)::int m
  from credits cr join cards c on c.id = cr.card_id
  where cr.active and c.active
    and cr.name in ('Plat Lodging Credit (FHR/THC/Luxe)', 'The Edit Hotel Credit', '2026 Select Hotel Credit',
                    'Annual Hotel Benefit', 'Chase Travel Hotel Credit', 'Hilton Resort Credit', '$300 Annual Travel Credit')
    and (cr.ends_permanently is null or cr.ends_permanently >= as_of)
), keyed as (
  select b.*,
    case b.period_type
      when 'monthly'    then to_char(as_of, 'YYYY-MM')
      when 'quarterly'  then y || '-Q' || ceil(m / 3.0)::int
      when 'semiannual' then y || '-' || case when m <= 6 then 'H1' else 'H2' end
      when 'cardmember_year' then 'cmy-' || case when am is null or ad is null then y
                                                 when as_of >= make_date(y, am, ad) then y else y - 1 end
      else y::text end as pk,
    case b.period_type
      when 'monthly'    then (date_trunc('month', as_of) + interval '1 month - 1 day')::date
      when 'quarterly'  then (date_trunc('quarter', as_of) + interval '3 months - 1 day')::date
      when 'semiannual' then case when m <= 6 then make_date(y, 6, 30) else make_date(y, 12, 31) end
      when 'cardmember_year' then case when am is null or ad is null then make_date(y, 12, 31)
                                       when as_of >= make_date(y, am, ad) then make_date(y + 1, am, ad) - 1
                                       else make_date(y, am, ad) - 1 end
      else make_date(y, 12, 31) end as pend
  from base b
), joined as (
  select k.*, coalesce(u.amount_used_cents, 0) used,
         least(k.pend, coalesce(k.ends_permanently, k.pend)) as pe
  from keyed k left join usage_log u on u.credit_id = k.id and u.period_key = k.pk
)
select
  case j.name when '$300 Annual Travel Credit' then 9 when 'Hilton Resort Credit' then 5 else 1 end,
  j.owner, j.display_name, j.name,
  case j.name when 'Plat Lodging Credit (FHR/THC/Luxe)' then 'fhr/thc' when 'The Edit Hotel Credit' then 'edit'
              when '2026 Select Hotel Credit' then 'select' when 'Annual Hotel Benefit' then 'citi_travel'
              when 'Chase Travel Hotel Credit' then 'csp_hotel' when 'Hilton Resort Credit' then 'hilton_resort'
              else 'travel' end,
  case j.name when 'Plat Lodging Credit (FHR/THC/Luxe)' then 'amextravel.com (prepaid)'
              when 'Annual Hotel Benefit' then 'cititravel.com (prepaid)'
              when 'Hilton Resort Credit' then 'charge at a participating Hilton resort'
              when '$300 Annual Travel Credit' then 'any travel purchase - use last'
              else 'Chase Travel (prepaid)' end,
  j.amount_cents, j.used, greatest(0, j.amount_cents - j.used),
  case when j.name in ('The Edit Hotel Credit', '2026 Select Hotel Credit') then 25000 else j.amount_cents end,
  case j.name when 'Plat Lodging Credit (FHR/THC/Luxe)' then case when as_of >= date '2027-01-01' then 2 else 1 end
              when 'The Edit Hotel Credit' then 2 when '2026 Select Hotel Credit' then 2 when 'Annual Hotel Benefit' then 2
              else 1 end,
  j.pk, j.pe, (j.pe - as_of),
  case j.name when 'Plat Lodging Credit (FHR/THC/Luxe)' then 'Counts by charge date. 1-night FHR only if charged by Dec 31, 2026; THC and Airbnb Luxe always 2 nights.'
              when 'The Edit Hotel Credit' then '$250 max per booking; two bookings per year; cannot combine on one booking.'
              when '2026 Select Hotel Credit' then 'IHG, Omni, Montage, Pendry, Virgin, Minor, Pan Pacific. Stacks with The Edit on the same booking. Ends Dec 31, 2026.'
              when 'Annual Hotel Benefit' then 'Applied at checkout on Citi Travel, once per calendar year.'
              else null end
from joined j
$$;

revoke execute on function public.hotel_credit_snapshot(date) from anon, authenticated;

create or replace view public.v_open_hotel_credits with (security_invoker = true) as
  select * from public.hotel_credit_snapshot(current_date)
  where remaining_cents > 0
  order by priority, period_end, owner, card;

revoke all on public.v_open_hotel_credits from anon, authenticated;

insert into hotel_library (name, city, state, primary_program, program_fhr, program_thc, program_edit,
                           rate_low_cents, rate_high_cents, rate_source, rate_confidence, last_verified_at,
                           verification_notes, rate_check_in, rate_check_out)
select b.hotel_name, b.city, case when b.city = 'Charleston' then 'SC' else 'TX' end,
       (array_agg(b.program order by b.total_cents))[1],
       bool_or(b.program = 'fhr'), bool_or(b.program = 'thc'), bool_or(b.program = 'edit'),
       min(b.total_cents / greatest(b.nights, 1)), max(b.total_cents / greatest(b.nights, 1)),
       'Hotel Tracker history - all-in per night', 'MEDIUM', max(b.updated_at),
       concat_ws(' | ', 'Property credit $' || max(b.property_credit_cents) / 100, max(b.parking), max(b.distance)),
       min(b.check_in), max(b.check_out)
from hotel_bookings b
where b.program <> 'none' and b.total_cents is not null
  and not exists (select 1 from hotel_library)
group by b.hotel_name, b.city;
