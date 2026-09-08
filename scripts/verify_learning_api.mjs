import assert from 'node:assert/strict';
const base = 'http://localhost:3000';
const headers = {
  Cookie: '__sites_local_auth=1',
  'Content-Type': 'application/json',
  Origin: base,
};
async function get() {
  const res = await fetch(`${base}/api/learning`, { headers });
  assert.equal(res.status, 200);
  return res.json();
}
async function put(data, revision) {
  return fetch(`${base}/api/learning`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data, revision }),
  });
}
const original = await get();
let revision = original.revision;
let tests = 0;
const done = (name) => {
  tests++;
  console.log(`PASS ${name}`);
};
try {
  assert.equal((await fetch(`${base}/api/learning`)).status, 401);
  done('anonymous read rejected');
  assert.equal(
    (
      await fetch(`${base}/api/learning`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    401,
  );
  done('anonymous write rejected');
  const state = structuredClone(original.data);
  state.materialLocation = 'Local API regression fixture';
  let res = await put(state, revision);
  assert.equal(res.status, 200);
  revision = (await res.json()).revision;
  assert.deepEqual((await get()).data, state);
  done('saved data survives fresh request');
  assert.equal((await put(original.data, revision - 1)).status, 409);
  assert.deepEqual((await get()).data, state);
  done('stale revision cannot overwrite data');
  assert.equal(
    (await put({ ...state, plan: { ...state.plan, intervals: [0] } }, revision))
      .status,
    400,
  );
  done('invalid review plan rejected');
  assert.equal(
    (
      await fetch(`${base}/api/learning`, {
        method: 'PUT',
        headers: { ...headers, Origin: 'https://unrelated.invalid' },
        body: JSON.stringify({ data: state, revision }),
      })
    ).status,
    403,
  );
  done('cross-origin write rejected');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=',
    'base64',
  );
  res = await fetch(`${base}/api/learning/image`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/png' },
    body: png,
  });
  assert.equal(res.status, 200);
  const image = (await res.json()).image;
  res = await fetch(`${base}${image}`, { headers });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);
  done('private image upload and retrieval');
  assert.equal((await fetch(`${base}${image}`)).status, 401);
  done('image requires authenticated account');
  assert.equal(
    (
      await fetch(`${base}/api/learning/image`, {
        method: 'POST',
        headers,
        body: '<svg>invalid image content</svg>',
      })
    ).status,
    400,
  );
  done('unsupported image bytes rejected');
} finally {
  const latest = await get();
  const restored = await put(original.data, latest.revision);
  assert.equal(restored.status, 200, 'Restore local fixture state');
}
console.log(
  `Verified ${tests} API checks; original local learning data restored.`,
);
