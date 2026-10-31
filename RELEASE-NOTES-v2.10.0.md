# RuffNeck Social Hub v2.10.0

## Workspace-wide publishing history filters

Status, platform and brand filters are now applied in the Supabase query before pagination. The matching-record count and Previous/Next navigation therefore represent the full filtered workspace history, rather than filtering only the 25 rows currently displayed.

Text search remains scoped to the current page because the existing schema does not expose a joined searchable history view. The interface states this limitation. CSV export remains a separate export endpoint and continues to apply its own filters.

No database migration or new environment variable is required. Existing publishing integrations and actions are unchanged.
