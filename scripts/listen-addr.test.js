'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseListenAddr, resolveListenAddr } = require('./listen-addr');

describe('parseListenAddr', () => {
  it('parses :8000 as all interfaces', () => {
    assert.deepEqual(parseListenAddr(':8000'), { host: '0.0.0.0', port: 8000 });
  });

  it('parses 127.0.0.1:9001', () => {
    assert.deepEqual(parseListenAddr('127.0.0.1:9001'), {
      host: '127.0.0.1',
      port: 9001,
    });
  });

  it('rejects missing port', () => {
    assert.throws(() => parseListenAddr('localhost'), /invalid/);
  });
});

describe('resolveListenAddr', () => {
  it('defaults to :8000', () => {
    const got = resolveListenAddr([], {});
    assert.equal(got.raw, ':8000');
    assert.equal(got.host, '0.0.0.0');
    assert.equal(got.port, 8000);
  });

  it('uses XSHELL_LISTEN_ADDR when set', () => {
    const got = resolveListenAddr([], { XSHELL_LISTEN_ADDR: '127.0.0.1:9001' });
    assert.equal(got.raw, '127.0.0.1:9001');
    assert.equal(got.host, '127.0.0.1');
    assert.equal(got.port, 9001);
  });

  it('lets -addr override the env', () => {
    const got = resolveListenAddr(
      ['node', 'xshell-launch.js', '-addr', '127.0.0.1:9100'],
      { XSHELL_LISTEN_ADDR: '127.0.0.1:9001' },
    );
    assert.equal(got.raw, '127.0.0.1:9100');
    assert.equal(got.port, 9100);
  });

  it('supports -addr=value form', () => {
    const got = resolveListenAddr(['-addr=:8111'], {});
    assert.equal(got.port, 8111);
    assert.equal(got.host, '0.0.0.0');
  });
});
