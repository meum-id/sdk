# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific
meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings;
direct edits are fine. Glossary only, not a spec or catch-all.

## Contract seam

### Frozen seam

The public wire contract (endpoint payloads, receipt and key formats, error codes) frozen at a tagged cut. Consumers
build against a specific cut by vendoring the source at its tag; any change is a deliberate re-cut that consumers adopt
explicitly by re-vendoring. A re-cut may be breaking; the seam never evolves in place.

## Device keys and revocation

### Device key

An asymmetric signing keypair created on a holder device and registered with the backend, which stores only the public
half. Receipts and revoke proofs are signed with it; possession of the private half is what ties an action to the
device. Registration binds the key to an identity attestation and a device type.

### Revoke proof

A device-signed assertion accompanying a key-revocation request, proving possession of the very key being revoked. It is
bound to that key, carries anti-replay claims whose acceptance policy the verifier owns, and declares a purpose
distinguishing a live self-revoke from a pre-signed migration token.

### Receipt

A device-signed verification result presented to a relying party: bound to that relying party, valid for a single
session, short-lived, and verifiable offline against the device's registered public key. Only a receipt asserting the
predicate held verifies.

### Predicate

The condition a relying party asks the holder to satisfy, expressed in a small grammar of claims (single claims or
conjunctions). A receipt reports only whether the predicate held, never the underlying attributes.

## Flagged ambiguities

- "Reason" and "purpose" on a revocation are distinct, not synonyms: reason is the human-readable audit label on the
  revoke request; purpose is the signed claim inside the revoke proof distinguishing a live self-revoke from a
  pre-signed migration token.
