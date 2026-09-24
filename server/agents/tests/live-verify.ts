import http from 'http';
import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || 'sentinel_nova_super_secret_dev_key_2026';

function signSession(user: { id: string; email: string; name: string }) {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

const cookie = `sentinel_session=${signSession({
  id: 'test-user-http-verify',
  email: 'test@sentinelnova.ai',
  name: 'Test Verifier',
})}`;

function makeRequest(options: http.RequestOptions, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: 3000,
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 500, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runLiveVerification() {
  console.log('--- RUNNING LIVE SERVER HTTP ENDPOINT VERIFICATION ---');

  // Test 1: GET /api/nova/agents
  const getAgentsRes = await makeRequest({ path: '/api/nova/agents', method: 'GET' });
  console.log('GET /api/nova/agents:', getAgentsRes.status, getAgentsRes.data);
  if (getAgentsRes.status !== 200 || !getAgentsRes.data.agents) {
    throw new Error('GET /api/nova/agents failed');
  }

  // Test 2: POST /api/nova/orchestrate with missing message -> 400
  const badReqRes = await makeRequest({ path: '/api/nova/orchestrate', method: 'POST' }, {});
  console.log('POST /api/nova/orchestrate (empty body):', badReqRes.status, badReqRes.data);
  if (badReqRes.status !== 400) {
    throw new Error('Expected 400 for empty body');
  }

  // Test 3: POST /api/nova/orchestrate with disallowed agent -> 403
  const forbiddenReqRes = await makeRequest(
    { path: '/api/nova/orchestrate', method: 'POST' },
    { message: 'Hello', preferredAgentId: 'agent.malicious_unapproved' }
  );
  console.log('POST /api/nova/orchestrate (disallowed agent):', forbiddenReqRes.status, forbiddenReqRes.data);
  if (forbiddenReqRes.status !== 403) {
    throw new Error('Expected 403 for disallowed agent ID');
  }

  // Test 4: POST /api/nova/orchestrate valid request for inspector -> 200
  const validReqRes = await makeRequest(
    { path: '/api/nova/orchestrate', method: 'POST' },
    { message: 'Run system health inspection' }
  );
  console.log('POST /api/nova/orchestrate (inspector):', validReqRes.status, validReqRes.data?.success);
  if (validReqRes.status !== 200 || !validReqRes.data?.orchestration?.success) {
    throw new Error('Expected 200 and successful orchestration for inspector');
  }

  // Test 5: POST /api/nova/orchestrate valid request for planner -> 200
  const validPlannerRes = await makeRequest(
    { path: '/api/nova/orchestrate', method: 'POST' },
    { message: 'Please prioritize my day and build an execution plan', preferredAgentId: 'agent.planner' }
  );
  console.log('POST /api/nova/orchestrate (planner):', validPlannerRes.status, validPlannerRes.data?.success);
  if (validPlannerRes.status !== 200 || !validPlannerRes.data?.orchestration?.success) {
    throw new Error('Expected 200 and successful orchestration for planner');
  }
  const plannerOutput = validPlannerRes.data.orchestration.agentResults[0]?.output;
  if (!plannerOutput || !plannerOutput.recommendedStrategy) {
    throw new Error('Expected planner output to contain recommendedStrategy');
  }
  console.log('Planner recommended strategy:', plannerOutput.recommendedStrategy.name);

  // Test 6: POST /api/nova/orchestrate valid request for prioritizer -> 200
  const validPrioritizerRes = await makeRequest(
    { path: '/api/nova/orchestrate', method: 'POST' },
    { message: 'What should I work on first?', preferredAgentId: 'agent.prioritizer' }
  );
  console.log('POST /api/nova/orchestrate (prioritizer):', validPrioritizerRes.status, validPrioritizerRes.data?.success);
  if (validPrioritizerRes.status !== 200 || !validPrioritizerRes.data?.orchestration?.success) {
    throw new Error('Expected 200 and successful orchestration for prioritizer');
  }
  const prioritizerOutput = validPrioritizerRes.data.orchestration.agentResults[0]?.output;
  if (!prioritizerOutput || !prioritizerOutput.recommendedStrategy) {
    throw new Error('Expected prioritizer output to contain recommendedStrategy');
  }
  console.log('Prioritizer recommended strategy:', prioritizerOutput.recommendedStrategy.name);

  console.log('ALL LIVE SERVER HTTP ENDPOINT CHECKS PASSED!');
  process.exit(0);
}

runLiveVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
