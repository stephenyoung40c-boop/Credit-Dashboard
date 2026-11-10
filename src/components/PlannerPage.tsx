'use client'

/**
 * PlannerPage — "which credits can this stay burn?" in one screen.
 *
 * Pick dates and it builds the best split of the stay into separate prepaid
 * bookings, one hotel credit each, hotel credits first and the Sapphire $300
 * travel credit last. Hotel credits count by CHARGE date (prepaid = the day
 * you book), so a stay in a later period gets two plans: book now with what is
 * left this period, or wait and book once the credits reset.
 *
 * Rules encoded here (verified Nov 10, 2026):
 *   Amex Lodging  $300 per half-year per Platinum. FHR 1 night OK if charged by
 *                 Dec 31, 2026; 2 nights from Jan 1, 2027. THC/Luxe always 2.
 *   The Edit      $250 per booking, 2 bookings a year per Reserve, 2+ nights.
 *   Select Hotel  $250, 2026 only, 2+ nights, stacks on an Edit booking.
 *   Citi Strata   $300 per calendar year, 2+ nights.
 */

import { useMemo, useState } from 'react'
import type { Card, HotelLibrary } from '@/types/db'
import type { EnrichedCredit } from '@/types/enriched'
import { periodEnd, daysLeft } from '@/lib/deadlines'
import type { PeriodType } from '@/lib/period-key'

const LODGING = 'Plat Lodging Credit (FHR/THC/Luxe)'
const EDIT = 'The Edit Hotel Credit'
const SELECT = '2026 Select Hotel Credit'
const CITI = 'Annual Hotel Benefit'
const TRAVEL = '$300 Annual Travel Credit'
const HOTEL_CREDIT_NAMES = [LODGING, EDIT, SELECT, CITI]
const FHR_TWO_NIGHT_START = new Date(2027, 0, 1)

const money = (c: number) => '$' + Math.round(c / 100).toLocaleString()
const ownerName = (o: string) => (o === 'katie' ? 'Katie' : 'Stephen')
const parseDay = (s: string) => new Date(s + 'T12:00:00')
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Kind = 'amex' | 'edit' | 'citi'
type Unit = { kind: Kind; card: Card; cents: number; selectCents: number }
type Allowed = { fhr: boolean; thc: boolean; edit: boolean; citi: boolean }
type Booking = { unit: Unit; nights: number; label: string; portal: string }
type Plan = { bookings: Booking[]; credits: number; selectExtra: number; uncovered: number }

const ANY_HOTEL: Allowed = { fhr: true, thc: true, edit: true, citi: true }

/** What a credit will have available on `chargeDate` (full again if its period resets first). */
function availableOn(c: EnrichedCredit, card: Card, today: Date, chargeDate: Date): number {
  if (c.ends_permanently && chargeDate > new Date(c.ends_permanently + 'T23:59:59')) return 0
  const end = periodEnd(c.period_type as PeriodType, today, {
    anniversaryMonth: card.anniversary_month, anniversaryDay: card.anniversary_day,
    endsPermanently: c.ends_permanently,
  })
  if (end && chargeDate > new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)) return c.amount_cents
  return c.remaining_cents
}

function buildUnits(credits: EnrichedCredit[], cards: Card[], today: Date, chargeDate: Date): Unit[] {
  const cardMap = new Map(cards.map(c => [c.id, c]))
  const units: Unit[] = []
  const selectByCard = new Map<string, number>()
  for (const c of credits) {
    const card = cardMap.get(c.card_id)
    if (card && c.name === SELECT) selectByCard.set(card.id, availableOn(c, card, today, chargeDate))
  }
  for (const c of credits) {
    const card = cardMap.get(c.card_id)
    if (!card) continue
    const avail = availableOn(c, card, today, chargeDate)
    if (avail <= 0) continue
    if (c.name === LODGING) units.push({ kind: 'amex', card, cents: avail, selectCents: 0 })
    if (c.name === CITI) units.push({ kind: 'citi', card, cents: avail, selectCents: 0 })
    if (c.name === EDIT) {
      let left = avail
      let select = selectByCard.get(card.id) ?? 0
      while (left > 0) {
        const cents = Math.min(25000, left)
        units.push({ kind: 'edit', card, cents, selectCents: Math.min(25000, select) })
        select = 0
        left -= cents
      }
    }
  }
  return units
}

function minNightsFor(u: Unit, allowed: Allowed, chargeDate: Date): number | null {
  if (u.kind === 'amex') {
    if (allowed.fhr) return chargeDate >= FHR_TWO_NIGHT_START ? 2 : 1
    return allowed.thc ? 2 : null
  }
  if (u.kind === 'edit') return allowed.edit ? 2 : null
  return allowed.citi ? 2 : null
}

/** Greedy split: most credit per night first, one credit per booking. */
function makePlan(nights: number, units: Unit[], allowed: Allowed, chargeDate: Date): Plan {
  const usable = units
    .map(u => ({ u, min: minNightsFor(u, allowed, chargeDate) }))
    .filter((x): x is { u: Unit; min: number } => x.min != null)
    .sort((a, b) => b.u.cents / b.min - a.u.cents / a.min || b.u.cents - a.u.cents)
  const bookings: Booking[] = []
  let left = nights
  for (const { u, min } of usable) {
    if (left < min) continue
    bookings.push({
      unit: u, nights: min,
      label: u.kind === 'amex' ? (allowed.fhr ? 'Amex FHR' : 'Amex THC') : u.kind === 'edit' ? 'Chase The Edit' : 'Citi Travel',
      portal: u.kind === 'amex' ? 'amextravel.com' : u.kind === 'edit' ? 'Chase Travel' : 'cititravel.com',
    })
    left -= min
  }
  return {
    bookings,
    credits: bookings.reduce((s, b) => s + b.unit.cents, 0),
    selectExtra: bookings.reduce((s, b) => s + b.unit.selectCents, 0),
    uncovered: left,
  }
}

const box: React.CSSProperties = { background: '#fff', border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginBottom: 16 }
const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--sand)', fontSize: 14, background: '#fff' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--bark)', padding: '6px 8px', fontWeight: 600 }
const td: React.CSSProperties = { fontSize: 13, padding: '8px', borderTop: '1px solid var(--sand)', verticalAlign: 'top' }

function PlanCard({ title, sub, plan, travelLeft, warn }: { title: string; sub: string; plan: Plan; travelLeft: number; warn?: string }) {
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="fr" style={{ fontSize: 18 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>{sub}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#166534' }}>{money(plan.credits)}</p>
          <p style={{ fontSize: 11, color: 'var(--bark)' }}>in hotel credits{plan.selectExtra > 0 ? ` (+${money(plan.selectExtra)} Select at IHG/Omni etc.)` : ''}</p>
        </div>
      </div>
      {plan.bookings.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--bark)', marginTop: 12 }}>No hotel credit fits this stay.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead><tr><th style={th}>Booking</th><th style={th}>Nights</th><th style={th}>Book on</th><th style={th}>Card</th><th style={{ ...th, textAlign: 'right' }}>Credit</th></tr></thead>
          <tbody>
            {plan.bookings.map((b, i) => (
              <tr key={i}>
                <td style={td}>{i + 1}. {b.label}</td>
                <td style={td}>{b.nights}</td>
                <td style={td}>{b.portal}</td>
                <td style={td}>{ownerName(b.unit.card.owner)} · {b.unit.card.display_name}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                  {money(b.unit.cents)}{b.unit.selectCents > 0 ? ` +${money(b.unit.selectCents)}*` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plan.uncovered > 0 && plan.bookings.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 10 }}>
          {plan.uncovered} night{plan.uncovered === 1 ? '' : 's'} left over — add to any booking above.
          {travelLeft > 0 ? ` A Chase Travel booking would draw on the Sapphire travel credit (${money(travelLeft)} left).` : ''}
        </p>
      )}
      {plan.selectExtra > 0 && (
        <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 6 }}>* Select Hotel credit stacks only at IHG, Omni, Montage, Pendry, Virgin, Minor or Pan Pacific. Ends Dec 31, 2026.</p>
      )}
      {warn && <p style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{warn}</p>}
      {plan.bookings.length > 1 && (
        <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 6 }}>Back-to-back bookings at one hotel: ask the hotel to keep the reservations separate so each keeps its own property credit and breakfast.</p>
      )}
    </div>
  )
}

export default function PlannerPage({ cards, credits, library, today: todayStr }: {
  cards: Card[]
  credits: EnrichedCredit[]
  library: HotelLibrary[]
  today: string
}) {
  const today = useMemo(() => new Date(todayStr), [todayStr])
  const defaultIn = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return isoDay(d)   // next Friday
  }, [today])
  const [checkIn, setCheckIn] = useState(defaultIn)
  const [nights, setNights] = useState(2)
  const [city, setCity] = useState('all')

  const inDate = parseDay(checkIn)
  const outDate = new Date(inDate); outDate.setDate(outDate.getDate() + nights)

  const travelLeft = credits.filter(c => c.name === TRAVEL).reduce((s, c) => s + c.remaining_cents, 0)

  // Plan A — book today. Plan B — only when the stay is in a later half-year: book after the reset.
  const unitsNow = useMemo(() => buildUnits(credits, cards, today, today), [credits, cards, today])
  const planNow = useMemo(() => makePlan(nights, unitsNow, ANY_HOTEL, today), [nights, unitsNow, today])

  const half = (d: Date) => d.getFullYear() * 2 + (d.getMonth() >= 6 ? 1 : 0)
  const laterPeriod = half(inDate) > half(today)
  const resetDate = useMemo(() => new Date(inDate.getFullYear(), inDate.getMonth() >= 6 ? 6 : 0, 1), [inDate])
  const planLater = useMemo(
    () => (laterPeriod ? makePlan(nights, buildUnits(credits, cards, today, resetDate), ANY_HOTEL, resetDate) : null),
    [laterPeriod, nights, credits, cards, today, resetDate])

  const usesOneNightFhr = planNow.bookings.some(b => b.unit.kind === 'amex' && b.nights === 1)
  const stayIn2027 = inDate >= FHR_TWO_NIGHT_START

  // Known hotels, cheapest out-of-pocket first under the "book today" credits.
  const cities = useMemo(() => Array.from(new Set(library.map(h => h.city))).sort(), [library])
  const hotels = useMemo(() => {
    return library
      .filter(h => city === 'all' || h.city === city)
      .map(h => {
        const allowed: Allowed = { fhr: !!h.program_fhr, thc: !!h.program_thc, edit: !!h.program_edit, citi: false }
        const p = makePlan(nights, unitsNow, allowed, today)
        const low = h.rate_low_cents != null ? h.rate_low_cents * nights : null
        const high = h.rate_high_cents != null ? h.rate_high_cents * nights : null
        return { h, p, low, high, oop: low != null ? Math.max(0, low - p.credits) : null }
      })
      .sort((a, b) => (a.oop ?? 1e12) - (b.oop ?? 1e12))
  }, [library, city, nights, unitsNow, today])

  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div>
      <div style={{ ...box, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, color: 'var(--bark)' }}>Check-in<br />
          <input type="date" value={checkIn} min={isoDay(today)} onChange={e => e.target.value && setCheckIn(e.target.value)} style={input} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--bark)' }}>Nights<br />
          <select value={nights} onChange={e => setNights(Number(e.target.value))} style={input}>
            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <p style={{ fontSize: 13, color: 'var(--bark)', paddingBottom: 8 }}>{fmtDay(inDate)} → {fmtDay(outDate)}</p>
      </div>

      <PlanCard
        title="Book today"
        sub={`Prepaid charges post now, so this uses what is left this period (${unitsNow.length} open credit${unitsNow.length === 1 ? '' : 's'}).`}
        plan={planNow}
        travelLeft={travelLeft}
        warn={usesOneNightFhr && stayIn2027
          ? 'Amex has not confirmed that a 1-night FHR stay in 2027 still earns the credit when booked in 2026. Safer: keep 1-night FHR stays inside 2026.'
          : undefined}
      />

      {planLater && (
        <PlanCard
          title={`Or wait and book on/after ${resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          sub="Credits have reset by then. 2027 rules: every hotel credit needs 2+ nights."
          plan={planLater}
          travelLeft={travelLeft}
        />
      )}

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 className="fr" style={{ fontSize: 18 }}>Hotels already priced</h3>
          <select value={city} onChange={e => setCity(e.target.value)} style={input}>
            <option value="all">All cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 4 }}>
          Past all-in prices from the Hotel Tracker, not live rates. Out-of-pocket uses today&apos;s open credits for a {nights}-night stay.
        </p>
        {hotels.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--bark)', marginTop: 12 }}>No hotels saved yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead><tr><th style={th}>Hotel</th><th style={th}>Programs</th><th style={th}>Per night</th><th style={th}>Credits</th><th style={{ ...th, textAlign: 'right' }}>Est. out of pocket</th></tr></thead>
            <tbody>
              {hotels.map(({ h, p, low, high, oop }) => (
                <tr key={h.id}>
                  <td style={td}><b>{h.name}</b><br /><span style={{ color: 'var(--bark)', fontSize: 12 }}>{h.city}{h.verification_notes ? ` · ${h.verification_notes.split(' | ')[0]}` : ''}</span></td>
                  <td style={td}>{[h.program_fhr && 'FHR', h.program_thc && 'THC', h.program_edit && 'Edit'].filter(Boolean).join(' · ')}</td>
                  <td style={td}>{h.rate_low_cents != null ? money(h.rate_low_cents) : '—'}{h.rate_high_cents != null && h.rate_high_cents !== h.rate_low_cents ? `–${money(h.rate_high_cents)}` : ''}</td>
                  <td style={td}>{p.bookings.length ? `${p.bookings.length} × booking · ${money(p.credits)}` : 'none fit'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                    {oop != null ? money(oop) : '—'}
                    {low != null && high != null && high !== low ? <span style={{ fontWeight: 400, color: 'var(--bark)' }}> – {money(Math.max(0, high - p.credits))}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/** Today-tab strip: open hotel credits, soonest deadline first, with a jump to the planner. */
export function HotelBurnPanel({ cards, credits, today: todayStr, onPlan }: {
  cards: Card[]
  credits: EnrichedCredit[]
  today: string
  onPlan: () => void
}) {
  const today = new Date(todayStr)
  const cardMap = new Map(cards.map(c => [c.id, c]))
  const groups = HOTEL_CREDIT_NAMES.map(name => {
    const open = credits.filter(c => c.name === name && c.remaining_cents > 0 &&
      !(c.ends_permanently && today > new Date(c.ends_permanently + 'T23:59:59')))
    if (open.length === 0) return null
    const first = open[0]
    const card = cardMap.get(first.card_id)
    const end = periodEnd(first.period_type as PeriodType, today, {
      anniversaryMonth: card?.anniversary_month, anniversaryDay: card?.anniversary_day, endsPermanently: first.ends_permanently,
    })
    const who = open.map(c => {
      const k = cardMap.get(c.card_id)
      return k ? `${ownerName(k.owner)} ${k.last4 ? '···' + k.last4 : ''} ${money(c.remaining_cents)}`.replace('  ', ' ') : ''
    }).filter(Boolean).join(' · ')
    return {
      name: name === LODGING ? 'Amex Lodging (FHR/THC)' : name === EDIT ? 'Chase The Edit' : name === SELECT ? 'Chase Select Hotel' : 'Citi Strata hotel',
      total: open.reduce((s, c) => s + c.remaining_cents, 0), who, days: end ? daysLeft(end, today) : null,
    }
  }).filter((g): g is NonNullable<typeof g> => g != null)

  if (groups.length === 0) return null
  const total = groups.reduce((s, g) => s + g.total, 0)

  return (
    <div style={{ ...box, borderColor: 'var(--ox)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="fr" style={{ fontSize: 18 }}>Hotel credits to burn — {money(total)}</h3>
          <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>Counts by booking date. Prepay by the deadline; the stay can be later.</p>
        </div>
        <button onClick={onPlan} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--ox)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Plan a stay
        </button>
      </div>
      <div style={{ marginTop: 10 }}>
        {groups.map(g => (
          <div key={g.name} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--sand)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: g.days != null && g.days <= 21 ? '#fee2e2' : '#fef3c7', color: g.days != null && g.days <= 21 ? '#991b1b' : '#92400e', minWidth: 64, textAlign: 'center' }}>
              {g.days != null ? `${g.days}d left` : '—'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</p>
              <p style={{ fontSize: 12, color: 'var(--bark)' }}>{g.who}</p>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{money(g.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
