-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "portcoId" INTEGER,
    CONSTRAINT "users_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "portcos" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portcos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "casePrefix" TEXT NOT NULL DEFAULT 'XX',
    "teamLeadUserId" INTEGER,
    "inboundAlias" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- CreateTable
CREATE TABLE "cases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "caseNumber" TEXT NOT NULL,
    "portcoId" INTEGER NOT NULL,
    "teamLeadUserId" INTEGER,
    "assignedInternalOwnerName" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "normalizedSubject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "openedAt" DATETIME NOT NULL,
    "firstResponseAt" DATETIME,
    "lastCustomerMessageAt" DATETIME NOT NULL,
    "lastInternalUpdateAt" DATETIME,
    "resolvedAt" DATETIME,
    "repeatFollowUpCount" INTEGER NOT NULL DEFAULT 0,
    "slaFirstResponseHours" INTEGER NOT NULL,
    "slaResolutionHours" INTEGER NOT NULL,
    "nextAction" TEXT,
    "aiSummary" TEXT,
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "needsHQAttention" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "cases_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "portcos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "caseId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL,
    "externalThreadKey" TEXT,
    "externalMessageId" TEXT,
    CONSTRAINT "messages_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portco_metric_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "portcoId" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openCaseCount" INTEGER NOT NULL,
    "criticalOpenCount" INTEGER NOT NULL,
    "overdueCount" INTEGER NOT NULL,
    "redFlagCount" INTEGER NOT NULL,
    "avgFirstResponseHours" REAL,
    "repeatFollowUpRate" REAL NOT NULL,
    "healthScore" REAL NOT NULL,
    CONSTRAINT "portco_metric_snapshots_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "portcos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "demo_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "clockOffset" INTEGER NOT NULL DEFAULT 0,
    "lastSchedulerRun" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "portcos_slug_key" ON "portcos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "portcos_inboundAlias_key" ON "portcos"("inboundAlias");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");
