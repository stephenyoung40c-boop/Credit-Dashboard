'use client'

/**
 * DashboardClient — the entire dashboard UI as a single client component.
 *
 * Design tokens match credit-dashboard.html exactly:
 *   canvas #F5F1EA · ink #1C1917 · ox #6B1A1A · sand #D4C5A9 · bark #8B7355
 *   Fraunces (fr class) + Inter
 *
 * Tab structure: Credits | Certs | Trips | Notes
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Card, Certificate, CertRedemption, CertBalanceTransaction, HotelWeekend, HotelBooking, HotelLibrary, PointsAccount, PointTransaction } from '@/types/db'
import type { EnrichedCredit } from '@/types/enriched'
import TodayPage from '@/components/TodayPage'
import PointsPage from '@/components/PointsPage'
import BalanceCertRow from '@/components/BalanceCertRow'
import HotelTrackerPage from '@/components/HotelTrackerPage'
import PartialUseEditor from '@/components/PartialUseEditor'
import BenefitsGuidePage from '@/components/BenefitsGuidePage'
import PlannerPage, { HotelBurnPanel } from '@/components/PlannerPage'

interface Props {
  cards:              Card[]
  credits:            EnrichedCredit[]
  certificates:       Certificate[]
  certRedemptions:    CertRedemption[]
  certBalanceTransactions: CertBalanceTransaction[]
  hotelWeekends:      HotelWeekend[]
  hotelBookings:      HotelBooking[]
  hotelLibrary:       HotelLibrary[]
  pointsAccounts:     PointsAccount[]
  pointTransactions:  PointTransaction[]
  today:              string
}

// ── Helpers ────────────────────────────────────────────────────

const fmt = (cents: number) =>
  '$' + Math.round(cents / 100).toLocaleString()

// Shows cents when amount is non-integer dollars (e.g. $12.95, not $13)
const fmtAmount = (cents: number) => {
  const d = cents / 100
  return d % 1 === 0 ? '$' + d.toLocaleString() : '$' + d.toFixed(2)
}

const periodLabel = (pt: string) => ({
  monthly: '/mo', quarterly: '/qtr', semiannual: '/half',
  annual: '/yr', cardmember_year: '/yr', ended: ''
}[pt] ?? '')

// ── Nav item ───────────────────────────────────────────────────

function NavItem({ label, icon, active, onClick }: {
  label: string; icon: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 10,
        background: active ? 'var(--ox)' : 'transparent',
        color: active ? '#fff' : 'var(--bark)',
        border: 'none', cursor: 'pointer', fontSize: 14,
        fontWeight: 500, width: '100%', textAlign: 'left',
        transition: 'background .15s, color .15s',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  )
}

// ── Credit row ─────────────────────────────────────────────────

function CreditRow({ credit, onToggle, onSetUsed }: {
  credit: EnrichedCredit
  onToggle: (id: string, used: boolean) => void
  onSetUsed: (id: string, usedCents: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const used    = credit.is_used
  const partial = !used && credit.used_cents > 0
  const pl      = periodLabel(credit.period_type)
  const ap      = credit.autopilot

  const pill = {
    fontSize: 11, color: 'var(--bark)', padding: '3px 8px', borderRadius: 999,
    border: '1px solid var(--sand)', whiteSpace: 'nowrap' as const,
  }

  return (
    <div style={{
      borderTop: '1px solid var(--sand)',
      background: used ? 'rgba(22,101,52,.04)' : partial ? 'rgba(180,83,9,.04)' : '#fff',
      transition: 'background .1s',
    }}>
      <div
        onClick={ap ? undefined : () => onToggle(credit.id, !used)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '14px 20px', cursor: ap ? 'default' : 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 14, fontWeight: 500,
            color: used ? 'var(--bark)' : 'var(--ink)',
            textDecoration: used ? 'line-through' : 'none',
          }}>
            {credit.name}
          </p>
          <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>
            {fmtAmount(credit.amount_cents)}{pl}{ap ? ' · autopilot' : ''}
            {partial && (
              <span style={{ color: '#b45309', fontWeight: 600 }}>
                {' '}· {fmtAmount(credit.used_cents)} used · {fmtAmount(credit.remaining_cents)} left
              </span>
            )}
          </p>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
          {ap ? (
            used ? (
              <span style={{
                fontSize: 11, fontWeight: 700, background: '#e0f2fe', color: '#0369a1',
                padding: '3px 8px', borderRadius: 999,
              }}>⚡ Auto · ✓ Used</span>
            ) : (
              <span style={{
                fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e',
                padding: '3px 8px', borderRadius: 999,
              }}>⚡ Paused</span>
            )
          ) : used ? (
            <span style={{
              fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#166534',
              padding: '3px 8px', borderRadius: 999,
            }}>✓ Used</span>
          ) : (
            <>
              <span
                onClick={e => { e.stopPropagation(); setEditing(v => !v) }}
                style={partial
                  ? { ...pill, fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
                  : pill}
              >{partial ? '◐ Some used · edit' : 'Some used'}</span>
              <span style={pill}>Mark used</span>
            </>
          )}
        </div>
      </div>
      {editing && !ap && !used && (
        <PartialUseEditor
          amountCents={credit.amount_cents}
          usedCents={credit.used_cents}
          onSave={cents => { setEditing(false); onSetUsed(credit.id, cents) }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}

// ── Card accordion ─────────────────────────────────────────────

function CardAccordion({ card, credits, onToggle, onSetUsed }: {
  card: Card
  credits: EnrichedCredit[]
  onToggle: (id: string, used: boolean) => void
  onSetUsed: (id: string, usedCents: number) => void
}) {
  const [open, setOpen] = useState(false)

  // Count only primary-instance credits for totals (e.g. exclude Stephen's Walmart+ non-primary row)
  const countedCredits = credits.filter(c => !c.single_instance || c.is_primary_instance)
  const totalAnnual = countedCredits.reduce((s, c) => s + c.annual_value, 0)
  const usedYtd     = countedCredits.reduce((s, c) => s + c.ytd_used_cents, 0)
  const pct = totalAnnual > 0 ? Math.round(usedYtd / totalAnnual * 100) : 0

  const netBadge: Record<string, string> = {
    amex: '#2C2C2C', chase: '#1A2B4A', citi: '#003087',
    ihg: '#006A4E', hilton: '#005B8E', marriott: '#8B0000', southwest: '#304CB2',
  }
  const badgeBg = netBadge[card.network] ?? '#555'

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--sand)', overflow: 'hidden', marginBottom: 12 }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', cursor: 'pointer',
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '4px 10px',
          borderRadius: 999, background: badgeBg, color: '#E8DDD0', flexShrink: 0,
        }}>
          {card.network.toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {card.display_name}
          </p>
          <p style={{ fontSize: 12, color: 'var(--bark)' }}>
            {card.owner === 'katie' ? 'Katie' : 'Stephen'}{card.fee_waived ? ' · fee waived' : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500 }}>{fmt(usedYtd)} used</p>
          <p style={{ fontSize: 12, color: 'var(--bark)' }}>{fmt(totalAnnual)} total</p>
        </div>
        <span style={{ color: 'var(--bark)', transform: open ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>▾</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 5, background: 'var(--sand)', margin: '0 20px 4px', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: pct === 100 ? '#22c55e' : 'var(--terra)',
          borderRadius: 999, transition: 'width .3s',
        }} />
      </div>

      {/* Credits */}
      {open && (
        <div>
          {credits.length === 0 ? (
            <p style={{ padding: '16px 20px', fontSize: 13, color: 'var(--bark)' }}>No credits configured.</p>
          ) : (
            credits.map(c => <CreditRow key={c.id} credit={c} onToggle={onToggle} onSetUsed={onSetUsed} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Q2 reset banner ────────────────────────────────────────────

function Q2ResetBanner({ today }: { today: string }) {
  const d    = new Date(today)
  const month = d.getMonth() + 1 // 1-based
  const day   = d.getDate()

  // Show banner Apr 1 – Jun 30 (Q2 is resetting Jul 1)
  if (month < 4 || month > 6) return null

  const daysLeft = Math.ceil(
    (new Date(d.getFullYear(), 6, 1).getTime() - d.getTime()) / 86400000
  )

  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #f59e0b',
      borderRadius: 10, padding: '12px 16px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>⏳</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
          Q2 credits resetting Jul 1 — {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
        </p>
        <p style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
          Use quarterly credits (Resy, OpenTable, Lululemon, Hilton Incidentals) before they reset.
        </p>
      </div>
    </div>
  )
}

// ── Credits page ───────────────────────────────────────────────

function CreditsPage({ cards, credits, onToggle, onSetUsed, today }: {
  cards: Card[]
  credits: EnrichedCredit[]
  onToggle: (id: string, used: boolean) => void
  onSetUsed: (id: string, usedCents: number) => void
  today: string
}) {
  // All credits are displayed — non-primary single-instance rows show in the card but are excluded from totals
  const creditsByCard = new Map<string, EnrichedCredit[]>()
  for (const c of credits) {
    const list = creditsByCard.get(c.card_id) ?? []
    list.push(c)
    creditsByCard.set(c.card_id, list)
  }

  // Top-level totals count only primary-instance credits (e.g. only one Walmart+ across both Plats)
  const countedCredits = credits.filter(c => !c.single_instance || c.is_primary_instance)
  const totalAnnual = countedCredits.reduce((s, c) => s + c.annual_value, 0)
  const usedYtd     = countedCredits.reduce((s, c) => s + c.ytd_used_cents, 0)

  return (
    <div>
      <Q2ResetBanner today={today} />

      {/* YTD bar */}
      <div style={{
        background: 'var(--ox)', borderRadius: 14, padding: 24,
        color: '#fff', marginBottom: 32,
      }}>
        <p style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', opacity: .7 }}>
          Used this period
        </p>
        <p className="fr" style={{ fontSize: 48, lineHeight: 1, marginTop: 4 }}>
          {fmt(usedYtd)}
        </p>
        <p style={{ fontSize: 14, opacity: .6, marginTop: 4 }}>
          of {fmt(totalAnnual)} annual value · {Math.round(usedYtd / totalAnnual * 100) || 0}% captured
        </p>
      </div>

      {/* Katie */}
      <h2 className="fr" style={{ fontSize: 20, marginBottom: 16 }}>Katie</h2>
      {cards.filter(c => c.owner === 'katie').map(card => (
        <CardAccordion
          key={card.id}
          card={card}
          credits={creditsByCard.get(card.id) ?? []}
          onToggle={onToggle}
          onSetUsed={onSetUsed}
        />
      ))}

      {/* Stephen */}
      <h2 className="fr" style={{ fontSize: 20, margin: '24px 0 16px' }}>Stephen</h2>
      {cards.filter(c => c.owner === 'stephen').map(card => (
        <CardAccordion
          key={card.id}
          card={card}
          credits={creditsByCard.get(card.id) ?? []}
          onToggle={onToggle}
          onSetUsed={onSetUsed}
        />
      ))}
    </div>
  )
}

// ── Certs page ────────────────────────────────────────────────

function CertsPage({ certificates, cards, certRedemptions: initRedemptions, certBalanceTransactions, today: todayStr, onCertUpdated, onTransactionAdded, onTransactionRemoved }: {
  certificates:    Certificate[]
  cards:           Card[]
  certRedemptions: CertRedemption[]
  certBalanceTransactions: CertBalanceTransaction[]
  today:           string
  onCertUpdated: (cert: Certificate) => void
  onTransactionAdded: (tx: CertBalanceTransaction) => void
  onTransactionRemoved: (txId: string) => void
}) {
  const [redemptions, setRedemptions] = useState(initRedemptions)
  const cardMap = new Map(cards.map(c => [c.id, c]))
  const today   = new Date(todayStr)

  const txsByCert = new Map<string, CertBalanceTransaction[]>()
  for (const tx of certBalanceTransactions) {
    const list = txsByCert.get(tx.certificate_id) ?? []
    list.push(tx)
    txsByCert.set(tx.certificate_id, list)
  }
  for (const list of txsByCert.values()) {
    list.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }

  const dateFmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  async function handleRedeem(certId: string, year: number, currentlyRedeemed: boolean) {
    // Optimistic update — no page refresh needed
    setRedemptions(prev =>
      currentlyRedeemed
        ? prev.filter(r => !(r.certificate_id === certId && r.year === year))
        : [...prev, { id: 'opt', certificate_id: certId, year, redeemed_at: new Date().toISOString() }]
    )
    try {
      await fetch(`/api/certs/${certId}/${currentlyRedeemed ? 'unredeem' : 'redeem'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
    } catch {
      setRedemptions(initRedemptions) // revert
    }
  }

  const recurring = certificates.filter(c => c.cert_type === 'recurring')
  const onetime   = certificates.filter(c => c.cert_type !== 'recurring'
    && c.status !== 'redeemed' && c.status !== 'expired')

  return (
    <div>
      <h2 className="fr" style={{ fontSize: 20, marginBottom: 16 }}>Certificates</h2>

      {/* ── Recurring annual certs ── */}
      {recurring.map(cert => {
        const card = cardMap.get(cert.card_id)
        const redeemedYears = new Set(
          redemptions.filter(r => r.certificate_id === cert.id).map(r => r.year)
        )

        // Guard: skip certs without anniversary dates
        if (!cert.anniversary_month || !cert.anniversary_day) return null

        // At most 1 instance: current active cert OR upcoming if redeemed and next ≤30 days out
        const annMonth0       = cert.anniversary_month - 1   // JS months are 0-indexed
        const annDay          = cert.anniversary_day
        const thisYearAnn     = new Date(today.getFullYear(), annMonth0, annDay)
        const issueYear       = thisYearAnn <= today ? today.getFullYear() : today.getFullYear() - 1
        const currentIssue    = new Date(issueYear,     annMonth0, annDay)
        const currentExpiry   = new Date(issueYear + 1, annMonth0, annDay)
        const currentRedeemed = redeemedYears.has(issueYear)

        type Inst = { year: number; issue: Date; expiry: Date; status: 'active' | 'upcoming' }
        const instances: Inst[] = []

        if (!currentRedeemed) {
          instances.push({ year: issueYear, issue: currentIssue, expiry: currentExpiry, status: 'active' })
        } else {
          const nextIssue = new Date(issueYear + 1, annMonth0, annDay)
          const daysUntil = Math.ceil((nextIssue.getTime() - today.getTime()) / 86400000)
          if (daysUntil > 0 && daysUntil <= 30) {
            instances.push({
              year: issueYear + 1, issue: nextIssue,
              expiry: new Date(issueYear + 2, annMonth0, annDay),
              status: 'upcoming',
            })
          }
        }

        return (
          <div key={cert.id} style={{
            background: '#fff', border: '1px solid var(--sand)', borderRadius: 12, marginBottom: 16,
          }}>
            {/* Card header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{cert.name}</p>
                <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>{card?.display_name ?? '—'}</p>
              </div>
              {cert.value_low_cents && (
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--bark)' }}>
                  {fmt(cert.value_low_cents)}
                  {cert.value_high_cents && cert.value_high_cents !== cert.value_low_cents
                    ? `–${fmt(cert.value_high_cents)}` : ''} value
                </p>
              )}
            </div>

            {/* Single instance row */}
            {instances.length === 0 ? (
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--sand)' }}>
                <p style={{ fontSize: 13, color: 'var(--bark)', opacity: .5 }}>
                  Redeemed — next cert issues {dateFmt(new Date(issueYear + 1, annMonth0, annDay))}
                </p>
              </div>
            ) : instances.map(inst => {
              const daysUntil = Math.ceil((inst.issue.getTime() - today.getTime()) / 86400000)
              return (
                <div key={inst.year}
                  onClick={() => { if (inst.status === 'active') handleRedeem(cert.id, inst.year, false) }}
                  style={{
                    padding: '12px 20px', borderBottom: '1px solid var(--sand)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: inst.status === 'active' ? 'pointer' : 'default',
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--bark)' }}>
                    {inst.status === 'upcoming'
                      ? `Issues ${dateFmt(inst.issue)} · ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`
                      : `Issued ${dateFmt(inst.issue)}`}
                  </p>
                  {inst.status === 'active' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <p style={{ fontSize: 11, color: '#b45309', fontWeight: 500 }}>
                        Expires {dateFmt(inst.expiry)}
                      </p>
                      <span style={{ fontSize: 11, color: 'var(--bark)', padding: '3px 8px', borderRadius: 999, border: '1px solid var(--sand)', whiteSpace: 'nowrap' }}>
                        Mark used
                      </span>
                    </div>
                  )}
                  {inst.status === 'upcoming' && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', padding: '3px 8px', borderRadius: 999, background: '#eff6ff' }}>
                      Upcoming
                    </span>
                  )}
                </div>
              )
            })}

            {cert.notes && (
              <p style={{ padding: '10px 20px', fontSize: 12, color: 'var(--bark)' }}>{cert.notes}</p>
            )}
          </div>
        )
      })}

      {/* ── One-time certs ── */}
      {onetime.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 12px' }}>Other Certificates</h3>
          {onetime.map(cert => {
            const card = cardMap.get(cert.card_id)
            const isCommitted = cert.status === 'committed'

            if (cert.is_balance_tracked) {
              return (
                <BalanceCertRow
                  key={cert.id}
                  cert={cert}
                  card={card}
                  txs={txsByCert.get(cert.id) ?? []}
                  onCertUpdated={onCertUpdated}
                  onTransactionAdded={onTransactionAdded}
                  onTransactionRemoved={onTransactionRemoved}
                />
              )
            }

            return (
              <div key={cert.id} style={{
                background: '#fff', border: '1px solid var(--sand)', borderRadius: 12,
                padding: '16px 20px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{cert.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>{card?.display_name ?? '—'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                      background: isCommitted ? '#eff6ff' : '#fef9ee',
                      color: isCommitted ? '#1e40af' : '#b45309',
                    }}>
                      {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                    </span>
                    {cert.value_low_cents && (
                      <p style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                        {fmt(cert.value_low_cents)}
                        {cert.value_high_cents && cert.value_high_cents !== cert.value_low_cents
                          ? `–${fmt(cert.value_high_cents)}` : ''} value
                      </p>
                    )}
                  </div>
                </div>
                {cert.expires_at && (
                  <p style={{ fontSize: 11, color: 'var(--bark)', marginTop: 8 }}>
                    Expires {new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
                {cert.notes && <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 4 }}>{cert.notes}</p>}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── (Trips / Hotel Library / Notes replaced by HotelTrackerPage.tsx) ──
// ── Main dashboard ─────────────────────────────────────────────

export default function DashboardClient({ cards, credits: initialCredits, certificates: initialCertificates, certRedemptions, certBalanceTransactions: initialCertBalanceTx, hotelWeekends, hotelBookings, hotelLibrary, pointsAccounts: initialPointsAccounts, pointTransactions: initialPointTx, today }: Props) {
  const [tab, setTab] = useState<'today' | 'credits' | 'points' | 'certs' | 'hotels' | 'planner' | 'guide'>('today')
  const [credits, setCredits] = useState(initialCredits)
  const [pointsAccounts, setPointsAccounts] = useState(initialPointsAccounts)
  const [pointTransactions, setPointTransactions] = useState(initialPointTx)
  const [certificates, setCertificates] = useState(initialCertificates)
  const [certBalanceTransactions, setCertBalanceTransactions] = useState(initialCertBalanceTx)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const router = useRouter()

  // ── Points tab: local optimistic updates, no page refresh ────
  const handleAccountUpdated = useCallback((account: PointsAccount) => {
    setPointsAccounts(prev => prev.map(a => a.id === account.id ? account : a))
  }, [])
  const handlePointTxAdded = useCallback((tx: PointTransaction) => {
    setPointTransactions(prev => [tx, ...prev])
  }, [])
  const handlePointTxRemoved = useCallback((txId: string) => {
    setPointTransactions(prev => prev.filter(t => t.id !== txId))
  }, [])

  // ── Certs tab (balance-tracked): local optimistic updates ────
  const handleCertUpdated = useCallback((cert: Certificate) => {
    setCertificates(prev => prev.map(c => c.id === cert.id ? cert : c))
  }, [])
  const handleCertTxAdded = useCallback((tx: CertBalanceTransaction) => {
    setCertBalanceTransactions(prev => [tx, ...prev])
  }, [])
  const handleCertTxRemoved = useCallback((txId: string) => {
    setCertBalanceTransactions(prev => prev.filter(t => t.id !== txId))
  }, [])

  const handleToggle = useCallback(async (id: string, markUsed: boolean) => {
    const credit = credits.find(c => c.id === id)
    const isAutopilot = credit?.autopilot ?? false

    // Optimistic update — row flips instantly
    setCredits(prev => prev.map(c =>
      c.id !== id ? c : {
        ...c,
        is_used:         markUsed,
        used_cents:      markUsed ? c.amount_cents : 0,
        remaining_cents: markUsed ? 0 : c.amount_cents,
      }
    ))

    try {
      const endpoint = isAutopilot
        ? (markUsed ? `/api/credits/${id}/unmark` : `/api/credits/${id}/log`)
        : (markUsed ? `/api/credits/${id}/log`   : `/api/credits/${id}/unmark`)
      const body = (isAutopilot && !markUsed)
        ? JSON.stringify({ amount_cents: 0 })
        : '{}'

      await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      // Refresh server component so per-card and page-level totals recompute
      router.refresh()
    } catch {
      // Revert optimistic update on failure
      setCredits(prev => prev.map(c =>
        c.id !== id ? c : {
          ...c,
          is_used:         !markUsed,
          used_cents:      !markUsed ? c.amount_cents : 0,
          remaining_cents: !markUsed ? 0 : c.amount_cents,
        }
      ))
    }
  }, [credits, router])

  // "Some used" — set the exact amount used this period (non-autopilot credits).
  // 0 clears the usage row; the full amount is the same as Mark used.
  const handleSetUsed = useCallback(async (id: string, usedCents: number) => {
    const before = credits.find(c => c.id === id)
    if (!before || before.autopilot) return
    const cents = Math.max(0, Math.min(before.amount_cents, Math.round(usedCents)))

    setCredits(prev => prev.map(c =>
      c.id !== id ? c : {
        ...c,
        used_cents:      cents,
        remaining_cents: c.amount_cents - cents,
        is_used:         cents >= c.amount_cents,
        ytd_used_cents:  cents,
      }
    ))

    try {
      const res = cents === 0
        ? await fetch(`/api/credits/${id}/unmark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        : await fetch(`/api/credits/${id}/log`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount_cents: cents, exact: true }),
          })
      if (!res.ok) throw new Error('save failed')
    } catch {
      // Revert to the pre-edit state on failure
      setCredits(prev => prev.map(c => c.id !== id ? c : before))
    }
  }, [credits])

  const tabs = [
    { id: 'today'   as const, label: 'Today',         icon: '🎯' },
    { id: 'credits' as const, label: 'Credits',       icon: '💳' },
    { id: 'points'  as const, label: 'Points',        icon: '⭐' },
    { id: 'certs'   as const, label: 'Certificates',  icon: '🎟' },
    { id: 'hotels'  as const, label: 'Hotel Tracker', icon: '🏨' },
    { id: 'planner' as const, label: 'Trip Planner',  icon: '🧭' },
    { id: 'guide'   as const, label: 'Benefits Guide', icon: '📖' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{`
        @media (max-width: 767px) {
          .cc-sidebar { transform: translateX(-100%); position: fixed !important; z-index: 40; transition: transform .25s ease; height: 100vh !important; }
          .cc-sidebar.open { transform: translateX(0); }
          .cc-hamburger { display: flex !important; }
        }
      `}</style>

      {/* Hamburger — mobile only */}
      <button
        className="cc-hamburger"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open menu"
        style={{
          display: 'none', position: 'fixed', top: 14, left: 14, zIndex: 50,
          background: '#fff', border: '1px solid var(--sand)', borderRadius: 8,
          padding: '6px 8px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="var(--ink)">
          <rect y="3" width="18" height="2" rx="1" fill="currentColor"/>
          <rect y="8" width="18" height="2" rx="1" fill="currentColor"/>
          <rect y="13" width="18" height="2" rx="1" fill="currentColor"/>
        </svg>
      </button>

      {/* Backdrop — mobile only */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 30 }}
        />
      )}

      {/* Sidebar */}
      <aside className={`cc-sidebar${mobileNavOpen ? ' open' : ''}`} style={{
        width: 220, minHeight: '100vh', background: '#fff',
        borderRight: '1px solid var(--sand)', display: 'flex',
        flexDirection: 'column', flexShrink: 0,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--sand)' }}>
          <h1 className="fr" style={{ fontSize: 22, color: 'var(--ink)' }}>Credit Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--bark)', marginTop: 2 }}>Katie &amp; Stephen</p>
        </div>
        <nav style={{ flex: 1, padding: 12 }}>
          {tabs.map(t => (
            <NavItem
              key={t.id}
              label={t.label}
              icon={t.icon}
              active={tab === t.id}
              onClick={() => { setTab(t.id); setMobileNavOpen(false) }}
            />
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid var(--sand)' }}>
          <button
            onClick={async () => { await fetch('/api/auth/login', { method: 'DELETE' }); window.location.href = '/login' }}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--sand)',
              fontSize: 12, color: 'var(--bark)', cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 48px' }}>
          <div style={{ marginBottom: 32 }}>
            <h1 className="fr" style={{ fontSize: 28 }}>
              {tabs.find(t => t.id === tab)?.label}
            </h1>
          </div>

          {tab === 'today' && (
            <HotelBurnPanel cards={cards} credits={credits} today={today} onPlan={() => setTab('planner')} />
          )}
          {tab === 'today' && (
            <TodayPage cards={cards} credits={credits} onToggle={handleToggle} onSetUsed={handleSetUsed} today={today} />
          )}
          {tab === 'credits' && (
            <CreditsPage cards={cards} credits={credits} onToggle={handleToggle} onSetUsed={handleSetUsed} today={today} />
          )}
          {tab === 'points' && (
            <PointsPage
              pointsAccounts={pointsAccounts}
              pointTransactions={pointTransactions}
              onAccountUpdated={handleAccountUpdated}
              onTransactionAdded={handlePointTxAdded}
              onTransactionRemoved={handlePointTxRemoved}
            />
          )}
          {tab === 'certs' && (
            <CertsPage
              certificates={certificates}
              cards={cards}
              certRedemptions={certRedemptions}
              certBalanceTransactions={certBalanceTransactions}
              today={today}
              onCertUpdated={handleCertUpdated}
              onTransactionAdded={handleCertTxAdded}
              onTransactionRemoved={handleCertTxRemoved}
            />
          )}
          {tab === 'planner' && (
            <PlannerPage cards={cards} credits={credits} library={hotelLibrary} today={today} />
          )}
          {tab === 'guide' && <BenefitsGuidePage cards={cards} />}
          {tab === 'hotels' && (
            <HotelTrackerPage weekends={hotelWeekends} bookings={hotelBookings} cards={cards} credits={credits} />
          )}
        </div>
      </main>
    </div>
  )
}
