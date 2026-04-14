import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { classifyEmail, generateSummary } from '@/lib/classification'
import { normalizeSubject } from '@/lib/subject-normalization'
import { getSlaHours } from '@/lib/sla'
import { findMatchingCase, extractName, generateCaseNumber } from '@/lib/case-matching'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    from,
    to,
    subject,
    bodyText,
    sentAt,
    externalThreadKey,
    externalMessageId,
  } = body

  if (!from || !to || !subject || !bodyText) {
    return NextResponse.json(
      { error: 'Missing required fields: from, to, subject, bodyText' },
      { status: 400 }
    )
  }

  // Resolve portco from the inbound alias
  const portco = await prisma.portco.findFirst({ where: { inboundAlias: to } })
  if (!portco) {
    return NextResponse.json(
      { error: `Unknown portco alias: ${to}` },
      { status: 404 }
    )
  }

  const sentAtDate = sentAt ? new Date(sentAt) : new Date()

  // Try to match an existing open case
  const existingCase = await findMatchingCase({
    portcoId: portco.id,
    customerEmail: from,
    subject,
    sentAt: sentAtDate,
    externalThreadKey,
  })

  if (existingCase) {
    // Add inbound message to existing case
    await prisma.message.create({
      data: {
        caseId: existingCase.id,
        direction: 'INBOUND',
        from,
        to,
        subject,
        bodyText,
        sentAt: sentAtDate,
        externalThreadKey: externalThreadKey ?? null,
        externalMessageId: externalMessageId ?? null,
      },
    })

    const newStatus =
      existingCase.firstResponseAt != null ? 'IN_PROGRESS' : 'AWAITING_FIRST_RESPONSE'

    await prisma.case.update({
      where: { id: existingCase.id },
      data: {
        lastCustomerMessageAt: sentAtDate,
        repeatFollowUpCount: { increment: 1 },
        status: newStatus,
      },
    })

    return NextResponse.json({
      action: 'updated',
      caseId: existingCase.id,
      caseNumber: existingCase.caseNumber,
    })
  }

  // Create new case
  const { category, priority } = classifyEmail(subject, bodyText)
  const { slaFirstResponseHours, slaResolutionHours } = getSlaHours(priority)
  const aiSummary = generateSummary(subject, bodyText)
  const normalizedSubj = normalizeSubject(subject)
  const caseNumber = await generateCaseNumber(portco.id, portco.casePrefix)
  const customerName = extractName(from)

  const newCase = await prisma.case.create({
    data: {
      caseNumber,
      portcoId: portco.id,
      teamLeadUserId: portco.teamLeadUserId ?? null,
      customerName,
      customerEmail: from,
      subject,
      normalizedSubject: normalizedSubj,
      category,
      priority,
      status: 'AWAITING_FIRST_RESPONSE',
      openedAt: sentAtDate,
      lastCustomerMessageAt: sentAtDate,
      slaFirstResponseHours,
      slaResolutionHours,
      aiSummary,
      escalationLevel: 0,
      isOverdue: false,
      needsHQAttention: false,
      repeatFollowUpCount: 0,
    },
  })

  await prisma.message.create({
    data: {
      caseId: newCase.id,
      direction: 'INBOUND',
      from,
      to,
      subject,
      bodyText,
      sentAt: sentAtDate,
      externalThreadKey: externalThreadKey ?? null,
      externalMessageId: externalMessageId ?? null,
    },
  })

  return NextResponse.json(
    {
      action: 'created',
      caseId: newCase.id,
      caseNumber: newCase.caseNumber,
    },
    { status: 201 }
  )
}
