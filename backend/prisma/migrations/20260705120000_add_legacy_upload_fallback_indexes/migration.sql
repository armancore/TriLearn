-- Index the legacy file-reference columns scanned by the upload-serving fallback
-- chain in upload.service.js so misses become index lookups instead of full-table
-- sequential scans (DoS-amplification hardening).
CREATE INDEX "User_avatar_idx" ON "User"("avatar");
CREATE INDEX "Assignment_questionPdfUrl_idx" ON "Assignment"("questionPdfUrl");
CREATE INDEX "Submission_fileUrl_idx" ON "Submission"("fileUrl");
CREATE INDEX "Task_questionPdfUrl_idx" ON "Task"("questionPdfUrl");
CREATE INDEX "TaskSubmission_fileUrl_idx" ON "TaskSubmission"("fileUrl");
CREATE INDEX "StudyMaterial_fileUrl_idx" ON "StudyMaterial"("fileUrl");
