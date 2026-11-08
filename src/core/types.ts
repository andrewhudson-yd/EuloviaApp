/** Shapes returned by the server's /api/v1/companion endpoints. */

export interface Profile {
    device: { id: string; name: string };
    user: { name: string };
    practice: { name: string; timezone: string };
    companion: {
        enabled: boolean;
        speaker_recognition: boolean;
        part_minutes: number;
        chunk_bytes: number;
        consent_script_version: number;
    };
}

export interface RecordingSummary {
    id: string;
    meeting_id: string;
    status: string;
    status_label: string;
    started_at: string;
    duration_ms: number | null;
    expected_parts: number | null;
    uploaded: Array<{ kind: FileKind; position: number }>;
}

export interface MeetingItem {
    id: string;
    funeral: { id: string; name: string | null };
    starts_at: string;
    local_date: string;
    local_time: string | null;
    location: string | null;
    attendees: string | null;
    held: boolean;
    family: Array<{ name: string; relationship: string | null }>;
    recordings: RecordingSummary[];
}

export interface Attendee {
    name: string;
    relationship: string | null;
    agreed: boolean;
}

export type FileKind = 'part' | 'intro';
