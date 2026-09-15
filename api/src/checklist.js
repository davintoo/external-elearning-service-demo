/**
 * The simulator's own content. In a real external service this comes from the vendor's
 * database; here it is a constant, because the point of the demo is the LMS contract and
 * not the authoring side. Weights differ per item so the mark is visibly weighted rather
 * than a plain count.
 */
export const CHECKLIST = {
    title: 'Pump start-up procedure',
    items: [
        {id: 'c1', group: 'Preparation', text: 'PPE checked', weight: 1},
        {id: 'c2', group: 'Preparation', text: 'Work area cordoned off', weight: 1},
        {id: 'c3', group: 'Preparation', text: 'Permit to work verified', weight: 2},
        {id: 'c4', group: 'Start-up', text: 'Suction valve opened before discharge', weight: 3},
        {id: 'c5', group: 'Start-up', text: 'Bearing temperature logged', weight: 1},
        {id: 'c6', group: 'Start-up', text: 'Vibration within limits', weight: 2},
        {id: 'c7', group: 'Shutdown', text: 'Residual pressure released', weight: 2},
        {id: 'c8', group: 'Shutdown', text: 'Area handed back and signed off', weight: 1}
    ]
};
