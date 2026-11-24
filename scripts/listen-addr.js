'use strict';

/**
 * Parse listen address forms used by xTools: `host:port` or `:port`.
 * Empty host means bind all interfaces (0.0.0.0).
 *
 * @param {string} raw
 * @returns {{ host: string, port: number }}
 */
function parseListenAddr(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) {
    throw new Error('empty listen address');
  }
  const lastColon = s.lastIndexOf(':');
  if (lastColon < 0) {
    throw new Error(`invalid listen address: ${s}`);
  }
  const hostPart = s.slice(0, lastColon);
  const portPart = s.slice(lastColon + 1);
  const port = Number(portPart);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port in listen address: ${s}`);
  }
  const host = hostPart === '' ? '0.0.0.0' : hostPart;
  return { host, port };
}

/**
 * Resolve listen address with precedence: `-addr` CLI > env > default.
 *
 * @param {string[]} argv process.argv slice (full argv ok; looks for -addr)
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [defaultAddr]
 * @returns {{ host: string, port: number, raw: string }}
 */
function resolveListenAddr(argv, env, defaultAddr) {
  const args = Array.isArray(argv) ? argv : [];
  let fromFlag = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-addr' && i + 1 < args.length) {
      fromFlag = args[i + 1];
      break;
    }
    if (typeof args[i] === 'string' && args[i].startsWith('-addr=')) {
      fromFlag = args[i].slice('-addr='.length);
      break;
    }
  }
  const envMap = env || {};
  const raw =
    (fromFlag != null && String(fromFlag).trim() !== '' ? String(fromFlag).trim() : null) ||
    (envMap.XSHELL_LISTEN_ADDR && String(envMap.XSHELL_LISTEN_ADDR).trim()) ||
    defaultAddr ||
    ':8000';
  const parsed = parseListenAddr(raw);
  return { ...parsed, raw };
}

module.exports = {
  parseListenAddr,
  resolveListenAddr,
};
