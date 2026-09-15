const VALUES = ['yes', 'no', 'na'];

/**
 * Weighted share of met criteria. An item marked "na" did not apply to this run, so it is
 * excluded from the denominator as well as the numerator - counting it as unmet would let
 * a correctly-skipped step fail the learner.
 */
export function computeMark(items, answers) {
    let assessed = 0;
    let met = 0;

    for (const item of items) {
        if (answers[item.id] === 'na') {
            continue;
        }
        assessed += item.weight;
        if (answers[item.id] === 'yes') {
            met += item.weight;
        }
    }

    // Nothing was assessed: report 0 rather than dividing by zero. The LMS still applies
    // its threshold to it, so the learner is not silently passed.
    return assessed === 0 ? 0 : Math.round((met * 100) / assessed);
}

function assertComplete(checklist, answers) {
    const missing = checklist.items
        .filter(item => !VALUES.includes(answers[item.id]))
        .map(item => item.id);

    if (missing.length) {
        const error = new Error(`Unanswered checklist items: ${missing.join(', ')}`);
        error.code = 'incomplete_checklist';
        throw error;
    }
}

/**
 * Maps the browser's answers onto #/$defs/ResultRequest.
 *
 * status is always "completed", never passed/failed: the LMS re-evaluates a terminal
 * status against the task threshold, and a vendor that decides pass/fail itself is
 * duplicating a rule it does not own.
 */
export function buildResultPayload({sessionId, checklist, answers, comments = {}}) {
    assertComplete(checklist, answers);

    const items = checklist.items.map((item, index) => {
        const value = answers[item.id];
        const entry = {
            id: item.id,
            order: index + 1,
            group: item.group,
            text: item.text,
            value,
            weight: item.weight
        };

        // Per-item score is informational - the contract takes the session mark from the
        // top-level field and never sums these. An "na" item scores nothing at all.
        if (value !== 'na') {
            entry.score = value === 'yes' ? item.weight : 0;
        }

        const comment = (comments[item.id] || '').trim();
        if (comment) {
            entry.comment = comment;
        }

        return entry;
    });

    return {
        session_id: sessionId,
        status: 'completed',
        mark: computeMark(checklist.items, answers),
        data: {
            format: 'checklist',
            title: checklist.title,
            items
        }
    };
}
