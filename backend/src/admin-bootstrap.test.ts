import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';

import { getAdminBootstrapConfig, shouldRecreateAdmin, shouldRefreshAdminCredentials } from './admin-bootstrap.js';

test('missing admin configuration returns null', () => {
  assert.equal(getAdminBootstrapConfig({}), null);
});

test('valid admin configuration is accepted', () => {
  const config = getAdminBootstrapConfig({
    ADMIN_EMAIL: 'admin@church.local',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'ChurchAdmin1!',
  });

  assert.deepEqual(config, {
    email: 'admin@church.local',
    username: 'admin',
    password: 'ChurchAdmin1!',
  });
});

test('existing administrator is not overwritten', () => {
  const config = {
    email: 'admin@church.local',
    username: 'admin',
    password: 'ChurchAdmin1!',
  };

  assert.equal(
    shouldRecreateAdmin({ role: 'ADMINISTRATOR', email: 'admin@church.local', username: 'admin' }, config),
    false,
  );
});

test('a non-admin account is promoted instead of replaced', () => {
  const config = {
    email: 'admin@church.local',
    username: 'admin',
    password: 'ChurchAdmin1!',
  };

  assert.equal(
    shouldRecreateAdmin({ role: 'WORSHIPER', email: 'admin@church.local', username: 'admin' }, config),
    true,
  );
});

test('existing admin with stale password gets refreshed', async () => {
  const config = {
    email: 'admin@church.local',
    username: 'admin',
    password: 'ChurchAdmin1!',
  };

  const stalePasswordHash = await bcrypt.hash('OldPassword123!', 12);

  assert.equal(
    await shouldRefreshAdminCredentials({ role: 'ADMINISTRATOR', passwordHash: stalePasswordHash }, config),
    true,
  );

  assert.equal(
    await shouldRefreshAdminCredentials({ role: 'ADMINISTRATOR', passwordHash: await bcrypt.hash('ChurchAdmin1!', 12) }, config),
    false,
  );
});
