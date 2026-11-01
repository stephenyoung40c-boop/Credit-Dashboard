'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Card, HotelBooking, HotelWeekend, HotelProgram } from '@/types/db'
import type { EnrichedCredit } from '@/types/enriched'

const PROGRAM_LABEL: Record<HotelProgram, string> = {
  fhr: 'FHR', thc: 'THC', edit: 'The Edit', citi_travel: 'Citi Strata', none: 'Direct',
}
const PROGRAM_ISSUER: Record<HotelProgram, string> = {
  fhr: 'Amex', thc: 'Amex', edit: 'Chase', citi_travel: 'Citi', none: '—',
}
const PROGRAM_CREDIT_NAME: Record<HotelProgram, string> = {
  fhr: 'Plat Lodging Credit (FHR/THC/Luxe)', thc: 'Plat Lodging Credit (FHR/THC/Luxe)',
  edit: 'The Edit Hotel Credit', citi_travel: 'Annual Hotel Benefit', none: '',
}
const PROGRAM_INCREMENT_CENTS: Record<HotelProgram, number> = {
  fhr: 30000, thc: 30000, edit: 25000, citi_travel: 30000, none: 0,
}
const PROGRAM_MIN_NIGHTS: Record<HotelProgram, number> = { fhr: 1, thc: 2, edit: 2, citi_travel: 2, none: 1 }
const PROGRAM_COLOR: Record<HotelProgram, string> = {
  fhr: '#7c5cbf', thc: '#0f6d5c', edit: '#2f5fa8', citi_travel: '#b5651d', none: '#736c60',
}
const PROGRAM_SOURCE: Record<HotelProgram, string> = {
  fhr: 'Amex · amextravel.com', thc: 'Amex · amextravel.com',
  edit: 'Chase · Chase Travel', citi_travel: 'Citi · cititravel.com', none: 'Booked directly — no card credit',
}

const fmt = (c: number | null | undefined) =>
  c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtWhole = (c: number) => `$${Math.round(c / 100).toLocaleString()}`

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

// A weekend is "past" once the last day in its label (e.g. "Nov 30–Dec 2") has ended.
// Labels carry no year, so assume the nearest occurrence within the last ~6 months / next ~6 months.
function weekendEnded(label: string, now: Date): boolean {
  const m = label.match(/^\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\s*[–-]\s*(?:([A-Za-z]{3})[a-z]*\.?\s+)?(\d{1,2}))?/)
  if (!m) return false
  const sm = MONTHS[m[1].toLowerCase()]
  const em = m[3] ? MONTHS[m[3].toLowerCase()] : sm
  const ed = m[4] ? Number(m[4]) : Number(m[2])
  if (sm == null || em == null) return false
  let year = now.getFullYear()
  const build = (y: number) => new Date(em < sm ? y + 1 : y, em, ed, 23, 59, 59)
  if (build(year).getTime() < now.getTime() - 183 * 86400000) year += 1
  return build(year).getTime() < now.getTime()
}

function oopFor(b: HotelBooking): number | null {
  if (b.total_cents == null) return null
  const credit = b.booked ? b.credits_used_cents : PROGRAM_INCREMENT_CENTS[b.program]
  return Math.max(0, b.total_cents - credit)
}

export default function HotelTrackerPage({
  weekends, bookings, cards, credits,
}: {
  weekends: HotelWeekend[]
  bookings: HotelBooking[]
  cards: Card[]
  credits: EnrichedCredit[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [bookingFor, setBookingFor] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addingWeekend, setAddingWeekend] = useState(false)
  const [page, setPage] = useState<string>('overview')
  const [showHow, setShowHow] = useState(false)

  const setBusyOn = (id: string, on: boolean) =>
    setBusy(prev => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s })

  // ── Overview math ──────────────────────────────────────────────
  const overview = useMemo(() => {
    const groups: { key: HotelProgram | 'group'; label: string; color: string; credits: EnrichedCredit[] }[] = [
      { key: 'fhr', label: 'Amex FHR/THC', color: PROGRAM_COLOR.fhr,
        credits: credits.filter(c => c.name === PROGRAM_CREDIT_NAME.fhr) },
      { key: 'edit', label: 'Chase "The Edit"', color: PROGRAM_COLOR.edit,
        credits: credits.filter(c => c.name === PROGRAM_CREDIT_NAME.edit) },
      { key: 'citi_travel', label: 'Citi Strata', color: PROGRAM_COLOR.citi_travel,
        credits: credits.filter(c => c.name === PROGRAM_CREDIT_NAME.citi_travel) },
    ]
    return groups.map(g => {
      const totalCards = g.credits.length
      const openCards = g.credits.filter(c => c.remaining_cents > 0).length
      const byOwner = new Map<string, number>()
      const byOwnerTotal = new Map<string, number>()
      for (const c of g.credits) {
        const card = cards.find(k => k.id === c.card_id)
        const owner = card?.owner ?? '?'
        byOwnerTotal.set(owner, (byOwnerTotal.get(owner) ?? 0) + 1)
        if (c.remaining_cents > 0) byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1)
      }
      const owners = [...byOwnerTotal.keys()].sort()
      const splitLabel = owners.map(o => `${byOwner.get(o) ?? 0} ${o[0].toUpperCase() + o.slice(1)}`).join(' · ')
      return { ...g, totalCards, openCards, splitLabel, pct: totalCards ? (openCards / totalCards) * 100 : 0 }
    })
  }, [credits, cards])

  // ── Eligible cards for a program (has that credit, with remaining > 0 this period, or already assigned) ──
  function eligibleCards(program: HotelProgram, currentCardId?: string | null) {
    const wantName = PROGRAM_CREDIT_NAME[program]
    return credits
      .filter(c => c.name === wantName && (c.remaining_cents >= PROGRAM_INCREMENT_CENTS[program] || c.card_id === currentCardId))
      .map(c => ({ credit: c, card: cards.find(k => k.id === c.card_id) }))
      .filter(x => x.card)
  }

  async function bookWith(bookingId: string, cardId: string) {
    setBusyOn(bookingId, true)
    try {
      const r = await fetch(`/api/hotel-bookings/${bookingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: true, card_id: cardId }),
      })
      const j = await r.json()
      if (!j.ok) { alert(j.error ?? 'Could not book this stay'); return }
      setBookingFor(null)
      router.refresh()
    } finally {
      setBusyOn(bookingId, false)
    }
  }

  async function unbook(bookingId: string) {
    if (!confirm('Unbook this stay? This frees the credit back up.')) return
    setBusyOn(bookingId, true)
    try {
      await fetch(`/api/hotel-bookings/${bookingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book: false }),
      })
      router.refresh()
    } finally {
      setBusyOn(bookingId, false)
    }
  }

  async function deleteBooking(bookingId: string) {
    if (!confirm('Delete this option? This cannot be undone.')) return
    setBusyOn(bookingId, true)
    try {
      await fetch(`/api/hotel-bookings/${bookingId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusyOn(bookingId, false)
    }
  }

  // ── Grouping bookings by weekend → city ─────────────────────────
  const byWeekend = useMemo(() => {
    const map = new Map<string, HotelBooking[]>()
    for (const b of bookings) {
      const k = b.weekend_id ?? '(unassigned)'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(b)
    }
    return map
  }, [bookings])

  const { upcoming, past } = useMemo(() => {
    const now = new Date()
    const up: HotelWeekend[] = []
    const old: HotelWeekend[] = []
    for (const w of weekends) (weekendEnded(w.label, now) ? old : up).push(w)
    return { upcoming: up, past: old }
  }, [weekends])

  const weekendHasBooked = (id: string) => (byWeekend.get(id) ?? []).some(b => b.booked)

  const lastUpdated = useMemo(() => {
    const stamps = [...weekends.map(w => w.updated_at), ...bookings.map(b => b.updated_at)].filter(Boolean)
    if (stamps.length === 0) return null
    return new Date(stamps.sort().at(-1) as string)
  }, [weekends, bookings])

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sand)',
    fontSize: 13, color: 'var(--ink)', background: '#fff', boxSizing: 'border-box',
  }
  const btn: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
    background: 'var(--ox)', color: '#fff', border: 'none', cursor: 'pointer',
  }
  const btnGhost: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 7, fontSize: 12,
    background: 'transparent', border: '1px solid var(--sand)', color: 'var(--bark)', cursor: 'pointer',
  }

  const activeWeekend = page === 'overview' ? null : weekends.find(w => w.id === page) ?? null

  return (
    <div>
      {/* ── Header, matching the original tracker's framing ───────── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0b4f42', margin: '0 0 6px' }}>
          Household Hotel Credits
        </p>
        <button onClick={() => setShowHow(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, fontSize: 13, fontWeight: 600, color: '#0f6d5c',
        }}>
          <span style={{ fontSize: 10, transform: showHow ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
          How the programs and cap work
        </button>

        {showHow && (
          <div style={{ marginTop: 10 }}>
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--bark)', margin: '0 0 10px' }}>
              {(['thc', 'fhr', 'edit', 'citi_travel'] as HotelProgram[]).map(p => (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', background: PROGRAM_COLOR[p] }} />
                  <b style={{ color: 'var(--ink)' }}>{PROGRAM_LABEL[p]}</b> — {PROGRAM_MIN_NIGHTS[p]} night{PROGRAM_MIN_NIGHTS[p] === 1 ? '' : 's'}, {PROGRAM_ISSUER[p]}
                </span>
              ))}
            </p>
            <p style={{ fontSize: 13, color: 'var(--bark)', maxWidth: 720, lineHeight: 1.6, margin: 0 }}>
              Amex Platinum ($300/card via amextravel.com): <b style={{ color: 'var(--ink)' }}>The Hotel Collection (THC)</b> needs
              a 2-night minimum, <b style={{ color: 'var(--ink)' }}>Fine Hotels + Resorts (FHR)</b> has no minimum — a single night
              gets the full benefit package (room upgrade, $100+ property credit, noon check-in, breakfast for two, 4pm checkout).
              Chase Sapphire Reserve &quot;<b style={{ color: 'var(--ink)' }}>The Edit</b>&quot; ($250/booking via Chase Travel) needs a
              2-night minimum, up to 2 bookings/card/year. <b style={{ color: 'var(--ink)' }}>Citi Strata Elite</b> hotel credit
              ($300/card/year via cititravel.com) needs 2+ consecutive nights. Amex, Chase, and Citi credits are program-specific
              and can&apos;t be combined or substituted for each other — though two different bookings the same weekend can each
              draw from a different program.
            </p>
          </div>
        )}

        {lastUpdated && (
          <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 10 }}>
            Updated {lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · live from the dashboard — book a stay and this updates instantly.
          </p>
        )}
      </div>

      {/* Overview tiles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {overview.map(g => (
          <div key={g.label} style={{
            flex: 1, minWidth: 200, padding: '16px 18px', borderRadius: 12,
            border: '1px solid var(--sand)', background: '#fff',
            boxShadow: `inset 3px 0 0 ${g.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span className="fr" style={{ fontSize: 22, fontWeight: 600 }}>{g.openCards}</span>
              <span style={{ fontSize: 13, color: 'var(--bark)' }}>/ {g.totalCards}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 3 }}>{g.label} open</p>
            <div style={{ marginTop: 8, height: 5, borderRadius: 100, background: 'var(--sand)', overflow: 'hidden' }}>
              <div style={{ width: `${g.pct}%`, height: '100%', background: g.color, borderRadius: 100 }} />
            </div>
            {g.splitLabel && <p style={{ fontSize: 11, color: 'var(--bark)', marginTop: 6 }}>{g.splitLabel} open</p>}
          </div>
        ))}
      </div>

      {/* ── Pill nav: Overview + one page per weekend ─────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0 16px', borderBottom: '1px solid var(--sand)', marginBottom: 20 }}>
        <PageTab active={page === 'overview'} onClick={() => setPage('overview')} label="Overview" />
        {weekends.filter(w => !past.some(p => p.id === w.id) || w.id === page).map(w => (
          <PageTab key={w.id} active={page === w.id} onClick={() => setPage(w.id)} label={w.label} booked={weekendHasBooked(w.id)} />
        ))}
      </div>

      {page === 'overview' ? (
        <OverviewList
          weekends={upcoming}
          pastWeekends={past}
          byWeekend={byWeekend}
          onOpen={setPage}
          addingWeekend={addingWeekend}
          onToggleAdding={() => setAddingWeekend(v => !v)}
          onWeekendAdded={() => { setAddingWeekend(false); router.refresh() }}
          onCancelAdding={() => setAddingWeekend(false)}
          inp={inp} btn={btn} btnGhost={btnGhost}
        />
      ) : activeWeekend ? (
        <WeekendPage
          w={activeWeekend}
          bookings={byWeekend.get(activeWeekend.id) ?? []}
          cards={cards}
          busy={busy}
          bookingFor={bookingFor}
          setBookingFor={setBookingFor}
          onBookWith={bookWith}
          onUnbook={unbook}
          onDelete={deleteBooking}
          eligibleCards={eligibleCards}
          addingTo={addingTo}
          setAddingTo={setAddingTo}
          onStayAdded={() => { setAddingTo(null); router.refresh() }}
          inp={inp} btn={btn} btnGhost={btnGhost}
        />
      ) : null}
    </div>
  )
}

function PageTab({ active, onClick, label, booked }: { active: boolean; onClick: () => void; label: string; booked?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 15px', borderRadius: 100,
      border: `1px solid ${active ? 'var(--ink)' : 'var(--sand)'}`,
      background: active ? 'var(--ink)' : '#fff',
      color: active ? '#fff' : 'var(--bark)',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {label}{booked && <span style={{ marginLeft: 6, fontWeight: 700, color: active ? '#4fd2ae' : '#0f6d5c' }}>✓</span>}
    </button>
  )
}

// ── Overview page: one line per weekend, click to jump ────────────
function OverviewList({
  weekends, pastWeekends, byWeekend, onOpen, addingWeekend, onToggleAdding, onWeekendAdded, onCancelAdding, inp, btn, btnGhost,
}: {
  weekends: HotelWeekend[]
  pastWeekends: HotelWeekend[]
  byWeekend: Map<string, HotelBooking[]>
  onOpen: (id: string) => void
  addingWeekend: boolean
  onToggleAdding: () => void
  onWeekendAdded: () => void
  onCancelAdding: () => void
  inp: React.CSSProperties; btn: React.CSSProperties; btnGhost: React.CSSProperties
}) {
  const renderRow = (w: HotelWeekend, isPast: boolean) => {
        const list = byWeekend.get(w.id) ?? []
        const booked = list.filter(b => b.booked)
        const cheapest = [...list].filter(b => b.total_cents != null).sort((a, b) => (oopFor(a) ?? 1e9) - (oopFor(b) ?? 1e9))[0]
        const oop = cheapest ? oopFor(cheapest) : null
        return (
          <button
            key={w.id}
            onClick={() => onOpen(w.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: booked.length > 0 ? 'linear-gradient(180deg,#f4ead8,#fff 65%)' : '#fff',
              border: `1px solid ${booked.length > 0 ? '#a9824e' : 'var(--sand)'}`,
              borderRadius: 12, padding: '14px 18px', marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                {w.label} {booked.length > 0 && <span style={{ color: '#166534', fontWeight: 700 }}>{isPast ? '✓ Used' : '✓'}</span>}{isPast && booked.length === 0 && <span style={{ color: 'var(--bark)', fontWeight: 500, fontSize: 12 }}>· Passed</span>}
              </span>
              <span style={{ fontSize: 12, color: 'var(--bark)' }}>{list.length} option{list.length === 1 ? '' : 's'}</span>
            </div>
            {!isPast && w.best && <p style={{ fontSize: 13, color: 'var(--ink)', marginTop: 6 }}>{w.best}</p>}
            {!isPast && !w.best && oop != null && <p style={{ fontSize: 13, color: 'var(--bark)', marginTop: 6 }}>Best so far: {fmt(oop)} OOP</p>}
          </button>
        )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 className="fr" style={{ fontSize: 18 }}>Weekends</h2>
        <button onClick={onToggleAdding} style={btn}>+ New Weekend</button>
      </div>

      {addingWeekend && <NewWeekendForm onDone={onWeekendAdded} onCancel={onCancelAdding} inp={inp} btn={btn} btnGhost={btnGhost} />}

      {weekends.map(w => renderRow(w, false))}

      {weekends.length === 0 && pastWeekends.length === 0 && <p style={{ color: 'var(--bark)', fontSize: 14 }}>No weekends yet — add one to start tracking hotel options.</p>}

      {pastWeekends.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none', fontSize: 13, fontWeight: 600, color: 'var(--bark)', marginBottom: 10 }}>
            Past weekends ({pastWeekends.length})
          </summary>
          <div style={{ marginTop: 10 }}>{pastWeekends.map(w => renderRow(w, true))}</div>
        </details>
      )}
    </div>
  )
}

// ── One weekend's page: cities → collapsible hotel cards ───────────
function WeekendPage({
  w, bookings, cards, busy, bookingFor, setBookingFor, onBookWith, onUnbook, onDelete, eligibleCards,
  addingTo, setAddingTo, onStayAdded, inp, btn, btnGhost,
}: {
  w: HotelWeekend
  bookings: HotelBooking[]
  cards: Card[]
  busy: Set<string>
  bookingFor: string | null
  setBookingFor: (id: string | null) => void
  onBookWith: (id: string, cardId: string) => void
  onUnbook: (id: string) => void
  onDelete: (id: string) => void
  eligibleCards: (program: HotelProgram, currentCardId?: string | null) => { credit: EnrichedCredit; card?: Card }[]
  addingTo: string | null
  setAddingTo: (id: string | null) => void
  onStayAdded: () => void
  inp: React.CSSProperties; btn: React.CSSProperties; btnGhost: React.CSSProperties
}) {
  const byCity = new Map<string, HotelBooking[]>()
  for (const b of bookings) {
    if (!byCity.has(b.city)) byCity.set(b.city, [])
    byCity.get(b.city)!.push(b)
  }

  return (
    <div>
      <h2 className="fr" style={{ fontSize: 22, fontWeight: 600 }}>{w.label}</h2>
      {w.sub && <p style={{ fontSize: 13, color: 'var(--bark)', marginTop: 3 }}>{w.sub}</p>}
      {w.best && (
        <p style={{ fontSize: 14, color: '#0b4f42', marginTop: 12, marginBottom: 24, padding: '12px 16px', background: '#e8f3ee', borderRadius: 10 }}>
          {w.best}
        </p>
      )}

      {bookings.length === 0 && (
        <p style={{ padding: 24, border: '1px dashed var(--sand)', borderRadius: 12, color: 'var(--bark)', fontSize: 14, textAlign: 'center' }}>
          Nothing tracked here yet.
        </p>
      )}

      {[...byCity.entries()].map(([city, hotels]) => {
        const sorted = [...hotels].sort((a, b) => (oopFor(a) ?? 1e9) - (oopFor(b) ?? 1e9))
        return (
          <div key={city} style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--sand)' }}>{city}</p>
            {sorted.map(h => (
              <HotelCard
                key={h.id}
                h={h}
                bookedCard={h.booked ? cards.find(c => c.id === h.card_id) : undefined}
                isBusy={busy.has(h.id)}
                isPickingCard={bookingFor === h.id}
                onStartBook={() => setBookingFor(h.id)}
                onCancelBook={() => setBookingFor(null)}
                onConfirmBook={cardId => onBookWith(h.id, cardId)}
                onUnbook={() => onUnbook(h.id)}
                onDelete={() => onDelete(h.id)}
                eligibleCards={eligibleCards(h.program, h.card_id)}
                inp={inp} btnGhost={btnGhost}
              />
            ))}
          </div>
        )
      })}

      <div style={{ marginTop: 10 }}>
        {addingTo === w.id ? (
          <AddStayForm weekendId={w.id} onDone={onStayAdded} onCancel={() => setAddingTo(null)} inp={inp} btn={btn} btnGhost={btnGhost} />
        ) : (
          <button onClick={() => setAddingTo(w.id)} style={btnGhost}>+ Add option to {w.label}</button>
        )}
      </div>
    </div>
  )
}

// ── Collapsible hotel card — closed by default, name + OOP only until clicked ──
function HotelCard({
  h, bookedCard, isBusy, isPickingCard, onStartBook, onCancelBook, onConfirmBook, onUnbook, onDelete, eligibleCards, inp, btnGhost,
}: {
  h: HotelBooking
  bookedCard?: Card
  isBusy: boolean
  isPickingCard: boolean
  onStartBook: () => void
  onCancelBook: () => void
  onConfirmBook: (cardId: string) => void
  onUnbook: () => void
  onDelete: () => void
  eligibleCards: { credit: EnrichedCredit; card?: Card }[]
  inp: React.CSSProperties
  btnGhost: React.CSSProperties
}) {
  const oop = oopFor(h)
  const color = PROGRAM_COLOR[h.program]

  return (
    <details style={{
      border: '1px solid var(--sand)', borderRadius: 12, marginBottom: 8, overflow: 'hidden',
      boxShadow: `inset 3px 0 0 ${color}`,
      ...(h.booked ? { borderColor: '#a9824e', background: 'linear-gradient(180deg,#f4ead8,#fff 65%)' } : { background: '#fff' }),
    }}>
      <summary style={{
        listStyle: 'none', cursor: 'pointer', userSelect: 'none',
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: 'var(--bark)', background: '#f5f5f5', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}>
            {PROGRAM_LABEL[h.program]}
          </span>
          <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.hotel_name}</span>
          {h.booked && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>✓ Booked</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--bark)', whiteSpace: 'nowrap' }}>{h.stay_dates || `${h.nights} night${h.nights === 1 ? '' : 's'}`}</span>
          {oop != null ? (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#e8f3ee', color: '#0f6d5c', whiteSpace: 'nowrap' }}>
              {fmt(oop)} OOP
            </span>
          ) : (
            <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: '#f5f5f5', color: 'var(--bark)', whiteSpace: 'nowrap' }}>
              Confirm total
            </span>
          )}
        </div>
      </summary>

      <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--sand)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--bark)' }}>
              {h.stars ? `★ ${h.stars} · ` : ''}{h.distance}{h.distance ? ' · ' : ''}{h.nights} night{h.nights === 1 ? '' : 's'}{h.stay_dates ? ` · ${h.stay_dates}` : ''}
              {h.breakfast ? ' · Breakfast for two' : ''}
            </p>
            <p style={{ fontSize: 11, color: 'var(--bark)', marginTop: 4 }}>
              {PROGRAM_SOURCE[h.program]}{h.parking ? ` · 🅿️ ${h.parking}` : ''}
            </p>
            {h.spend?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--bark)', marginBottom: 4 }}>
                  Spend the {h.property_credit_cents ? fmtWhole(h.property_credit_cents) : ''} property credit on
                </div>
                <ul style={{ fontSize: 12, color: 'var(--ink)', margin: 0, paddingLeft: 18 }}>
                  {h.spend.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
                </ul>
              </div>
            )}
            {h.notes && <p style={{ fontSize: 12, color: 'var(--ink)', marginTop: 8 }}>{h.notes}</p>}
            {h.offer && <p style={{ fontSize: 11, color: '#a9824e', marginTop: 6 }}>{h.offer}</p>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 12, color: 'var(--bark)' }}>Total <b style={{ color: 'var(--ink)' }}>{fmt(h.total_cents)}</b></p>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {h.booked ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#166534', alignSelf: 'center' }}>
                    {bookedCard ? `${bookedCard.display_name}${bookedCard.last4 ? ' ···' + bookedCard.last4 : ''}` : ''}
                  </span>
                  <button disabled={isBusy} onClick={onUnbook} style={btnGhost}>Unbook</button>
                </>
              ) : isPickingCard ? (
                <CardPicker options={eligibleCards} onPick={onConfirmBook} onCancel={onCancelBook} busy={isBusy} inp={inp} btnGhost={btnGhost} />
              ) : (
                <button disabled={isBusy} onClick={onStartBook} style={{ ...btnGhost, background: 'var(--ox)', color: '#fff', border: 'none' }}>Book this</button>
              )}
              <button disabled={isBusy} onClick={onDelete} style={{ ...btnGhost, color: '#dc2626', borderColor: '#fca5a5' }}>✕</button>
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}

function CardPicker({ options, onPick, onCancel, busy, inp, btnGhost }: {
  options: { credit: EnrichedCredit; card?: Card }[]
  onPick: (cardId: string) => void
  onCancel: () => void
  busy: boolean
  inp: React.CSSProperties
  btnGhost: React.CSSProperties
}) {
  const [sel, setSel] = useState('')
  if (options.length === 0) {
    return <p style={{ fontSize: 12, color: '#dc2626' }}>No card has this credit open right now.</p>
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inp, width: 220 }}>
        <option value="">Choose a card…</option>
        {options.map(o => (
          <option key={o.credit.card_id} value={o.credit.card_id}>
            {o.card?.display_name} {o.card?.last4 ? '···' + o.card.last4 : ''} ({o.card?.owner}) — {fmt(o.credit.remaining_cents)} left
          </option>
        ))}
      </select>
      <button disabled={!sel || busy} onClick={() => sel && onPick(sel)} style={{ ...btnGhost, background: 'var(--ox)', color: '#fff', opacity: (!sel || busy) ? .5 : 1 }}>
        Confirm
      </button>
      <button onClick={onCancel} style={btnGhost}>Cancel</button>
    </div>
  )
}

function NewWeekendForm({ onDone, onCancel, inp, btn, btnGhost }: {
  onDone: () => void; onCancel: () => void
  inp: React.CSSProperties; btn: React.CSSProperties; btnGhost: React.CSSProperties
}) {
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const [sub, setSub] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('/api/hotel-weekends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, sub: sub || null }),
      })
      const j = await r.json()
      if (!j.ok) { alert(j.error ?? 'Could not create weekend'); return }
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <input required placeholder="Short id (e.g. jan9)" value={id} onChange={e => setId(e.target.value)} style={inp} />
        <input required placeholder="Label (e.g. Jan 9–11)" value={label} onChange={e => setLabel(e.target.value)} style={inp} />
        <input placeholder="Sub (optional)" value={sub} onChange={e => setSub(e.target.value)} style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={saving} style={btn}>{saving ? 'Saving…' : 'Create'}</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

function AddStayForm({ weekendId, onDone, onCancel, inp, btn, btnGhost }: {
  weekendId: string; onDone: () => void; onCancel: () => void
  inp: React.CSSProperties; btn: React.CSSProperties; btnGhost: React.CSSProperties
}) {
  const [form, setForm] = useState({
    city: '', hotel_name: '', program: 'fhr' as HotelProgram, stay_dates: '',
    nights: PROGRAM_MIN_NIGHTS.fhr, total: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('/api/hotel-bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekend_id: weekendId, city: form.city, hotel_name: form.hotel_name, program: form.program,
          stay_dates: form.stay_dates || null, nights: Number(form.nights) || 1,
          total_cents: form.total ? Math.round(parseFloat(form.total) * 100) : null,
          notes: form.notes || null,
        }),
      })
      const j = await r.json()
      if (!j.ok) { alert(j.error ?? 'Could not add stay'); return }
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input required placeholder="City" value={form.city} onChange={e => set('city', e.target.value)} style={inp} />
        <input required placeholder="Hotel name" value={form.hotel_name} onChange={e => set('hotel_name', e.target.value)} style={inp} />
        <select value={form.program} onChange={e => set('program', e.target.value)} style={inp}>
          <option value="fhr">FHR (Amex, 1nt+)</option>
          <option value="thc">THC (Amex, 2nt+)</option>
          <option value="edit">The Edit (Chase, 2nt+)</option>
          <option value="citi_travel">Citi Strata (2nt+)</option>
          <option value="none">Direct booking (no card credit)</option>
        </select>
        <input placeholder="Stay dates (e.g. Dec 18–19)" value={form.stay_dates} onChange={e => set('stay_dates', e.target.value)} style={inp} />
        <input type="number" min={1} placeholder="Nights" value={form.nights} onChange={e => set('nights', e.target.value)} style={inp} />
        <input type="number" step="0.01" placeholder="All-in total ($, optional)" value={form.total} onChange={e => set('total', e.target.value)} style={inp} />
      </div>
      <textarea placeholder="Notes — parking, spend, anything else" value={form.notes} rows={2}
        onChange={e => set('notes', e.target.value)} style={{ ...inp, marginTop: 10, resize: 'vertical' as const }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={saving} style={btn}>{saving ? 'Saving…' : 'Add option'}</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}
