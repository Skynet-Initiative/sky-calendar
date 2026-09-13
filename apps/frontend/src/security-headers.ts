export function contentSecurityPolicy(production: boolean, nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    "script-src-attr 'none'",
    // The imported MIT calendar core positions events with generated style attributes.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
