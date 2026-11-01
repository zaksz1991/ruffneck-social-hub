# v5.2.0 — WhatsApp external opt-out evidence

This release adds evidence-backed handling for WhatsApp opt-out requests received outside WhatsApp.

Owners, admins and managers can record an opt-out from a website form, phone call, email, in-person interaction, support ticket or another documented source. The system requires an evidence reference, records the acting user and timestamp, and immediately applies the existing database-level block to text, template and media sends.

The consent history now includes both externally recorded requests and inbound STOP/START keyword events. Staff cannot manually re-enable a contact; the contact must send START or UNSTOP through WhatsApp.

Migration `0039_whatsapp_external_opt_out_evidence.sql` is required after `0038_whatsapp_contact_opt_out_controls.sql`. No new environment variables are required.
