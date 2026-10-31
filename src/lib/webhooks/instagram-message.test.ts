import { describe, expect, it } from 'vitest';
import { normalizeInstagramMessage } from './instagram-message';

describe('normalizeInstagramMessage', () => {
  it('normalizes inbound text without exposing unrelated payload fields', () => {
    expect(normalizeInstagramMessage({ sender:{id:'person-1'}, recipient:{id:'ig-1'}, timestamp:1700000000000, message:{mid:'m-1',text:' Hello '}, extra:'ignored' }, 'ig-1')).toMatchObject({ participantProviderId:'person-1', providerMessageId:'m-1', direction:'inbound', text:'Hello' });
  });
  it('marks account-originated echoes as outbound', () => {
    expect(normalizeInstagramMessage({ sender:{id:'ig-1'}, recipient:{id:'person-1'}, timestamp:1700000000000, message:{mid:'m-2',text:'Sent',is_echo:true} }, 'ig-1')?.direction).toBe('outbound');
  });
  it('ignores attachments, malformed messages and oversized text', () => {
    expect(normalizeInstagramMessage({ sender:{id:'p'}, recipient:{id:'ig'}, message:{attachments:[]} }, 'ig')).toBeNull();
    expect(normalizeInstagramMessage({ sender:{id:'p'}, recipient:{id:'ig'}, message:{mid:'x',text:'x'.repeat(10001)} }, 'ig')).toBeNull();
  });
});
