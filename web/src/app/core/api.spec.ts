import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {DemoApi} from './api';

const ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

describe('DemoApi', () => {
  let api: DemoApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    api = TestBed.inject(DemoApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('unwraps the data envelope', async () => {
    const result = api.session(ID, null);
    http.expectOne(`/api/session/${ID}`).flush({data: {session_id: ID, threshold: 80}});

    expect((await result).threshold).toBe(80);
  });

  it('forwards force rather than gating it - the server owns that decision', async () => {
    const result = api.session(ID, '410');
    http.expectOne(req => req.url.includes('force=410')).flush({data: {session_id: ID}});

    await result;
  });

  it('surfaces the server error envelope as an ApiError', async () => {
    const result = api.session(ID, null);
    http.expectOne(() => true).flush(
      {error: {status: 410, key: 'session_expired', message: 'Task deadline has passed'}},
      {status: 410, statusText: 'Gone'}
    );

    await expect(result).rejects.toMatchObject({key: 'session_expired', status: 410});
  });

  it('reports an unreachable demo server distinctly from a rejected result', async () => {
    // status 0 is the browser refusing to say why. Conflating it with a rejection would
    // tell a learner their work was refused when in fact it never arrived.
    const result = api.session(ID, null);
    http.expectOne(() => true).error(new ProgressEvent('error'), {status: 0});

    await expect(result).rejects.toMatchObject({key: 'demo_unreachable'});
  });
});
