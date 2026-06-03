import type { ResumeRecord } from './types';

export interface CheckResult {
  id: string;
  status: 'pass' | 'warning' | 'blocked';
  severity: 'info' | 'medium' | 'high';
  field: string;
  message: string;
  suggestion: string;
}

export const runAtsChecks = (resume: ResumeRecord): CheckResult[] => {
  const checks: CheckResult[] = [];
  const profile = resume.content.profile;

  if (!profile.fullName.trim()) {
    checks.push(result('missing-name', 'blocked', 'high', 'content.profile.fullName', 'Name is required for every template.', 'Add your full name in the profile section.'));
  }
  if (!profile.email.trim()) {
    checks.push(result('missing-email', 'warning', 'medium', 'content.profile.email', 'Email is missing from the contact block.', 'Add a readable email address.'));
  }
  if (resume.content.summary.length > 700) {
    checks.push(result('long-summary', 'warning', 'medium', 'content.summary', 'Summary is unusually long for ATS scanning.', 'Keep the summary to three or four focused lines.'));
  }
  if (profile.links.some((link) => !/^https?:\/\//i.test(link) && !/^[\w.-]+\.[a-z]{2,}/i.test(link))) {
    checks.push(result('unclear-link', 'warning', 'medium', 'content.profile.links', 'One or more links may not be readable when exported.', 'Use a full URL or a recognizable domain.'));
  }

  if (checks.length === 0) {
    checks.push(result('baseline-pass', 'pass', 'info', 'resume', 'No deterministic ATS blockers found.', 'Compile the PDF and review extracted text before sending.'));
  }

  return checks;
};

const result = (
  id: string,
  status: CheckResult['status'],
  severity: CheckResult['severity'],
  field: string,
  message: string,
  suggestion: string
): CheckResult => ({ id, status, severity, field, message, suggestion });
