import { PrismaClient } from '../src/generated/prisma'
import { calculateEscalation } from '../src/lib/escalation'
import { calculatePortcoMetrics } from '../src/lib/metrics'

const prisma = new PrismaClient()

function h(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 3_600_000)
}
function d(daysAgo: number, extraHoursAgo = 0): Date {
  return h(daysAgo * 24 + extraHoursAgo)
}

async function main() {
  // Clean up
  await prisma.portcoMetricSnapshot.deleteMany()
  await prisma.message.deleteMany()
  await prisma.case.deleteMany()
  await prisma.user.deleteMany()
  await prisma.portco.deleteMany()
  await prisma.demoSettings.deleteMany()

  // Demo settings
  await prisma.demoSettings.create({ data: { id: 1, clockOffset: 0 } })

  // ── Portcos ──────────────────────────────────────────────────────────────
  const hamburg = await prisma.portco.create({
    data: {
      name: 'Hamburg Immobilien GmbH',
      slug: 'hamburg-immo',
      casePrefix: 'HH',
      teamLeadUserId: 2, // Lars Müller (created below)
      inboundAlias: 'cases@hamburg-immo.de',
      status: 'ACTIVE',
    },
  })
  const berlin = await prisma.portco.create({
    data: {
      name: 'Berlin Residenz KG',
      slug: 'berlin-residenz',
      casePrefix: 'BE',
      teamLeadUserId: 3, // Anna Schmidt
      inboundAlias: 'cases@berlin-residenz.de',
      status: 'ACTIVE',
    },
  })
  const munich = await prisma.portco.create({
    data: {
      name: 'München Grundbesitz GmbH',
      slug: 'muenchen-gb',
      casePrefix: 'MU',
      teamLeadUserId: null, // No team lead assigned — visible only to HQ
      inboundAlias: 'cases@muenchen-gb.de',
      status: 'ACTIVE',
    },
  })

  // ── Users ────────────────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      id: 1,
      name: 'Sarah Klein',
      email: 'sarah.klein@hq.portco.de',
      role: 'HQ',
      portcoId: null,
    },
  })
  await prisma.user.create({
    data: {
      id: 2,
      name: 'Lars Müller',
      email: 'lars.mueller@hamburg-immo.de',
      role: 'TEAM_LEAD',
      portcoId: hamburg.id,
    },
  })
  await prisma.user.create({
    data: {
      id: 3,
      name: 'Anna Schmidt',
      email: 'anna.schmidt@berlin-residenz.de',
      role: 'TEAM_LEAD',
      portcoId: berlin.id,
    },
  })

  // ── HAMBURG CASES (healthy — mostly resolved, fast responses) ─────────────

  const hh001 = await prisma.case.create({
    data: {
      caseNumber: 'HH-0001',
      portcoId: hamburg.id,
      teamLeadUserId: 2,
      assignedInternalOwnerName: 'Max Braun',
      customerName: 'Thomas Weber',
      customerEmail: 'thomas.weber@privat.de',
      subject: 'Nebenkostenabrechnung 2023 – Frage zur Heizkostenposition',
      normalizedSubject: 'nebenkostenabrechnung 2023 – frage zur heizkostenposition',
      category: 'Billing',
      priority: 'NORMAL',
      status: 'RESOLVED',
      escalationLevel: 0,
      openedAt: d(7),
      firstResponseAt: d(6, 21),
      lastCustomerMessageAt: d(6, 5),
      lastInternalUpdateAt: d(5),
      resolvedAt: d(5),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Nebenkostenabrechnung 2023 – Frage zur Heizkostenposition. Sehr geehrte Damen und Herren, ich habe die Nebenkostenabrechnung für 2023 erhalten und hätte gerne eine Erläuterung zur Heizkostenposition...',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: hh001.id, direction: 'INBOUND', from: 'thomas.weber@privat.de', to: 'cases@hamburg-immo.de', subject: 'Nebenkostenabrechnung 2023 – Frage zur Heizkostenposition', bodyText: 'Sehr geehrte Damen und Herren,\n\nich habe die Nebenkostenabrechnung für 2023 erhalten und hätte gerne eine Erläuterung zur Heizkostenposition in Höhe von 1.240 €. Diese erscheint mir im Vergleich zum Vorjahr deutlich erhöht.\n\nMit freundlichen Grüßen,\nThomas Weber', sentAt: d(7) },
      { caseId: hh001.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'thomas.weber@privat.de', subject: 'Re: Nebenkostenabrechnung 2023 – Frage zur Heizkostenposition', bodyText: 'Sehr geehrter Herr Weber,\n\nvielen Dank für Ihre Nachricht. Die Erhöhung der Heizkosten ist auf die gestiegenen Energiepreise im Jahr 2023 zurückzuführen. Ich sende Ihnen gerne eine detaillierte Aufstellung zu.\n\nMit freundlichen Grüßen,\nMax Braun\nHamburg Immobilien GmbH', sentAt: d(6, 21) },
      { caseId: hh001.id, direction: 'INBOUND', from: 'thomas.weber@privat.de', to: 'cases@hamburg-immo.de', subject: 'Re: Nebenkostenabrechnung 2023 – Frage zur Heizkostenposition', bodyText: 'Danke, die Aufstellung hat mir geholfen. Ich akzeptiere die Abrechnung.\n\nBeste Grüße, T. Weber', sentAt: d(6, 5) },
      { caseId: hh001.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'thomas.weber@privat.de', subject: 'Re: Nebenkostenabrechnung 2023 – Erledigt', bodyText: 'Sehr geehrter Herr Weber, vielen Dank für Ihre Rückmeldung. Wir freuen uns, dass Ihre Frage geklärt werden konnte. Der Fall gilt damit als abgeschlossen.\n\nMax Braun', sentAt: d(5) },
    ],
  })

  const hh002 = await prisma.case.create({
    data: {
      caseNumber: 'HH-0002',
      portcoId: hamburg.id,
      teamLeadUserId: 2,
      assignedInternalOwnerName: 'Max Braun',
      customerName: 'Julia Bauer',
      customerEmail: 'julia.bauer@gmail.com',
      subject: 'Wasserfleck an der Decke – Wohnung 3. OG',
      normalizedSubject: 'wasserfleck an der decke – wohnung 3. og',
      category: 'Maintenance',
      priority: 'HIGH',
      status: 'RESOLVED',
      escalationLevel: 0,
      openedAt: d(6),
      firstResponseAt: d(5, 20),
      lastCustomerMessageAt: d(4, 12),
      lastInternalUpdateAt: d(4),
      resolvedAt: d(4),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 8,
      slaResolutionHours: 72,
      aiSummary: 'Wasserfleck an der Decke im Wohnzimmer. Mieter berichtet über einen großen braunen Wasserfleck, der sich ausbreitet.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: hh002.id, direction: 'INBOUND', from: 'julia.bauer@gmail.com', to: 'cases@hamburg-immo.de', subject: 'Wasserfleck an der Decke – Wohnung 3. OG', bodyText: 'Guten Tag,\n\nin meinem Wohnzimmer ist ein großer brauner Wasserfleck an der Decke entstanden, der sich über die letzten Tage ausgebreitet hat. Bitte schicken Sie jemanden vorbei.\n\nJ. Bauer, Wohnung 12', sentAt: d(6) },
      { caseId: hh002.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'julia.bauer@gmail.com', subject: 'Re: Wasserfleck an der Decke', bodyText: 'Sehr geehrte Frau Bauer, wir haben einen Techniker für morgen 10–12 Uhr eingeplant. Bitte stellen Sie sicher, dass jemand vor Ort ist.\n\nMax Braun', sentAt: d(5, 20) },
      { caseId: hh002.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'julia.bauer@gmail.com', subject: 'Reparatur abgeschlossen', bodyText: 'Sehr geehrte Frau Bauer, der Techniker hat heute den Defekt behoben. Der Wasserfleck wird nach dem Trocknen gestrichen. Fall geschlossen.\n\nMax Braun', sentAt: d(4) },
    ],
  })

  const hh003 = await prisma.case.create({
    data: {
      caseNumber: 'HH-0003',
      portcoId: hamburg.id,
      teamLeadUserId: 2,
      assignedInternalOwnerName: 'Nina Schulz',
      customerName: 'Klaus Fischer',
      customerEmail: 'k.fischer@t-online.de',
      subject: 'Heizkörper im Schlafzimmer kalt – keine Wärme',
      normalizedSubject: 'heizkörper im schlafzimmer kalt – keine wärme',
      category: 'Heating',
      priority: 'CRITICAL',
      status: 'RESOLVED',
      escalationLevel: 0,
      openedAt: d(5),
      firstResponseAt: d(4, 22),
      lastCustomerMessageAt: d(3, 10),
      lastInternalUpdateAt: d(3),
      resolvedAt: d(3),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: 'Heizkörper kalt. Kein Warmwasser im Schlafzimmer. Haustechniker entsandt, Thermostat defekt ausgetauscht.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: hh003.id, direction: 'INBOUND', from: 'k.fischer@t-online.de', to: 'cases@hamburg-immo.de', subject: 'Heizkörper im Schlafzimmer kalt – keine Wärme', bodyText: 'Sehr geehrte Damen und Herren, seit zwei Tagen ist der Heizkörper in meinem Schlafzimmer komplett kalt. Ich bitte um dringende Hilfe!\n\nK. Fischer', sentAt: d(5) },
      { caseId: hh003.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'k.fischer@t-online.de', subject: 'Re: Heizkörper kalt – Techniker heute', bodyText: 'Sehr geehrter Herr Fischer, wir nehmen das dringend – unser Techniker kommt heute Nachmittag. Nina Schulz', sentAt: d(4, 22) },
      { caseId: hh003.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'k.fischer@t-online.de', subject: 'Reparatur abgeschlossen', bodyText: 'Das Thermostatventil wurde ausgetauscht. Heizung sollte jetzt funktionieren. Bei Fragen melden. Nina Schulz', sentAt: d(3) },
    ],
  })

  const hh004 = await prisma.case.create({
    data: {
      caseNumber: 'HH-0004',
      portcoId: hamburg.id,
      teamLeadUserId: 2,
      assignedInternalOwnerName: 'Nina Schulz',
      customerName: 'Marta Hoffmann',
      customerEmail: 'marta.h@web.de',
      subject: 'Schlüsselverlust – Ersatzschlüssel benötigt',
      normalizedSubject: 'schlüsselverlust – ersatzschlüssel benötigt',
      category: 'General',
      priority: 'NORMAL',
      status: 'WAITING_ON_CUSTOMER',
      escalationLevel: 0,
      openedAt: d(3),
      firstResponseAt: d(2, 16),
      lastCustomerMessageAt: d(3),
      lastInternalUpdateAt: d(2, 16),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Schlüsselverlust, Ersatzschlüssel angefragt. Kundin soll Personalausweis mitbringen für Ausgabe.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: hh004.id, direction: 'INBOUND', from: 'marta.h@web.de', to: 'cases@hamburg-immo.de', subject: 'Schlüsselverlust – Ersatzschlüssel benötigt', bodyText: 'Guten Tag, ich habe meinen Wohnungsschlüssel verloren und benötige einen Ersatz. Was kostet das und wie lange dauert es?\n\nM. Hoffmann, Wohnung 7', sentAt: d(3) },
      { caseId: hh004.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'marta.h@web.de', subject: 'Re: Schlüsselverlust', bodyText: 'Sehr geehrte Frau Hoffmann, Ersatzschlüssel kostet 35 €. Bitte kommen Sie Mo–Fr 9–12 Uhr ins Büro mit Personalausweis. Nina Schulz', sentAt: d(2, 16) },
    ],
  })

  const hh005 = await prisma.case.create({
    data: {
      caseNumber: 'HH-0005',
      portcoId: hamburg.id,
      teamLeadUserId: 2,
      assignedInternalOwnerName: 'Max Braun',
      customerName: 'Hans Bergmann',
      customerEmail: 'h.bergmann@freenet.de',
      subject: 'Formular Selbstauskunft – Verlängerung Mietvertrag',
      normalizedSubject: 'formular selbstauskunft – verlängerung mietvertrag',
      category: 'Documents',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      escalationLevel: 0,
      openedAt: d(2),
      firstResponseAt: d(1, 6),
      lastCustomerMessageAt: d(2),
      lastInternalUpdateAt: d(1, 6),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Formular Selbstauskunft für Mietvertragsverlängerung angefragt. Formular wurde zugesendet.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: hh005.id, direction: 'INBOUND', from: 'h.bergmann@freenet.de', to: 'cases@hamburg-immo.de', subject: 'Formular Selbstauskunft – Verlängerung Mietvertrag', bodyText: 'Guten Tag, ich möchte meinen Mietvertrag verlängern. Welche Unterlagen benötige ich? Bitte senden Sie mir das Selbstauskunftsformular.\n\nH. Bergmann', sentAt: d(2) },
      { caseId: hh005.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'h.bergmann@freenet.de', subject: 'Re: Selbstauskunft Formular', bodyText: 'Sehr geehrter Herr Bergmann, im Anhang das Selbstauskunftsformular. Bitte ausgefüllt zurückzusenden. Max Braun', sentAt: d(1, 6) },
    ],
  })

  const hh006 = await prisma.case.create({
    data: {
      caseNumber: 'HH-0006',
      portcoId: hamburg.id,
      teamLeadUserId: 2,
      assignedInternalOwnerName: 'Nina Schulz',
      customerName: 'Sandra Meier',
      customerEmail: 'sandra.meier@outlook.de',
      subject: 'Treppenhaus Renovierung – Terminabstimmung',
      normalizedSubject: 'treppenhaus renovierung – terminabstimmung',
      category: 'Maintenance',
      priority: 'LOW',
      status: 'WAITING_ON_CUSTOMER',
      escalationLevel: 0,
      openedAt: d(1),
      firstResponseAt: h(12),
      lastCustomerMessageAt: d(1),
      lastInternalUpdateAt: h(12),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 48,
      slaResolutionHours: 168,
      aiSummary: 'Terminabstimmung für Treppenhausrenovierung. Mieter bittet um Vorankündigung.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: hh006.id, direction: 'INBOUND', from: 'sandra.meier@outlook.de', to: 'cases@hamburg-immo.de', subject: 'Treppenhaus Renovierung – Terminabstimmung', bodyText: 'Guten Tag, ich habe gehört, dass das Treppenhaus renoviert werden soll. Bitte informieren Sie mich rechtzeitig über den Termin, da ich entsprechend planen muss.\n\nS. Meier', sentAt: d(1) },
      { caseId: hh006.id, direction: 'OUTBOUND', from: 'cases@hamburg-immo.de', to: 'sandra.meier@outlook.de', subject: 'Re: Treppenhausrenovierung', bodyText: 'Sehr geehrte Frau Meier, wir planen die Renovierung für Anfang nächsten Monats. Genauen Termin bestätigen wir noch. Nina Schulz', sentAt: h(12) },
    ],
  })

  // ── BERLIN CASES (failing TL — severely neglected queue) ─────────────────

  const be001 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0001',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Felix Wagner',
      customerName: 'Michael Braun',
      customerEmail: 'michael.braun@gmx.de',
      subject: 'Heizungsausfall – komplette Wohnung ohne Heizung',
      normalizedSubject: 'heizungsausfall – komplette wohnung ohne heizung',
      category: 'Heating',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(10),
      firstResponseAt: null, // 10 days, NO reply. SLA was 2h.
      lastCustomerMessageAt: h(4),
      lastInternalUpdateAt: null,
      repeatFollowUpCount: 5,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: 'Heizungsausfall KRITISCH. Kein Reply nach 10 Tagen (SLA: 2h). Mieter hat 5 mal nachgefragt. Familie mit kranker Mutter. Rechtliche Schritte angekündigt.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be001.id, direction: 'INBOUND', from: 'michael.braun@gmx.de', to: 'cases@berlin-residenz.de', subject: 'Heizungsausfall – komplette Wohnung ohne Heizung', bodyText: 'Sehr geehrte Damen und Herren, seit heute Morgen ist die Heizung in meiner gesamten Wohnung ausgefallen. Es sind nur 14 Grad – bitte dringend um Hilfe!\n\nM. Braun, Wohnung 15', sentAt: d(10) },
      { caseId: be001.id, direction: 'INBOUND', from: 'michael.braun@gmx.de', to: 'cases@berlin-residenz.de', subject: 'Re: Heizung – Tag 2, keine Antwort', bodyText: 'Immer noch keine Heizung. Ich habe eine kranke Mutter zuhause. Bitte sofort melden!\n\nM. Braun', sentAt: d(8) },
      { caseId: be001.id, direction: 'INBOUND', from: 'michael.braun@gmx.de', to: 'cases@berlin-residenz.de', subject: 'Re: Heizung – Tag 5, dritte Anfrage', bodyText: 'Das ist absolut inakzeptabel. 5 Tage ohne Heizung. Ich ziehe rechtliche Schritte in Betracht.\n\nM. Braun', sentAt: d(5) },
      { caseId: be001.id, direction: 'INBOUND', from: 'michael.braun@gmx.de', to: 'cases@berlin-residenz.de', subject: 'Re: Heizung – letzte Aufforderung vor Klage', bodyText: 'Ich habe einen Anwalt kontaktiert. Wenn ich heute keine Reaktion erhalte, wird mietrechtlich vorgegangen. Der Schaden durch Heizungskosten wird von Ihnen gefordert.\n\nM. Braun', sentAt: d(2) },
      { caseId: be001.id, direction: 'INBOUND', from: 'michael.braun@gmx.de', to: 'cases@berlin-residenz.de', subject: 'Re: Heizung – Fristablauf heute Abend', bodyText: 'Frist läuft heute Abend ab. Noch immer keine Antwort von Ihnen. 10 Tage ohne Heizung, 5 Nachrichten – keine einzige Reaktion. M. Braun', sentAt: h(4) },
    ],
  })

  const be002 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0002',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Felix Wagner',
      customerName: 'Lisa Müller',
      customerEmail: 'lisa.mueller@yahoo.de',
      subject: 'Rechnungsklärung Wasserkosten – Betrag unklar',
      normalizedSubject: 'rechnungsklärung wasserkosten – betrag unklar',
      category: 'Billing',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      escalationLevel: 0,
      openedAt: d(5),
      firstResponseAt: d(4, 4),
      lastCustomerMessageAt: d(2),
      lastInternalUpdateAt: d(4, 4),
      repeatFollowUpCount: 1,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Kundin fragt nach Aufschlüsselung der Wasserkostenrechnung für Q3. Erstantwort erfolgt, aber keine finale Klärung.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be002.id, direction: 'INBOUND', from: 'lisa.mueller@yahoo.de', to: 'cases@berlin-residenz.de', subject: 'Rechnungsklärung Wasserkosten', bodyText: 'Hallo, ich habe eine Rechnung über Wasserkosten erhalten, die ich nicht nachvollziehen kann. Können Sie mir bitte eine Aufschlüsselung geben? Lisa Müller', sentAt: d(5) },
      { caseId: be002.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'lisa.mueller@yahoo.de', subject: 'Re: Rechnungsklärung Wasserkosten', bodyText: 'Sehr geehrte Frau Müller, ich schaue die Unterlagen durch und melde mich bis Ende der Woche. Felix Wagner', sentAt: d(4, 4) },
      { caseId: be002.id, direction: 'INBOUND', from: 'lisa.mueller@yahoo.de', to: 'cases@berlin-residenz.de', subject: 'Re: Rechnungsklärung Wasserkosten – Nachfrage', bodyText: 'Hallo Herr Wagner, es ist jetzt Freitag und ich habe noch keine Rückmeldung erhalten. Können Sie sich bitte melden? L. Müller', sentAt: d(2) },
    ],
  })

  const be003 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0003',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Sarah Vogt',
      customerName: 'Peter Schmidt',
      customerEmail: 'p.schmidt@posteo.de',
      subject: 'Wasserdruck zu niedrig – kaum Wasser in Dusche',
      normalizedSubject: 'wasserdruck zu niedrig – kaum wasser in dusche',
      category: 'Maintenance',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      escalationLevel: 0,
      openedAt: d(4),
      firstResponseAt: d(3, 2),
      lastCustomerMessageAt: d(4),
      lastInternalUpdateAt: d(3, 2),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Niedriger Wasserdruck in Dusche gemeldet. Techniker wird eingeplant.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be003.id, direction: 'INBOUND', from: 'p.schmidt@posteo.de', to: 'cases@berlin-residenz.de', subject: 'Wasserdruck zu niedrig', bodyText: 'Guten Tag, seit einigen Tagen ist der Wasserdruck in meiner Dusche sehr gering. Das Duschen dauert ewig. Bitte um Überprüfung. P. Schmidt', sentAt: d(4) },
      { caseId: be003.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'p.schmidt@posteo.de', subject: 'Re: Wasserdruck', bodyText: 'Sehr geehrter Herr Schmidt, wir haben das Problem aufgenommen und planen einen Technikereinsatz für nächste Woche. Sarah Vogt', sentAt: d(3, 2) },
    ],
  })

  const be004 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0004',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Felix Wagner',
      customerName: 'Andreas Koch',
      customerEmail: 'a.koch@kochmail.de',
      subject: 'Lärmbelästigung durch Nachbarn – Wohnung 8',
      normalizedSubject: 'lärmbelästigung durch nachbarn – wohnung 8',
      category: 'Complaint',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      escalationLevel: 2,
      openedAt: d(12),
      firstResponseAt: d(11, 18),
      lastCustomerMessageAt: h(3),
      lastInternalUpdateAt: d(8),
      repeatFollowUpCount: 4,
      slaFirstResponseHours: 8,
      slaResolutionHours: 72,
      aiSummary: 'Lärmbelästigung seit 12 Tagen ungelöst. 4 Follow-ups. Abmahnung wurde verschickt, aber Problem besteht. Letztes internes Update vor 8 Tagen.',
      isOverdue: true,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be004.id, direction: 'INBOUND', from: 'a.koch@kochmail.de', to: 'cases@berlin-residenz.de', subject: 'Lärmbelästigung durch Nachbarn', bodyText: 'Guten Tag, mein Nachbar in Wohnung 8 macht regelmäßig bis 2 Uhr nachts Lärm. Ich kann nicht schlafen. Bitte handeln Sie. A. Koch', sentAt: d(6) },
      { caseId: be004.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'a.koch@kochmail.de', subject: 'Re: Lärmbelästigung', bodyText: 'Sehr geehrter Herr Koch, wir haben den Nachbarn schriftlich abgemahnt. Bitte melden Sie sich, falls das Problem anhält. Felix Wagner', sentAt: d(5, 18) },
      { caseId: be004.id, direction: 'INBOUND', from: 'a.koch@kochmail.de', to: 'cases@berlin-residenz.de', subject: 'Re: Lärmbelästigung – immer noch Problem', bodyText: 'Das Problem besteht weiterhin. Letzte Nacht wieder bis 1 Uhr. Was passiert jetzt? A. Koch', sentAt: d(3) },
      { caseId: be004.id, direction: 'INBOUND', from: 'a.koch@kochmail.de', to: 'cases@berlin-residenz.de', subject: 'Re: Lärmbelästigung – zweite Nachfrage', bodyText: 'Ich warte auf eine Rückmeldung. Das ist nun schon 6 Tage her und nichts hat sich geändert. A. Koch', sentAt: d(1) },
    ],
  })

  const be005 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0005',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Sarah Vogt',
      customerName: 'Sabine Wolf',
      customerEmail: 'sabine.wolf@berlin.de',
      subject: 'Jahresabrechnung Heizkosten nicht erhalten',
      normalizedSubject: 'jahresabrechnung heizkosten nicht erhalten',
      category: 'Billing',
      priority: 'NORMAL',
      status: 'AWAITING_FIRST_RESPONSE',
      escalationLevel: 1,
      openedAt: d(3),
      firstResponseAt: null, // Overdue — 24h SLA, now 3 days old
      lastCustomerMessageAt: d(3),
      lastInternalUpdateAt: null,
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Jahresabrechnung Heizkosten für 2023 nicht erhalten. Kunde bittet um Zusendung.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be005.id, direction: 'INBOUND', from: 'sabine.wolf@berlin.de', to: 'cases@berlin-residenz.de', subject: 'Jahresabrechnung Heizkosten nicht erhalten', bodyText: 'Sehr geehrte Damen und Herren, ich habe bis heute keine Jahresabrechnung für die Heizkosten 2023 erhalten. Alle anderen Mieter im Haus haben sie offenbar bekommen. Bitte senden Sie mir die Abrechnung zu.\n\nMit freundlichem Gruß, S. Wolf', sentAt: d(3) },
    ],
  })

  const be006 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0006',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Sarah Vogt',
      customerName: 'Rainer Huber',
      customerEmail: 'r.huber@icloud.com',
      subject: 'Tiefgarage – Stellplatz gesperrt ohne Ankündigung',
      normalizedSubject: 'tiefgarage – stellplatz gesperrt ohne ankündigung',
      category: 'General',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      escalationLevel: 0,
      openedAt: d(2),
      firstResponseAt: d(1, 4),
      lastCustomerMessageAt: d(2),
      lastInternalUpdateAt: d(1, 4),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Tiefgaragenstellplatz des Mieters wurde ohne Vorankündigung gesperrt. Klärung läuft.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be006.id, direction: 'INBOUND', from: 'r.huber@icloud.com', to: 'cases@berlin-residenz.de', subject: 'Tiefgarage Stellplatz gesperrt', bodyText: 'Hallo, mein gemieteter Stellplatz in der Tiefgarage ist heute mit einem Poller gesperrt worden – ohne jede Ankündigung. Mein Auto stand den ganzen Tag draußen. Was ist passiert? R. Huber', sentAt: d(2) },
      { caseId: be006.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'r.huber@icloud.com', subject: 'Re: Tiefgarage', bodyText: 'Sehr geehrter Herr Huber, es tut uns leid! Das war ein Versehen des Reinigungsdienstes. Der Poller wird sofort entfernt. Sarah Vogt', sentAt: d(1, 4) },
    ],
  })

  const be007 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0007',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Felix Wagner',
      customerName: 'Katja Weber',
      customerEmail: 'katja.w@mail.de',
      subject: 'Schimmelbildung im Badezimmer – gesundheitsgefährdend',
      normalizedSubject: 'schimmelbildung im badezimmer – gesundheitsgefährdend',
      category: 'Complaint',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(16),
      firstResponseAt: d(15, 6),
      lastCustomerMessageAt: h(5),
      lastInternalUpdateAt: d(10),
      repeatFollowUpCount: 6,
      slaFirstResponseHours: 8,
      slaResolutionHours: 72,
      aiSummary: 'Schwarzschimmel Badezimmer seit 16 Tagen. 6 Nachfragen, kein Gutachter erschienen. Letztes internes Update vor 10 Tagen. Mieterverein wurde eingeschaltet.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be007.id, direction: 'INBOUND', from: 'katja.w@mail.de', to: 'cases@berlin-residenz.de', subject: 'Schimmelbildung im Badezimmer', bodyText: 'Guten Tag, in meinem Badezimmer hat sich großflächig schwarzer Schimmel gebildet. Das ist ein Gesundheitsrisiko. Bitte handeln Sie sofort. K. Weber', sentAt: d(8) },
      { caseId: be007.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'katja.w@mail.de', subject: 'Re: Schimmel', bodyText: 'Sehr geehrte Frau Weber, wir haben das aufgenommen. Ein Gutachter wird sich melden. Felix Wagner', sentAt: d(7, 6) },
      { caseId: be007.id, direction: 'INBOUND', from: 'katja.w@mail.de', to: 'cases@berlin-residenz.de', subject: 'Re: Schimmel – Nachfrage 1', bodyText: 'Es hat sich noch niemand gemeldet. Der Schimmel wächst weiter. K. Weber', sentAt: d(5) },
      { caseId: be007.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'katja.w@mail.de', subject: 'Re: Schimmel', bodyText: 'Der Gutachtertermin wird diese Woche noch koordiniert. Bitte etwas Geduld. Felix Wagner', sentAt: d(4) },
      { caseId: be007.id, direction: 'INBOUND', from: 'katja.w@mail.de', to: 'cases@berlin-residenz.de', subject: 'Re: Schimmel – Nachfrage 2', bodyText: 'Es ist jetzt eine Woche her. Kein Gutachter, kein Termin. Ich bin sehr unzufrieden. K. Weber', sentAt: d(2) },
      { caseId: be007.id, direction: 'INBOUND', from: 'katja.w@mail.de', to: 'cases@berlin-residenz.de', subject: 'Re: Schimmel – letzte Warnung', bodyText: 'Ich zeige das Mietrechtswidrige Verhalten jetzt beim Mieterverein an, wenn sich heute nichts tut.', sentAt: h(12) },
    ],
  })

  const be008 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0008',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Sarah Vogt',
      customerName: 'Franziska Bauer',
      customerEmail: 'fbauer@protonmail.com',
      subject: 'Energieausweis Kopie anfordern',
      normalizedSubject: 'energieausweis kopie anfordern',
      category: 'Documents',
      priority: 'NORMAL',
      status: 'WAITING_ON_CUSTOMER',
      escalationLevel: 0,
      openedAt: d(5),
      firstResponseAt: d(4, 2),
      lastCustomerMessageAt: d(5),
      lastInternalUpdateAt: d(4, 2),
      repeatFollowUpCount: 0,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Energieausweis-Kopie wurde per Post versandt. Warten auf Eingangsbestätigung.',
      isOverdue: false,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be008.id, direction: 'INBOUND', from: 'fbauer@protonmail.com', to: 'cases@berlin-residenz.de', subject: 'Energieausweis Kopie anfordern', bodyText: 'Hallo, ich benötige für einen Bankkredit eine Kopie des Energieausweises meiner Wohnung. Können Sie mir das zusenden? F. Bauer', sentAt: d(5) },
      { caseId: be008.id, direction: 'OUTBOUND', from: 'cases@berlin-residenz.de', to: 'fbauer@protonmail.com', subject: 'Re: Energieausweis', bodyText: 'Sehr geehrte Frau Bauer, wir senden Ihnen den Energieausweis per Post zu (Einschreiben). Bitte bestätigen Sie den Erhalt. Sarah Vogt', sentAt: d(4, 2) },
    ],
  })

  const be009 = await prisma.case.create({
    data: {
      caseNumber: 'BE-0009',
      portcoId: berlin.id,
      teamLeadUserId: 3,
      assignedInternalOwnerName: 'Felix Wagner',
      customerName: 'Stefan Lange',
      customerEmail: 'stefan.lange@gmx.net',
      subject: 'Balkongeländer gerissen – akute Sturzgefahr',
      normalizedSubject: 'balkongeländer gerissen – akute sturzgefahr',
      category: 'Maintenance',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(20),
      firstResponseAt: null, // 20 days, ZERO reply. CRITICAL safety issue.
      lastCustomerMessageAt: h(2),
      lastInternalUpdateAt: null,
      repeatFollowUpCount: 6,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: 'Balkongeländer Sturzgefahr – 20 Tage, null Reaktion vom Team. SLA war 2h. Mieter hat Ordnungsamt und Anwalt eingeschaltet. Haftungsrisiko.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: be009.id, direction: 'INBOUND', from: 'stefan.lange@gmx.net', to: 'cases@berlin-residenz.de', subject: 'Balkongeländer gerissen – akute Sturzgefahr', bodyText: 'DRINGEND: Das Balkongeländer meiner Wohnung (4. OG) ist an zwei Stellen gerissen. Ich wage es nicht mehr auf den Balkon zu gehen. Das ist eine akute Sturzgefahr! Bitte sofort reagieren! S. Lange', sentAt: d(20) },
      { caseId: be009.id, direction: 'INBOUND', from: 'stefan.lange@gmx.net', to: 'cases@berlin-residenz.de', subject: 'Re: Balkongeländer – Woche 1 keine Antwort', bodyText: 'Eine Woche vergangen. Keinerlei Reaktion. Das ist grob fahrlässig. S. Lange', sentAt: d(13) },
      { caseId: be009.id, direction: 'INBOUND', from: 'stefan.lange@gmx.net', to: 'cases@berlin-residenz.de', subject: 'Re: Balkongeländer – Ordnungsamt informiert', bodyText: 'Ich habe das Ordnungsamt informiert. Außerdem liegt mein Anwalt auf Abruf. Ich gebe Ihnen noch bis Freitag. S. Lange', sentAt: d(8) },
      { caseId: be009.id, direction: 'INBOUND', from: 'stefan.lange@gmx.net', to: 'cases@berlin-residenz.de', subject: 'Re: Balkongeländer – Klage eingereicht', bodyText: 'Der Anwalt hat heute die Klage auf Mängelbeseitigung eingereicht. Außerdem wird Schadensersatz wegen Gefahrenvernachlässigung gefordert. 14 Tage, 4 Nachrichten, null Reaktion. S. Lange', sentAt: d(5) },
      { caseId: be009.id, direction: 'INBOUND', from: 'stefan.lange@gmx.net', to: 'cases@berlin-residenz.de', subject: 'Re: Balkongeländer – lokale Presse informiert', bodyText: 'Ich habe jetzt auch die lokale Presse kontaktiert. S. Lange', sentAt: d(2) },
      { caseId: be009.id, direction: 'INBOUND', from: 'stefan.lange@gmx.net', to: 'cases@berlin-residenz.de', subject: 'Re: Balkongeländer – heute 20 Tage', bodyText: '20 Tage. Immer noch kein einziges Wort von Ihnen. Das Geländer ist noch immer nicht repariert. S. Lange', sentAt: h(2) },
    ],
  })

  // ── MUNICH CASES (failing — critical, overdue, red flags everywhere) ───────

  const mu001 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0001',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Tobias Roth',
      customerName: 'Georg Becker',
      customerEmail: 'georg.becker@web.de',
      subject: 'Wasserrohrbruch im Keller – Überschwemmung',
      normalizedSubject: 'wasserrohrbruch im keller – überschwemmung',
      category: 'Maintenance',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(8),
      firstResponseAt: d(7, 18), // very late first response
      lastCustomerMessageAt: d(1),
      lastInternalUpdateAt: d(5),
      repeatFollowUpCount: 4,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: '🔴 Wasserrohrbruch Keller. Erstreaktion nach 30h (SLA 2h). 4 Nachfragen. Keine Lösung seit 5 Tagen.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu001.id, direction: 'INBOUND', from: 'georg.becker@web.de', to: 'cases@muenchen-gb.de', subject: 'Wasserrohrbruch im Keller – Überschwemmung', bodyText: 'NOTFALL! Im Keller ist ein Rohr gebrochen – Wasser läuft massiv aus und der Kellerraum steht unter Wasser. Bitte sofort einen Notdienst schicken! Georg Becker', sentAt: d(8) },
      { caseId: mu001.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'georg.becker@web.de', subject: 'Re: Wasserrohrbruch', bodyText: 'Wir haben Ihre Meldung erhalten. Techniker ist unterwegs. T. Roth', sentAt: d(7, 18) },
      { caseId: mu001.id, direction: 'INBOUND', from: 'georg.becker@web.de', to: 'cases@muenchen-gb.de', subject: 'Re: Wasserrohrbruch – kein Techniker erschienen!', bodyText: 'Der Techniker ist nicht gekommen! Der Keller schwimmt weiter. Was ist los? G. Becker', sentAt: d(6) },
      { caseId: mu001.id, direction: 'INBOUND', from: 'georg.becker@web.de', to: 'cases@muenchen-gb.de', subject: 'Re: Tag 5 – immer noch kein Handwerker', bodyText: 'Es ist jetzt Tag 5. Es gibt Schimmel und der Schaden wächst jeden Tag. Ich werde den Schaden in Rechnung stellen! G. Becker', sentAt: d(3) },
      { caseId: mu001.id, direction: 'INBOUND', from: 'georg.becker@web.de', to: 'cases@muenchen-gb.de', subject: 'Re: Wasserrohrbruch – rechtliche Schritte', bodyText: 'Ich habe einen Anwalt eingeschaltet. Der Schaden beläuft sich mittlerweile auf mehrere Tausend Euro. G. Becker', sentAt: d(1) },
    ],
  })

  const mu002 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0002',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Tobias Roth',
      customerName: 'Ingrid Hoffmann',
      customerEmail: 'ingrid.hoffmann@freenet.de',
      subject: 'Mietbetrag nicht verbucht – Mahnung erhalten',
      normalizedSubject: 'mietbetrag nicht verbucht – mahnung erhalten',
      category: 'Payment',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      escalationLevel: 2,
      openedAt: d(7),
      firstResponseAt: d(6, 4),
      lastCustomerMessageAt: d(2),
      lastInternalUpdateAt: d(4),
      repeatFollowUpCount: 2,
      slaFirstResponseHours: 8,
      slaResolutionHours: 72,
      aiSummary: 'Miete wurde überwiesen aber nicht verbucht. Mahnung ungerechtfertigt. Klärung seit 7 Tagen ausstehend.',
      isOverdue: true,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu002.id, direction: 'INBOUND', from: 'ingrid.hoffmann@freenet.de', to: 'cases@muenchen-gb.de', subject: 'Mietbetrag nicht verbucht', bodyText: 'Guten Tag, ich habe am 1. des Monats meine Miete überwiesen (Kontoauszug liegt vor), aber jetzt eine Mahnung erhalten. Das ist ein Fehler Ihrerseits. I. Hoffmann', sentAt: d(7) },
      { caseId: mu002.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'ingrid.hoffmann@freenet.de', subject: 'Re: Mietbetrag', bodyText: 'Wir prüfen das. Bitte senden Sie uns den Kontoauszug zu. T. Roth', sentAt: d(6, 4) },
      { caseId: mu002.id, direction: 'INBOUND', from: 'ingrid.hoffmann@freenet.de', to: 'cases@muenchen-gb.de', subject: 'Re: Kontoauszug gesendet – noch keine Rückmeldung', bodyText: 'Den Kontoauszug habe ich am Dienstag gesendet. Heute ist Montag. Ich bekomme nun Mahngebühren berechnet für Ihren Fehler. I. Hoffmann', sentAt: d(2) },
    ],
  })

  const mu003 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0003',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Petra Lang',
      customerName: 'Werner Schäfer',
      customerEmail: 'w.schaefer@t-online.de',
      subject: 'Gasgeruch im Treppenhaus – möglicherweise Gasleck',
      normalizedSubject: 'gasgeruch im treppenhaus – möglicherweise gasleck',
      category: 'Maintenance',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(6),
      firstResponseAt: null, // CRITICAL with ZERO response in 6 days
      lastCustomerMessageAt: h(6),
      lastInternalUpdateAt: null,
      repeatFollowUpCount: 3,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: '🔴 GASGERUCH! Gasleck möglicherweise. Null Reaktion intern in 6 Tagen. Gefährlich.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu003.id, direction: 'INBOUND', from: 'w.schaefer@t-online.de', to: 'cases@muenchen-gb.de', subject: 'Gasgeruch im Treppenhaus – möglicherweise Gasleck', bodyText: 'DRINGEND UND GEFÄHRLICH: Im 2. OG des Treppenhauses riecht es seit heute Morgen stark nach Gas. Ich habe bereits die Feuerwehr informiert. Sie sagten, der Vermieter muss sofort einen Klempner schicken. W. Schäfer', sentAt: d(6) },
      { caseId: mu003.id, direction: 'INBOUND', from: 'w.schaefer@t-online.de', to: 'cases@muenchen-gb.de', subject: 'Re: Gasgeruch – keine Reaktion nach 3 Tagen!', bodyText: 'Es ist jetzt der dritte Tag. Der Gasgeruch ist schwächer geworden, aber es ist noch da. Wir haben den Gashahn abgedreht. Noch immer keine Reaktion von Ihnen. Das ist grob fahrlässig! W. Schäfer', sentAt: d(3) },
      { caseId: mu003.id, direction: 'INBOUND', from: 'w.schaefer@t-online.de', to: 'cases@muenchen-gb.de', subject: 'Re: Gasgeruch – Erstattung Sachschaden angekündigt', bodyText: 'Wir hatten 3 Tage kein Gas und mussten in ein Hotel. Ich fordere Erstattung der Hotelkosten. W. Schäfer', sentAt: h(6) },
    ],
  })

  const mu004 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0004',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Petra Lang',
      customerName: 'Helga Fischer',
      customerEmail: 'helga.f@arcor.de',
      subject: 'Hausverwaltung reagiert nicht – seit Wochen keine Antwort',
      normalizedSubject: 'hausverwaltung reagiert nicht – seit wochen keine antwort',
      category: 'Complaint',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(10),
      firstResponseAt: d(9, 14),
      lastCustomerMessageAt: h(3),
      lastInternalUpdateAt: d(6),
      repeatFollowUpCount: 5,
      slaFirstResponseHours: 8,
      slaResolutionHours: 72,
      aiSummary: '🔴 Mieter beschwert sich über fehlende Kommunikation. 5 Nachfragen in 10 Tagen. Keine Lösung. Letztes Update vor 6 Tagen.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu004.id, direction: 'INBOUND', from: 'helga.f@arcor.de', to: 'cases@muenchen-gb.de', subject: 'Hausverwaltung reagiert nicht', bodyText: 'Ich versuche seit 3 Wochen, die Hausverwaltung zu erreichen. Niemand geht ans Telefon, E-Mails werden nicht beantwortet. Was ist da los? H. Fischer', sentAt: d(10) },
      { caseId: mu004.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'helga.f@arcor.de', subject: 'Re: Kontaktaufnahme', bodyText: 'Wir melden uns kurzfristig. P. Lang', sentAt: d(9, 14) },
      { caseId: mu004.id, direction: 'INBOUND', from: 'helga.f@arcor.de', to: 'cases@muenchen-gb.de', subject: 'Re: Noch immer keine Reaktion', bodyText: '„Wir melden uns kurzfristig" war vor 5 Tagen. Wo ist die Rückmeldung? H. Fischer', sentAt: d(5) },
      { caseId: mu004.id, direction: 'INBOUND', from: 'helga.f@arcor.de', to: 'cases@muenchen-gb.de', subject: 'Re: Nachfrage 3', bodyText: 'Meine ursprüngliche Anfrage bezog sich auf einen Wasserschaden, der nun seit fast 3 Wochen unbearbeitet ist. H. Fischer', sentAt: d(3) },
      { caseId: mu004.id, direction: 'INBOUND', from: 'helga.f@arcor.de', to: 'cases@muenchen-gb.de', subject: 'Re: Nachfrage 4', bodyText: 'Ich schreibe jetzt an das Amtsgericht. H. Fischer', sentAt: d(1) },
      { caseId: mu004.id, direction: 'INBOUND', from: 'helga.f@arcor.de', to: 'cases@muenchen-gb.de', subject: 'Re: LETZTE NACHRICHT', bodyText: 'Mein Anwalt hat Sie heute per Einschreiben kontaktiert. H. Fischer', sentAt: h(3) },
    ],
  })

  const mu005 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0005',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Tobias Roth',
      customerName: 'Dieter Krause',
      customerEmail: 'd.krause@posteo.de',
      subject: 'Aufzug defekt – seit 3 Wochen außer Betrieb',
      normalizedSubject: 'aufzug defekt – seit 3 wochen außer betrieb',
      category: 'Maintenance',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(9),
      firstResponseAt: d(8, 3),
      lastCustomerMessageAt: d(2),
      lastInternalUpdateAt: d(7),
      repeatFollowUpCount: 2,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: '🔴 Aufzug 9 Tage defekt. CRITICAL. Letztes internes Update vor 7 Tagen. Gebrechliche Mieter betroffen.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu005.id, direction: 'INBOUND', from: 'd.krause@posteo.de', to: 'cases@muenchen-gb.de', subject: 'Aufzug defekt', bodyText: 'Der Aufzug im Haus ist seit fast 3 Wochen außer Betrieb. Ich bin 78 Jahre alt und kann die 4 Treppen nicht mehr steigen. Das ist unzumutbar. D. Krause', sentAt: d(9) },
      { caseId: mu005.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'd.krause@posteo.de', subject: 'Re: Aufzug', bodyText: 'Sehr geehrter Herr Krause, wir haben den Auftrag an den Aufzugsdienst erteilt. T. Roth', sentAt: d(8, 3) },
      { caseId: mu005.id, direction: 'INBOUND', from: 'd.krause@posteo.de', to: 'cases@muenchen-gb.de', subject: 'Re: Aufzug noch immer kaputt', bodyText: 'Der Aufzugsdienst war nicht da. Ich musste heute den Arzt absagen, da ich nicht rauskomme. D. Krause', sentAt: d(2) },
    ],
  })

  const mu006 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0006',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Petra Lang',
      customerName: 'Maria Wagner',
      customerEmail: 'maria.wagner@yahoo.de',
      subject: 'Betriebskostenabrechnung 2023 fehlerhaft',
      normalizedSubject: 'betriebskostenabrechnung 2023 fehlerhaft',
      category: 'Billing',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      escalationLevel: 1,
      openedAt: d(6),
      firstResponseAt: d(5, 20),
      lastCustomerMessageAt: d(3),
      lastInternalUpdateAt: d(5, 20),
      repeatFollowUpCount: 1,
      slaFirstResponseHours: 24,
      slaResolutionHours: 120,
      aiSummary: 'Betriebskostenabrechnung 2023 mit fehlerhafter Umlageposition. Kundin hat Belege angefordert.',
      isOverdue: true,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu006.id, direction: 'INBOUND', from: 'maria.wagner@yahoo.de', to: 'cases@muenchen-gb.de', subject: 'Betriebskostenabrechnung fehlerhaft', bodyText: 'Guten Tag, in meiner Betriebskostenabrechnung 2023 sind Posten aufgeführt, die mir nicht gehören. Bitte senden Sie mir die Belege. M. Wagner', sentAt: d(6) },
      { caseId: mu006.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'maria.wagner@yahoo.de', subject: 'Re: Betriebskosten', bodyText: 'Sehr geehrte Frau Wagner, wir prüfen das und senden Ihnen die Belege diese Woche zu. P. Lang', sentAt: d(5, 20) },
      { caseId: mu006.id, direction: 'INBOUND', from: 'maria.wagner@yahoo.de', to: 'cases@muenchen-gb.de', subject: 'Re: Betriebskosten – noch keine Belege', bodyText: 'Die Belege habe ich noch nicht erhalten. M. Wagner', sentAt: d(3) },
    ],
  })

  const mu007 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0007',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Tobias Roth',
      customerName: 'Friedrich Zimmermann',
      customerEmail: 'f.zimmermann@gmail.com',
      subject: 'Kein Warmwasser seit 12 Tagen – unerträglich',
      normalizedSubject: 'kein warmwasser seit 12 tagen – unerträglich',
      category: 'Heating',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      escalationLevel: 3,
      openedAt: d(12),
      firstResponseAt: d(11, 10),
      lastCustomerMessageAt: h(4),
      lastInternalUpdateAt: d(7),
      repeatFollowUpCount: 6,
      slaFirstResponseHours: 2,
      slaResolutionHours: 24,
      aiSummary: '🔴 Kein Warmwasser seit 12 Tagen. KRITISCH. Erstantwort nach 14h, danach kein internes Update seit 7 Tagen. 6 Nachfragen.',
      isOverdue: true,
      needsHQAttention: true,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Kein Warmwasser seit 12 Tagen', bodyText: 'Es gibt seit 12 Tagen kein Warmwasser in meiner Wohnung. Ich muss kalt duschen. Das ist ein Zustand, der sofort behoben werden muss. F. Zimmermann', sentAt: d(12) },
      { caseId: mu007.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'f.zimmermann@gmail.com', subject: 'Re: Warmwasser', bodyText: 'Wir kümmern uns darum. T. Roth', sentAt: d(11, 10) },
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Re: Warmwasser – Nachfrage 1', bodyText: 'Immer noch kein Warmwasser. Was wurde unternommen? F. Zimmermann', sentAt: d(9) },
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Re: Warmwasser – Nachfrage 2', bodyText: 'Techniker war kurz hier, hat aber nichts gefixt. F. Zimmermann', sentAt: d(7) },
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Re: Warmwasser – Nachfrage 3', bodyText: 'Jetzt 10 Tage. Ich habe Miete gemindert um 15%. F. Zimmermann', sentAt: d(5) },
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Re: Warmwasser – Nachfrage 4', bodyText: 'Tag 11. Ich bin erschöpft. F. Zimmermann', sentAt: d(2) },
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Re: Warmwasser – Nachfrage 5', bodyText: 'Anwalt eingeschaltet. F. Zimmermann', sentAt: d(1) },
      { caseId: mu007.id, direction: 'INBOUND', from: 'f.zimmermann@gmail.com', to: 'cases@muenchen-gb.de', subject: 'Re: Warmwasser – letzte Nachricht', bodyText: '12 Tage. Anwalt klagt nächste Woche. F. Zimmermann', sentAt: h(4) },
    ],
  })

  const mu008 = await prisma.case.create({
    data: {
      caseNumber: 'MU-0008',
      portcoId: munich.id,
      teamLeadUserId: null,
      assignedInternalOwnerName: 'Petra Lang',
      customerName: 'Rosa Klein',
      customerEmail: 'rosa.klein@icloud.com',
      subject: 'Mahnung unberechtigt – Miete wurde pünktlich überwiesen',
      normalizedSubject: 'mahnung unberechtigt – miete wurde pünktlich überwiesen',
      category: 'Payment',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      escalationLevel: 2,
      openedAt: d(5),
      firstResponseAt: d(4, 12),
      lastCustomerMessageAt: d(1),
      lastInternalUpdateAt: d(2),
      repeatFollowUpCount: 1,
      slaFirstResponseHours: 8,
      slaResolutionHours: 72,
      aiSummary: 'Ungerechtfertigte Mahnung erhalten trotz fristgerechter Zahlung. Klärung läuft langsam.',
      isOverdue: true,
      needsHQAttention: false,
    },
  })
  await prisma.message.createMany({
    data: [
      { caseId: mu008.id, direction: 'INBOUND', from: 'rosa.klein@icloud.com', to: 'cases@muenchen-gb.de', subject: 'Mahnung unberechtigt', bodyText: 'Guten Tag, ich habe eine Mahnung über ausstehende Miete erhalten. Das ist falsch – ich habe am 28. überwiesen. Anbei der Kontoauszug. R. Klein', sentAt: d(5) },
      { caseId: mu008.id, direction: 'OUTBOUND', from: 'cases@muenchen-gb.de', to: 'rosa.klein@icloud.com', subject: 'Re: Mahnung', bodyText: 'Sehr geehrte Frau Klein, wir prüfen das. P. Lang', sentAt: d(4, 12) },
      { caseId: mu008.id, direction: 'INBOUND', from: 'rosa.klein@icloud.com', to: 'cases@muenchen-gb.de', subject: 'Re: Mahnung – Nachfrage', bodyText: 'Ich bekomme nun Mahngebühren berechnet wegen Ihres Fehlers. R. Klein', sentAt: d(1) },
    ],
  })

  // ── Run scheduler to compute fresh escalation/metrics ────────────────────
  console.log('Running scheduler to compute initial metrics...')
  const now = new Date()

  // Collect all cases and update escalation
  const allCases = await prisma.case.findMany({
    where: { status: { not: 'RESOLVED' } },
  })

  for (const c of allCases) {
    const { escalationLevel, isOverdue, needsHQAttention } =
      calculateEscalation(c, now)
    await prisma.case.update({
      where: { id: c.id },
      data: { escalationLevel, isOverdue, needsHQAttention },
    })
  }

  // Portco metrics
  for (const portco of [hamburg, berlin, munich]) {
    const portcoCases = await prisma.case.findMany({ where: { portcoId: portco.id } })
    const metrics = calculatePortcoMetrics(portcoCases)
    await prisma.portcoMetricSnapshot.create({
      data: {
        portcoId: portco.id,
        capturedAt: now,
        ...metrics,
      },
    })
  }

  await prisma.demoSettings.update({
    where: { id: 1 },
    data: { lastSchedulerRun: now },
  })

  console.log('✅ Seed complete.')
  console.log('   Hamburg: 6 cases (mostly healthy)')
  console.log('   Berlin:  9 cases (medium issues)')
  console.log('   Munich:  8 cases (critical failures)')

  const msgCount = await prisma.message.count()
  const caseCount = await prisma.case.count()
  console.log(`   Total: ${caseCount} cases, ${msgCount} messages`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
