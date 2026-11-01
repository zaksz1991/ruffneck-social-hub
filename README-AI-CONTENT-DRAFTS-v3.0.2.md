# AI campaign draft assistant

Open **Content Studio** and use **AI campaign draft assistant** above the manual post editor. Select a brand, campaign objective, tone and language, then provide an audience and a factual campaign brief.

The assistant is optional. It appears as unavailable until `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL` are configured in the deployment's server environment. An optional `LOCAL_AI_API_KEY` is supported for secured OpenAI-compatible model gateways. No API key or endpoint is sent to the browser.

The model receives the campaign brief and the selected brand's sanitized voice profile. It is instructed to use only supplied facts and avoid forbidden claims. Model output is not considered verified. Check the copy, claims, language, spelling, links and regulatory suitability.

Generated copy is returned as an editable preview and is not saved automatically. Select **Save as content draft** only after review. This creates a normal Content Studio draft; it does not approve, schedule or publish the post.

Do not submit credentials, customer personal data, payment data or confidential information in campaign briefs. Use a private, authenticated inference endpoint where possible.
