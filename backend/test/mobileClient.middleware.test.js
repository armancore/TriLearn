const test = require('node:test')
const assert = require('node:assert/strict')

const {
  SEMVER_PATTERN,
  compareSemver,
  hasMobileClientHeaders
} = require('../src/middleware/mobileClient.middleware')

test('compareSemver compares only major, minor, and patch components', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0)
  assert.equal(compareSemver('1.2.4', '1.2.3'), 1)
  assert.equal(compareSemver('1.3.0', '1.2.99'), 1)
  assert.equal(compareSemver('2.0.0', '1.99.99'), 1)
  assert.equal(compareSemver('1.2.2', '1.2.3'), -1)
  assert.equal(compareSemver('1.1.99', '1.2.0'), -1)
  assert.equal(compareSemver('0.99.99', '1.0.0'), -1)
})

test('compareSemver accepts semver metadata without letting it change ordering', () => {
  assert.equal(SEMVER_PATTERN.test('1.2.3-beta.1'), true)
  assert.equal(SEMVER_PATTERN.test('1.2.3+build.7'), true)
  assert.equal(compareSemver('1.2.3-beta.1', '1.2.3'), 0)
  assert.equal(compareSemver('1.2.3+build.7', '1.2.3'), 0)
})

test('compareSemver rejects malformed versions instead of guessing', () => {
  assert.equal(SEMVER_PATTERN.test('1.2'), false)
  assert.equal(SEMVER_PATTERN.test('1.2.x'), false)
  assert.equal(compareSemver('1.2', '1.2.0'), null)
  assert.equal(compareSemver('1.2.x', '1.2.0'), null)
  assert.equal(compareSemver('', '1.2.0'), null)
})

test('hasMobileClientHeaders requires mobile type and matching app/client semver headers', () => {
  const get = (headers) => (name) => headers[name.toLowerCase()]

  assert.equal(hasMobileClientHeaders({
    get: get({
      'x-client-type': 'mobile',
      'x-client-version': '1.2.3',
      'x-app-version': '1.2.3'
    })
  }), true)

  assert.equal(hasMobileClientHeaders({
    get: get({
      'x-client-type': 'web',
      'x-client-version': '1.2.3',
      'x-app-version': '1.2.3'
    })
  }), false)

  assert.equal(hasMobileClientHeaders({
    get: get({
      'x-client-type': 'mobile',
      'x-client-version': '1.2',
      'x-app-version': '1.2.3'
    })
  }), false)
})
