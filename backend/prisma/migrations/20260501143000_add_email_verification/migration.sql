ALTER TABLE "User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailVerificationToken" TEXT,
ADD COLUMN "emailVerificationExpiry" TIMESTAMP(3);

CREATE INDEX "User_emailVerificationToken_idx" ON "User"("emailVerificationToken");
