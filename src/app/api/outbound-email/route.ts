import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeSubject } from '@/lib/subject-normalization'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { from, to, subject, bodyText, sentAt, externalThreadKey, externalMessageId } = body

  if (!from || !to || !subject || !bodyText) {
    return NextResponse.json(
      { error: 'Missing required fields: from, to, subject, bodyText' },
      { status: 400 }
    )
  }

  const sentAtDate = sentAt ? new Date(sentAt) : new Date()

  // Resolve portco from the outbound sender alias
  const portco = await prisma.portco.findFirst({ where: { inboundAlias: from } })
  if (!portco) {
    return NextResponse.json(
      { error: `Unknown portco alias: ${from}` },
      { status: 404 }
    )
  }

  // Match existing case
  let existingCase = null

  if (externalThreadKey) {
    existingCase = await prisma.case.findFirst({
      where: {
        portcoId: portco.id,
        messages: { some: { externalThreadKey } },
        status: { not: 'RESOLVED' },
      },
    })
  }

  if (!existingCase) {
    const normalizedSubj = normalizeSubject(subject)
    const thirtyDaysAgo = new Date(sentAtDate.getTime() - 30 * 24 * 3_600_000)
    existingCase = await prisma.case.findFirst({
      where: {
        portcoId: portco.id,
        customerEmail: to,
        normalizedSubject: normalizedSubj,
        status: { not: 'RESOLVED' },
        openedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { openedAt: 'desc' },
    })
  }

  if (!existingCase) {
    return NextResponse.json(
      { error: 'No matching open case found for this outbound email' },
      { status: 404 }
    )
  }

  // Add outbound message
  await prisma.message.create({
    data: {
      caseId: existingCase.id,
      direction: 'OUTBOUND',
      from,
      to,
      subject,
      bodyText,
      sentAt: sentAtDate,
      externalThreadKey: externalThreadKey ?? null,
      externalMessageId: externalMessageId ?? null,
    },
  })

  // Update case
  const updateData: Record<string, unknown> = {
    lastInternalUpdateAt: sentAtDate,
    status: 'WAITING_ON_CUSTOMER',
  }

  if (!existingCase.firstResponseAt) {
    updateData.firstResponseAt = sentAtDate
  }

  await prisma.case.update({
    where: { id: existingCase.id },
    data: updateData,
  })

  return NextResponse.json({
    action: 'updated',
    caseId: existingCase.id,
    caseNumber: existingCase.caseNumber,
  })
}
