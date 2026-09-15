import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {Injectable, inject} from '@angular/core';
import {firstValueFrom} from 'rxjs';

import {ApiError, Checklist, ChecklistValue, SessionContext, SubmitResponse} from './types';

/**
 * The browser's only counterpart. It never sees the LMS: the API token lives in the demo
 * server, so every LMS call is made there and this speaks in answers, not payloads.
 */
@Injectable({providedIn: 'root'})
export class DemoApi {
  private readonly http = inject(HttpClient);

  config(): Promise<{mode: 'mock' | 'live'}> {
    return this.call(this.http.get<{mode: 'mock' | 'live'}>('/api/config'));
  }

  checklist(): Promise<Checklist> {
    return this.call(this.http.get<Checklist>('/api/checklist'));
  }

  session(sessionId: string, force: string | null): Promise<SessionContext> {
    return this.call(
      this.http.get<{data: SessionContext}>(`/api/session/${sessionId}${query(force)}`)
    ).then(response => response.data);
  }

  submit(
    sessionId: string,
    answers: Record<string, ChecklistValue>,
    comments: Record<string, string>,
    force: string | null
  ): Promise<SubmitResponse> {
    return this.call(this.http.post<SubmitResponse>(
      `/api/session/${sessionId}/result${query(force)}`,
      {answers, comments}
    ));
  }

  private async call<T>(request: import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}

const query = (force: string | null) => (force ? `?force=${encodeURIComponent(force)}` : '');

function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.error && error.error.error) {
      return error.error.error as ApiError;
    }
    // status 0 is the browser refusing to tell us why — offline, blocked, CORS.
    return {
      status: error.status,
      key: error.status === 0 ? 'demo_unreachable' : 'internal_error',
      message: error.message
    };
  }

  return {status: 0, key: 'internal_error', message: String(error)};
}
