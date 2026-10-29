# auth.md

## Authentication status

Authentication is under construction and is not available. No registration, token issuance, OAuth redirect, or private-resource access is implemented.

## Agent registration

Registration endpoint (`register_uri`): `https://photo2reel.com/agent-auth/register` (planned; currently returns `503 temporarily_unavailable`). Registration method: anonymous registration is planned but unavailable. Credential types: access tokens are planned for the public `site:read` scope; no credentials are accepted or stored at this time.

Machine-readable agent_auth declaration:

```json
{"agent_auth":{"status":"under_construction","available":false,"capabilities_status":"planned_contract_only","skill":"https://photo2reel.com/auth.md","register_uri":"https://photo2reel.com/agent-auth/register","claim_uri":"https://photo2reel.com/agent-auth/claim","identity_types_supported":["anonymous"],"anonymous":{"status":"under_construction","credential_types_supported":["access_token"],"registration_method":"planned_only"}}}
```

Agents must not attempt the planned authorization or token endpoints. Use the public [Photo2Reel service description](/ai/) and [photo-to-video skill](/.well-known/agent-skills/photo-to-video/SKILL.md) instead.
