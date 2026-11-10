'use client'

/**
 * BenefitsGuidePage — quick reference for every card's credits:
 * amount + cadence, how to trigger it, and the rules that trip people up.
 *
 * Static program reference data (like transfer partners) — lives here as
 * typed constants, not in the DB. Last full audit: 2026-10-24.
 */

import { useMemo, useState } from 'react'
import type { Card } from '@/types/db'

type Benefit = {
  name: string
  value: string          // amount + cadence
  how: string            // how to use / trigger
  rules?: string[]       // gotchas
  flag?: 'new' | 'changed' | 'pending' | 'ending'
}

type Program = {
  id: string
  title: string
  match: (c: Card) => boolean
  fee: string
  notes?: string[]
  benefits: Benefit[]
}

const AUDITED = 'Nov 10, 2026'

const CHANGES: { date: string; text: string }[] = [
  { date: 'Jan 1, 2027', text: 'Every hotel credit now needs 2+ nights (Amex Lodging, The Edit, Citi). The one-night-per-card FHR split ends Dec 31, 2026 — use back-to-back 2-night bookings on different cards instead.' },
  { date: 'Jan 1, 2027', text: 'The Edit adds 10,000+ vacation homes (Plum Guide). Edit credit works on them (prepaid, 2+ nights, $250 max per booking); extra home perks need 4+ nights. Personal Reserve stays at $500/yr.' },
  { date: 'Dec 31, 2026', text: 'Sapphire Reserve $250 Select Hotel credit ends. No 2027 version announced.' },
  { date: 'Jan 1, 2027', text: 'Amex Platinum: FHR stays need 2+ nights to earn the lodging credit (FHR perks still apply on 1 night). Amex hasn’t said if this is booking date or stay date — finish 2026 one-nighters with both booking and stay in 2026 to be safe.' },
  { date: 'Oct 22, 2026', text: 'Amex Platinum: hotel credit renamed $600 Lodging Credit and now covers prepaid Airbnb Luxe (2+ nights) via Amex Travel. New $250/yr Airbnb Experiences credit. 5x on prepaid Airbnb via Amex Travel.' },
  { date: 'Oct 1, 2026', text: 'IHG Premier refresh in effect (Chase email): $25/quarter IHG food & beverage reward, $100/yr airline credit after $250+ direct airfare (through 2027), free-night cap 50k for nights issued in 2027, fee $150 in 2027, auto status drops to Gold on Jan 1, 2028.' },
  { date: 'Oct 1, 2026', text: 'Sapphire Reserve: DoorDash $5 restaurant credit → $15/mo on any order type.' },
  { date: 'Jul 1, 2026', text: 'CLEAR+ credit $209 → $219 (Platinum, Aspire) to match CLEAR price increase.' },
  { date: 'Jun 15, 2026', text: 'Sapphire Preferred: Chase Travel hotel credit $50 → $100, added $120 Global Entry/TSA credit, 1-yr Apple TV (activate by Dec 31, 2026).' },
  { date: 'Apr 30, 2026', text: 'Amex Gold: dining credit adds Buffalo Wild Wings + Wonder, drops Goldbelly + Wine.com. 5x on prepaid Amex Travel hotels.' },
]

const PROGRAMS: Program[] = [
  {
    id: 'plat', title: 'Amex Platinum',
    match: c => c.display_name.startsWith('Amex Platinum'),
    fee: '$895 — waived (MLA)',
    notes: ['Every credit below is per card — 6 cards = 6 of each.', 'Most monthly/quarterly credits need one-time enrollment in the Amex app (Benefits tab).'],
    benefits: [
      { name: 'Lodging Credit', value: '$300 Jan–Jun + $300 Jul–Dec', flag: 'changed',
        how: 'Prepaid ("Pay Now") Fine Hotels + Resorts, The Hotel Collection, or Airbnb Luxe booked on AmexTravel.com / Amex Travel app with that card.',
        rules: [
          'THC and Airbnb Luxe: 2-night minimum. FHR: 1 night OK through 2026, 2 nights from Jan 1, 2027.',
          'Charge must process by Jun 30 / Dec 31, 11:59 PM CT. Travel can be later.',
          'Resort/property fees and Pay Later / Pay at Hotel bookings don’t count.',
          'Posts within days, up to 90. Cancel/refund can claw it back.',
        ] },
      { name: 'Airbnb Experiences', value: '$250 / calendar year', flag: 'new',
        how: 'Unlock by booking a prepaid Airbnb Luxe stay through Amex Travel with the card. Then buy an Experience directly on Airbnb with the same card.',
        rules: [
          'Unlocks even if that Luxe stay didn’t use the lodging credit.',
          '2026: Experience must be purchased by Dec 31, 2026 — it can take place later.',
          'Experiences that kick you to a third-party site to pay don’t qualify.',
        ] },
      { name: 'Resy', value: '$100 / quarter',
        how: 'Enroll, then pay with the card at a U.S. Resy restaurant. Reservation not required.' },
      { name: 'Lululemon', value: '$75 / quarter',
        how: 'Enroll, then buy at U.S. Lululemon stores or lululemon.com.' },
      { name: 'Digital Entertainment', value: '$25 / month',
        how: 'Enroll; bill eligible streaming/news subs to the card (Disney+, Hulu, ESPN+, Peacock, Paramount+, YouTube, NYT, WSJ).' },
      { name: 'Uber Cash', value: '$15 / month (+$20 in Dec)',
        how: 'Add the card to the Uber app; cash loads on the 1st. Pay with an Amex card.',
        rules: ['U.S. rides/Eats only. Unused cash expires end of month.'] },
      { name: 'Uber One', value: '$120 / year',
        how: 'Pay the Uber One membership with the card (tracked on ···1002, ···2005).' },
      { name: 'Walmart+', value: '$12.95 / month + tax',
        how: 'Pay the monthly Walmart+ membership with the card (tracked on ···1002, ···2005).' },
      { name: 'Oura', value: '$200 / calendar year',
        how: 'Enroll, then buy an Oura Ring at ouraring.com with the card.' },
      { name: 'Airline Incidentals', value: '$200 / calendar year',
        how: 'Select one airline per year in the Amex account. Bags, seat fees, lounge passes, etc.',
        rules: ['Tickets don’t count. Pick the airline in January — limited changes.'] },
      { name: 'CLEAR+', value: '$219 / calendar year', flag: 'changed',
        how: 'Pay CLEAR+ membership with the card.' },
      { name: 'Global Entry / TSA PreCheck', value: '$120 every 4 yrs',
        how: 'Pay the application fee with the card.' },
    ],
  },
  {
    id: 'gold', title: 'Amex Gold',
    match: c => c.display_name.startsWith('Amex Gold'),
    fee: '$325 — waived (MLA)',
    benefits: [
      { name: 'Dining Credit', value: '$10 / month', flag: 'changed',
        how: 'Enroll; pay with the card at Grubhub/Seamless, Cheesecake Factory, Five Guys, Buffalo Wild Wings, or Wonder.' },
      { name: 'Dunkin’', value: '$7 / month', how: 'Enroll; U.S. Dunkin’ purchases.' },
      { name: 'Resy', value: '$50 Jan–Jun + $50 Jul–Dec', how: 'Enroll; pay at a U.S. Resy restaurant.' },
      { name: 'Uber Cash', value: '$10 / month', how: 'Add card to Uber; expires end of month.' },
      { name: 'Hotel Collection', value: '$100 property credit',
        how: 'Book 2+ nights at a Hotel Collection property on Amex Travel; spend on-property.' },
    ],
  },
  {
    id: 'aspire', title: 'Hilton Honors Aspire',
    match: c => c.display_name.startsWith('Hilton Honors Aspire'),
    fee: '$550 — waived (MLA)',
    benefits: [
      { name: 'Hilton Resort Credit', value: '$200 Jan–Jun + $200 Jul–Dec',
        how: 'Charges made directly with a participating Hilton Resort (room + incidentals on the folio).',
        rules: ['Third-party/OTA bookings don’t count. Must be a "resort" on Hilton’s list.'] },
      { name: 'Flight Credit', value: '$50 / quarter',
        how: 'Any flight purchase directly with an airline or via AmexTravel.com.' },
      { name: 'CLEAR+', value: '$219 / calendar year', flag: 'changed', how: 'Pay CLEAR+ with the card.' },
      { name: 'Free Night Rewards', value: '1/yr + 1 at $30k + 1 at $60k spend',
        how: 'Anniversary night auto-deposits; spend nights are calendar-year spend.' },
    ],
  },
  {
    id: 'csr', title: 'Chase Sapphire Reserve',
    match: c => c.display_name.startsWith('Chase Sapphire Reserve'),
    fee: '$795 — waived (MLA)',
    notes: ['Points earned before Oct 26, 2025 keep 1.5¢ in Chase Travel through Oct 2027; newer points are 1¢.'],
    benefits: [
      { name: '$300 Travel Credit', value: '$300 / cardmember year',
        how: 'Automatic on any travel purchase. Use hotel credits first.' },
      { name: 'The Edit', value: '$500 / calendar year (2 × $250)',
        how: 'Prepaid Edit property, 2+ nights, booked through Chase Travel.',
        rules: ['Max $250 per booking — two bookings for the full $500.', 'Both halves usable any time in the year.', 'From Jan 1, 2027 also works on Edit vacation homes.'] },
      { name: 'Select Hotel Credit (2026)', value: '$250 one-time', flag: 'ending',
        how: 'Prepaid Chase Travel stay, 2+ nights: IHG, Montage, Pendry, Omni, Virgin, Minor, Pan Pacific.',
        rules: ['Book in 2026 (stay can be 2027). Reported to stack with an Edit $250 on the same booking.'] },
      { name: 'DoorDash', value: 'DashPass + $15/mo + 2 × $10/mo', flag: 'changed',
        how: '$15 in-app credit any order type (from Oct 1, 2026) plus two $10 non-restaurant promos.',
        rules: ['Only the Sapphire card set as DoorDash default payment gets the benefit.'] },
      { name: 'Exclusive Tables (OpenTable)', value: '$150 Jan–Jun + $150 Jul–Dec',
        how: 'Book a Sapphire Reserve Exclusive Tables restaurant on OpenTable; pay with the card.' },
      { name: 'StubHub / viagogo', value: '$150 Jan–Jun + $150 Jul–Dec',
        how: 'Activate in Chase; buy tickets on StubHub/viagogo with the card.' },
      { name: 'Lyft', value: '$10 / month in Lyft credit', how: 'Link card in Lyft.' },
      { name: 'Peloton', value: '$10 / month', how: 'Pay Peloton membership with the card.' },
      { name: 'Apple TV+ / Apple Music', value: 'Complimentary', how: 'Activate through Chase.' },
      { name: 'Global Entry / TSA PreCheck', value: '$120 every 4 yrs', how: 'Pay the fee with the card.' },
    ],
  },
  {
    id: 'csp', title: 'Chase Sapphire Preferred',
    match: c => c.display_name.startsWith('Chase Sapphire Preferred'),
    fee: '$95 — waived (MLA)',
    benefits: [
      { name: 'Chase Travel Hotel Credit', value: '$100 / year', flag: 'changed',
        how: 'Hotel booked through Chase Travel with the card.' },
      { name: 'DoorDash', value: 'DashPass + $10/mo promo',
        how: 'Non-restaurant promo. Only works if this is the default Sapphire on DoorDash.' },
      { name: 'Apple TV+', value: '1 year free', flag: 'ending', how: 'Activate by Dec 31, 2026.' },
      { name: 'Global Entry / TSA PreCheck', value: '$120 every 4 yrs', flag: 'new', how: 'Pay the fee with the card.' },
    ],
  },
  {
    id: 'citi', title: 'Citi Strata Elite',
    match: c => c.display_name.startsWith('Citi Strata Elite'),
    fee: '$595 — waived (MLA)',
    benefits: [
      { name: 'Hotel Benefit', value: '$300 / calendar year',
        how: 'Prepaid 2+ night stay booked through Citi Travel. No enrollment.',
        rules: ['Book and pay in the calendar year; stay can be later. Both 2026 credits used (Austin).'] },
      { name: 'Splurge Credit', value: '$200 / calendar year',
        how: 'Pick up to 2 at citi.com/splurgecredit: 1stDibs, American Airlines, Best Buy, Future, Live Nation.' },
      { name: 'Blacklane', value: '$100 Jan–Jun + $100 Jul–Dec',
        how: 'Book a Blacklane ride with the card. Charged after the ride, so ride must happen in the period.' },
      { name: 'Global Entry / TSA PreCheck', value: '$120 every 4 yrs', how: 'Pay the fee with the card.' },
    ],
  },
  {
    id: 'ihg', title: 'IHG One Rewards Premier',
    match: c => c.display_name.startsWith('IHG'),
    fee: '$99 ($150 in 2027) — waived (MLA)',
    benefits: [
      { name: 'Anniversary Free Night', value: 'Up to 40k pts (50k if issued in 2027)', flag: 'changed',
        how: 'Auto on anniversary. Can top up with points.',
        rules: ['Stay must be completed within 12 months of issue.'] },
      { name: '4th Night Free', value: 'On award stays', how: 'Book 4+ night award stays; one night refunded.' },
      { name: 'United TravelBank', value: 'Up to $50 / year', how: 'Register the card with United; $25 posts about Jan 5 and Jul 5.', rules: ['Each deposit expires about six months later (Jul 15 / Jan 15).'] },
      { name: 'Airline Credit', value: '$100 / calendar year', flag: 'new', how: 'Statement credit after $250+ on flights bought direct from an airline. Runs through Dec 31, 2027.' },
      { name: 'IHG Food & Beverage Reward', value: '$25 / quarter', flag: 'new', how: 'Use on food and drink at IHG hotels.', rules: ['Expires at the end of each quarter.', 'Room must be in the cardholder’s name.'] },
      { name: 'Global Entry / TSA PreCheck', value: '$120 every 4 yrs', how: 'Pay the fee with the card. (Not mentioned in refresh — confirm.)' },
    ],
  },
  {
    id: 'boundless', title: 'Marriott Bonvoy Boundless',
    match: c => c.display_name.startsWith('Marriott'),
    fee: '$95 — waived (MLA)',
    benefits: [
      { name: 'Airline Credit', value: '$50 Jan–Jun + $50 Jul–Dec',
        how: 'Spend $250 directly with airlines in the half-year.',
        rules: ['Cards opened before Jan 7, 2026 must activate once on the offer site.', 'Runs through Jun 30, 2027.'] },
      { name: 'Annual Free Night', value: 'Up to 35k pts', how: 'Auto after account anniversary.' },
    ],
  },
  {
    id: 'swa', title: 'Southwest Rapid Rewards Premier',
    match: c => c.display_name.startsWith('Southwest'),
    fee: '$149 — waived (MLA)',
    benefits: [
      { name: 'Free checked bag', value: 'Cardholder + up to 8 on reservation', how: 'Automatic when linked to RR account.' },
      { name: 'Seat selection / boarding', value: 'Standard/Preferred seat at 48 hrs; Group 5+', how: 'Automatic.' },
    ],
  },
]

const FLAG_STYLE: Record<NonNullable<Benefit['flag']>, { bg: string; fg: string; label: string }> = {
  new:     { bg: '#dcfce7', fg: '#166534', label: 'New' },
  changed: { bg: '#e0f2fe', fg: '#075985', label: 'Changed' },
  pending: { bg: '#fef3c7', fg: '#92400e', label: 'Pending' },
  ending:  { bg: '#fee2e2', fg: '#991b1b', label: 'Ends' },
}

function Flag({ f }: { f: NonNullable<Benefit['flag']> }) {
  const s = FLAG_STYLE[f]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4,
      padding: '2px 6px', borderRadius: 999, background: s.bg, color: s.fg, marginLeft: 6 }}>
      {s.label}
    </span>
  )
}

function ProgramCard({ p, held }: { p: Program; held: Card[] }) {
  const [open, setOpen] = useState(false)
  const flags = p.benefits.filter(b => b.flag).length
  const label = held.map(c => `${c.owner === 'stephen' ? 'S' : 'K'}${c.last4 ? ' ···' + c.last4 : ''}`).join(', ')
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--sand)', overflow: 'hidden', marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left', padding: '16px 20px', background: 'transparent', border: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            {p.title} <span style={{ fontWeight: 400, color: 'var(--bark)' }}>×{held.length}</span>
            {flags > 0 && <span style={{ fontSize: 11, color: '#075985', marginLeft: 8 }}>{flags} update{flags > 1 ? 's' : ''}</span>}
          </p>
          <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>{label} · {p.fee}</p>
        </div>
        <span style={{ color: 'var(--bark)', transform: open ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--sand)' }}>
          {p.notes?.map(n => (
            <p key={n} style={{ fontSize: 12, color: 'var(--bark)', padding: '8px 20px 0' }}>• {n}</p>
          ))}
          {p.benefits.map(b => (
            <div key={b.name} style={{ padding: '12px 20px', borderBottom: '1px solid var(--sand)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {b.name}{b.flag && <Flag f={b.flag} />}
                </p>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ox)' }}>{b.value}</p>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>{b.how}</p>
              {b.rules && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {b.rules.map(r => <li key={r} style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>{r}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BenefitsGuidePage({ cards }: { cards: Card[] }) {
  const rows = useMemo(() => PROGRAMS
    .map(p => ({ p, held: cards.filter(p.match) }))
    .filter(r => r.held.length > 0), [cards])

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid var(--sand)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Recent &amp; upcoming changes</p>
        {CHANGES.map(c => (
          <p key={c.date + c.text} style={{ fontSize: 13, color: 'var(--ink)', marginTop: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ox)' }}>{c.date}</span> — {c.text}
          </p>
        ))}
        <p style={{ fontSize: 11, color: 'var(--bark)', marginTop: 10 }}>Last audited {AUDITED}. Verify terms in the issuer app before relying on an edge case.</p>
      </div>
      {rows.map(({ p, held }) => <ProgramCard key={p.id} p={p} held={held} />)}
    </div>
  )
}
