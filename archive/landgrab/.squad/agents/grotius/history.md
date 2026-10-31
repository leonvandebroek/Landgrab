# Grotius — History

## Core Context
Security on Landgrab. JWT auth (HS256, min 32 chars secret). BCrypt factor 12. Rate limiting on auth endpoints. SignalR auth via ?access_token query param. OWASP guidelines enforced.

Never hardcode secrets — always env vars or Azure Key Vault.

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
