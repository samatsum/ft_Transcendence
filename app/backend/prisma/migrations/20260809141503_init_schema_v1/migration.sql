-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayNameLower" TEXT NOT NULL,
    "avatarPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requesterId" INTEGER NOT NULL,
    "addresseeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "winnerTeam" INTEGER,
    "winnerUserId" INTEGER,
    "endReason" TEXT,
    CONSTRAINT "Match_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchId" INTEGER NOT NULL,
    "userId" INTEGER,
    "isAi" BOOLEAN NOT NULL,
    "team" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "pointsScored" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL,
    CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "User_displayNameLower_key" ON "User"("displayNameLower");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_idx" ON "Friendship"("addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "Match_winnerUserId_idx" ON "Match"("winnerUserId");

-- CreateIndex
CREATE INDEX "MatchPlayer_matchId_idx" ON "MatchPlayer"("matchId");

-- CreateIndex
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_slot_key" ON "MatchPlayer"("matchId", "slot");
