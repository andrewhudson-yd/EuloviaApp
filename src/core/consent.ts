import type { Attendee } from './types';

export const CONSENT_SCRIPT_VERSION = 1;
export const SHORT_CONSENT_SCRIPT_VERSION = 2;

/** Read aloud before recording. Kept short and plain on purpose. */
export function consentScript(practiceName: string): string {
    return [
        `Before we start: I'd like to record our conversation so I can listen to you properly instead of writing notes.`,
        `The recording is kept privately by ${practiceName}, turned into text to help me write the ceremony, and the audio is deleted afterwards.`,
        `Nothing goes into the ceremony without me checking it, and you'll see the wording before the day.`,
        `Is everyone happy for me to record? You can ask me to stop at any time.`,
    ].join('\n\n');
}

/** Problems that stop recording from starting, or [] when everyone has agreed. */
export function consentProblems(attendees: Attendee[], confirmed: boolean): string[] {
    const named = attendees.filter((a) => a.name.trim() !== '');
    const problems: string[] = [];
    if (named.length === 0) problems.push('Add the people who are here.');
    const notAgreed = named.filter((a) => !a.agreed).map((a) => a.name.trim());
    if (notAgreed.length) problems.push(`Not everyone has agreed: ${notAgreed.join(', ')}. Don't record — take notes instead.`);
    if (!confirmed) problems.push('Confirm that everyone present agreed.');

    return problems;
}
