# RuffNeck Social Hub v4.0.0

## Publishing Campaign Intelligence

Version 4.0 introduces campaign-level planning and accountable performance tracking around the existing multi-brand content and publishing queue.

### What is new

- Plan campaigns by brand, objective, schedule window and status.
- Associate content items with campaigns, with database enforcement that the content belongs to the campaign's brand and workspace.
- Generate organic-social UTM links for supported platforms from a campaign landing page.
- Manually capture performance snapshots from native platform insights for each provider-confirmed published destination.
- Roll up the latest snapshot per destination into campaign-level impressions, reach, engagements, clicks, leads and conversions.
- Access campaign planning from dashboard navigation.

### What is deliberately not claimed

This release does not add official provider analytics ingestion, ad account reporting, attribution modelling, automatic best-time recommendations or automated content optimisation. Metrics are manual inputs and are labelled as such. UTM links require a separately configured analytics property or website analytics tool to measure visits and conversions.

### Database

New migration: `0027_publishing_campaign_intelligence.sql`.

### Build and test safeguards

The production build script now runs the new campaign integration audit before Next.js. The regression test script runs 16 standalone campaign checks before Vitest.
