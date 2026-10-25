'use strict';

const INSECURE_EXAMPLE_SECRET = 'replace_with_a_local_development_secret';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (
    typeof secret !== 'string' ||
    Buffer.byteLength(secret, 'utf8') < 32 ||
    secret.trim() !== secret ||
    secret === INSECURE_EXAMPLE_SECRET
  ) {
    return null;
  }

  return secret;
}

module.exports = { getJwtSecret };
