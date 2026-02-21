# Baseline Test Rollout Checklist

Status legend:
- DONE: baseline tests added and app/package moved to strict `vitest run`
- IN PROGRESS: some baseline tests added, strict mode pending
- TODO: not started

## Apps

- Backoffice: DONE
- Marketing: DONE
- Public Booking: DONE
- Salon Admin: DONE
- Client Portal: DONE

## Packages

- `@salonmagik/shared`: DONE
- `@salonmagik/ui`: DONE

## CI policy

- Hybrid strictness is active by app/package.
- Completed apps/packages have strict `vitest run` (no `--passWithNoTests`).
- Remaining packages can be moved to strict mode as baseline tests are added.
