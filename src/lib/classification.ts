export interface Classification {
  category: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
}

interface Rule {
  keywords: string[]
  category: string
  priority: Classification['priority']
}

const RULES: Rule[] = [
  {
    keywords: ['wasserrohrbruch', 'rohrbruch', 'wassereinbruch', 'überschwemmung', 'flooding', 'water leak', 'pipe burst'],
    category: 'Maintenance',
    priority: 'CRITICAL',
  },
  {
    keywords: ['gasgeruch', 'gasaustritt', 'gas leak', 'gas smell'],
    category: 'Maintenance',
    priority: 'CRITICAL',
  },
  {
    keywords: ['heizung', 'heizungsausfall', 'kein warmwasser', 'no hot water', 'heating', 'heizkörper'],
    category: 'Heating',
    priority: 'CRITICAL',
  },
  {
    keywords: ['notfall', 'dringend', 'emergency', 'urgent', 'sofort'],
    category: 'Maintenance',
    priority: 'CRITICAL',
  },
  {
    keywords: ['beschwerde', 'complaint', 'unzumutbar', 'keine reaktion', 'keine antwort', 'ignoriert', 'erreichbar'],
    category: 'Complaint',
    priority: 'HIGH',
  },
  {
    keywords: ['lärm', 'lärmbelästigung', 'ruhestörung', 'noise'],
    category: 'Complaint',
    priority: 'HIGH',
  },
  {
    keywords: ['schimmel', 'schimmelflecken', 'mold', 'mould', 'feuchtigkeit'],
    category: 'Complaint',
    priority: 'HIGH',
  },
  {
    keywords: ['mahnung', 'miete nicht gebucht', 'zahlungsrückstand', 'mietausfall', 'payment', 'rent not received'],
    category: 'Payment',
    priority: 'HIGH',
  },
  {
    keywords: ['rechnung', 'invoice', 'abrechnung', 'nebenkostenabrechnung', 'betriebskosten', 'billing'],
    category: 'Billing',
    priority: 'NORMAL',
  },
  {
    keywords: ['dokument', 'document', 'certificate', 'zertifikat', 'urkunde', 'energieausweis', 'selbstauskunft'],
    category: 'Documents',
    priority: 'NORMAL',
  },
  {
    keywords: ['aufzug', 'fahrstuhl', 'elevator', 'lift'],
    category: 'Maintenance',
    priority: 'HIGH',
  },
  {
    keywords: ['reparatur', 'defekt', 'kaputt', 'broken', 'repair', 'maintenance'],
    category: 'Maintenance',
    priority: 'NORMAL',
  },
]

/** Deterministic keyword-based classification of an email */
export function classifyEmail(subject: string, bodyText: string): Classification {
  const combined = `${subject} ${bodyText}`.toLowerCase()

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => combined.includes(kw))) {
      return { category: rule.category, priority: rule.priority }
    }
  }

  return { category: 'General', priority: 'NORMAL' }
}

/** Heuristic summary from subject + first 160 chars of body */
export function generateSummary(subject: string, bodyText: string): string {
  const body = bodyText.replace(/\s+/g, ' ').trim().substring(0, 160)
  const ellipsis = bodyText.trim().length > 160 ? '…' : ''
  return `${subject}. ${body}${ellipsis}`
}
