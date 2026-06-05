import { describe, expect, it } from 'vitest';
import { sampleResume } from './resume';
import {
  applyFittedCvChange,
  createFittedCvDraft,
  fittedCvHasUnreviewedChanges,
  markFittedCvChangeReviewed,
} from './fittedCv';

describe('fitted CV lifecycle', () => {
  it('creates an independent fitted CV snapshot with review-gated proposed changes', () => {
    const base = sampleResume();
    const fitted = createFittedCvDraft({
      baseResume: base,
      jobDescriptionId: 'jd-1',
      title: 'Ada - Frontend Platform',
      changes: [{
        targetField: 'content.summary',
        before: base.content.summary,
        after: 'Frontend platform leader who turns ambiguous systems into durable browser tools.',
        rationale: 'Aligns the summary to the JD role focus.',
        jdEvidence: 'Frontend platform engineer',
        riskFlags: [],
      }],
      createdAt: '2026-06-04T12:00:00.000Z',
    });

    expect(fitted.sourceResumeId).toBe(base.id);
    expect(fitted.sourceVersion).toBe(base.version);
    expect(fitted.content).toEqual(base.content);
    expect(fitted.content).not.toBe(base.content);
    expect(fitted.proposedChanges[0]).toMatchObject({
      targetField: 'content.summary',
      status: 'pending',
      sourceMode: 'ai-fit-to-jd',
    });
    expect(fittedCvHasUnreviewedChanges(fitted)).toBe(true);
  });

  it('applies accepted changes to the fitted snapshot without changing the source resume', () => {
    const base = sampleResume();
    const fitted = createFittedCvDraft({
      baseResume: base,
      jobDescriptionId: 'jd-1',
      title: 'Ada - Frontend Platform',
      changes: [{
        targetField: 'content.summary',
        before: base.content.summary,
        after: 'Frontend platform leader.',
        rationale: 'Concise JD fit.',
        riskFlags: ['verify-scope'],
      }],
      createdAt: '2026-06-04T12:00:00.000Z',
    });

    const reviewed = applyFittedCvChange(fitted, fitted.proposedChanges[0].id, 'accept', '2026-06-04T12:30:00.000Z');

    expect(reviewed.content.summary).toBe('Frontend platform leader.');
    expect(base.content.summary).not.toBe('Frontend platform leader.');
    expect(reviewed.acceptedChangeIds).toEqual([fitted.proposedChanges[0].id]);
    expect(reviewed.proposedChanges[0].status).toBe('accepted');
    expect(fittedCvHasUnreviewedChanges(reviewed)).toBe(false);
  });

  it('counts rejected and manually reviewed changes as complete for export gating', () => {
    const base = sampleResume();
    const fitted = createFittedCvDraft({
      baseResume: base,
      jobDescriptionId: 'jd-1',
      title: 'Ada - Frontend Platform',
      changes: [
        { targetField: 'content.summary', before: base.content.summary, after: 'A', rationale: 'A', riskFlags: [] },
        { targetField: 'content.profile.headline', before: base.content.profile.headline, after: 'B', rationale: 'B', riskFlags: [] },
      ],
      createdAt: '2026-06-04T12:00:00.000Z',
    });

    const rejected = applyFittedCvChange(fitted, fitted.proposedChanges[0].id, 'reject', '2026-06-04T12:30:00.000Z');
    const manual = markFittedCvChangeReviewed(rejected, fitted.proposedChanges[1].id, '2026-06-04T12:31:00.000Z');

    expect(manual.rejectedChangeIds).toEqual([fitted.proposedChanges[0].id]);
    expect(manual.proposedChanges.map((change) => change.status)).toEqual(['rejected', 'manual']);
    expect(fittedCvHasUnreviewedChanges(manual)).toBe(false);
  });
});
