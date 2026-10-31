# RuffNeck Social Hub v2.8.0

## Publishing queue health

Adds an operational summary to the Publishing Calendar using the latest queue records already loaded for the active workspace:

- Overdue schedules: queued or retryable jobs whose scheduled time is in the past.
- Needs attention: retryable, failed, and needs-review jobs.
- Next 24 hours: queued jobs scheduled between now and 24 hours from now.
- Published: jobs in the succeeded state.

The panel explicitly states that it reflects the latest loaded records (currently up to 100), not the entire queue history. It does not claim to report reach, impressions, clicks, or engagement. No database migration or new environment variable is required.
