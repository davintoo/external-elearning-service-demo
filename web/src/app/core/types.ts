export type ChecklistValue = 'yes' | 'no' | 'na';

export interface ChecklistItem {
  id: string;
  group: string;
  text: string;
  weight: number;
}

export interface Checklist {
  title: string;
  items: ChecklistItem[];
}

/** #/$defs/SessionContextResponse */
export interface SessionContext {
  session_id: string;
  user: {id: number; name: string; login: string; lang: string};
  resource_id: number;
  task_id: number;
  attempt_number: number;
  attempts_limit: number | null;
  threshold: number;
  status: string;
  mark: number | null;
  started_at: string;
  expires_at: string | null;
}

/** #/$defs/ResultResponse */
export interface ResultResponse {
  data: {
    session_id: string;
    attempt_number: number;
    status: string;
    mark: number | null;
    threshold: number;
    task_status: string;
    task_mark: number | null;
    updated_at: string;
  };
}

/** What POST /api/session/:id/result answers with: both directions, verbatim. */
export interface SubmitResponse {
  sent: unknown;
  received: ResultResponse;
}

export interface ApiError {
  status: number;
  key: string;
  message: string;
  fields?: Record<string, string>;
}

export interface StoredSession {
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  status: 'in-progress' | 'finished';
  answers: Record<string, ChecklistValue>;
  comments: Record<string, string>;
  lastResult: ResultResponse | null;
}
