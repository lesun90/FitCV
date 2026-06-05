import { createId } from './ids';
import type { FittedCvRecord, FittedCvRiskFlag, ResumeContent, ResumeRecord } from './types';

type ProposedChangeInput = {
  targetField: string;
  before: string;
  after: string;
  rationale: string;
  jdEvidence?: string;
  riskFlags?: FittedCvRiskFlag[];
};

export const createFittedCvDraft = (input: {
  baseResume: ResumeRecord;
  jobDescriptionId: string;
  title: string;
  changes: ProposedChangeInput[];
  createdAt?: string;
}): FittedCvRecord => {
  const timestamp = input.createdAt ?? new Date().toISOString();
  return {
    id: createId('fit'),
    schemaVersion: 1,
    title: input.title,
    sourceResumeId: input.baseResume.id,
    sourceVersion: input.baseResume.version,
    activeTemplateId: input.baseResume.activeTemplateId,
    templateLayouts: structuredClone(input.baseResume.templateLayouts),
    templateSettings: structuredClone(input.baseResume.templateSettings),
    content: structuredClone(input.baseResume.content),
    jobDescriptionId: input.jobDescriptionId,
    proposedChanges: input.changes.map((change) => ({
      id: createId('change'),
      sourceMode: 'ai-fit-to-jd',
      targetField: change.targetField,
      before: change.before,
      after: change.after,
      rationale: change.rationale,
      jdEvidence: change.jdEvidence,
      riskFlags: change.riskFlags ?? [],
      status: 'pending',
      createdAt: timestamp,
    })),
    acceptedChangeIds: [],
    rejectedChangeIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  };
};

export const fittedCvHasUnreviewedChanges = (fittedCv: FittedCvRecord): boolean =>
  fittedCv.proposedChanges.some((change) => change.status === 'pending');

export const applyFittedCvChange = (
  fittedCv: FittedCvRecord,
  changeId: string,
  decision: 'accept' | 'reject',
  reviewedAt = new Date().toISOString()
): FittedCvRecord => {
  const change = fittedCv.proposedChanges.find((item) => item.id === changeId);
  if (!change) return fittedCv;
  const next = touchFittedCv(fittedCv, reviewedAt);
  next.proposedChanges = next.proposedChanges.map((item) => item.id === changeId
    ? { ...item, status: decision === 'accept' ? 'accepted' : 'rejected', reviewedAt }
    : item);
  if (decision === 'accept') {
    next.content = setContentField(next.content, change.targetField, change.after);
    next.acceptedChangeIds = unique([...next.acceptedChangeIds, changeId]);
    next.rejectedChangeIds = next.rejectedChangeIds.filter((id) => id !== changeId);
  } else {
    next.rejectedChangeIds = unique([...next.rejectedChangeIds, changeId]);
    next.acceptedChangeIds = next.acceptedChangeIds.filter((id) => id !== changeId);
  }
  return next;
};

export const markFittedCvChangeReviewed = (
  fittedCv: FittedCvRecord,
  changeId: string,
  reviewedAt = new Date().toISOString()
): FittedCvRecord => ({
  ...touchFittedCv(fittedCv, reviewedAt),
  proposedChanges: fittedCv.proposedChanges.map((item) => item.id === changeId
    ? { ...item, status: 'manual', reviewedAt }
    : item),
});

const touchFittedCv = (fittedCv: FittedCvRecord, timestamp: string): FittedCvRecord => ({
  ...structuredClone(fittedCv),
  updatedAt: timestamp,
  version: fittedCv.version + 1,
});

const unique = (values: string[]) => Array.from(new Set(values));

const setContentField = (content: ResumeContent, fieldPath: string, value: string): ResumeContent => {
  const next = structuredClone(content);
  if (fieldPath === 'content.summary') {
    next.summary = value;
    return next;
  }
  if (fieldPath.startsWith('content.profile.')) {
    const key = fieldPath.slice('content.profile.'.length) as keyof ResumeContent['profile'];
    if (key in next.profile && typeof next.profile[key] === 'string') {
      (next.profile as unknown as Record<string, unknown>)[key] = value;
    }
    return next;
  }
  const flexMatch = fieldPath.match(/^content\.flexSections\.([^.\s]+)\.entries\.([^.\s]+)\.fields\.([^.\s]+)$/);
  if (!flexMatch) return next;
  const [, sectionId, entryId, fieldKey] = flexMatch;
  next.flexSections = next.flexSections.map((section) => {
    if (section.id !== sectionId) return section;
    return {
      ...section,
      items: section.items.map((item) => updateFlexItem(item, entryId, fieldKey, value)),
    };
  });
  return next;
};

type FlexItem = ResumeContent['flexSections'][number]['items'][number];

const updateFlexItem = (item: FlexItem, entryId: string, fieldKey: string, value: string): FlexItem => {
  if ('kind' in item && item.kind === 'subsection-heading') return item;
  if ('environment' in item) {
    return { ...item, items: item.items.map((subItem) => updateFlexItem(subItem, entryId, fieldKey, value) as typeof subItem) };
  }
  if (!('fields' in item)) return item;
  if (item.id !== entryId) return item;
  return { ...item, fields: { ...item.fields, [fieldKey]: value } };
};
