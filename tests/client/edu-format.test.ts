import { describe, expect, it } from 'vitest';

import {
  balanceBand as clientBand,
  formatMoney,
  LOW_BALANCE_THRESHOLD as clientThreshold,
} from '../../client/pages/edu/format.ts';
import { balanceBand as serverBand } from '../../server/edu/can-thu.ts';
import { LOW_BALANCE_THRESHOLD as serverThreshold } from '../../server/edu/so-du.ts';

describe('shared formatting and the one threshold', () => {
  it('uses on the client the threshold the server uses to say who has to pay', () => {
    // The badge, the audit page and the "Cần thu" tab must never disagree on "running out".
    expect(clientThreshold).toBe(serverThreshold);
    for (let balance = -5; balance <= 10; balance += 1)
      expect(clientBand(balance)).toBe(serverBand(balance));
  });

  it('puts a balance in a band: over, running out (0 up to the threshold), fine', () => {
    expect(serverBand(-1)).toBe('vuot_goi');
    expect(serverBand(0)).toBe('sap_het');
    expect(serverBand(serverThreshold)).toBe('sap_het');
    expect(serverBand(serverThreshold + 1)).toBe('binh_thuong');
  });

  it('writes money with the Vietnamese thousands separator and tolerates a missing value', () => {
    expect(formatMoney(1200000)).toBe('1.200.000');
    expect(formatMoney('150000')).toBe('150.000');
    expect(formatMoney(null)).toBe('0');
    expect(formatMoney(undefined)).toBe('0');
    expect(formatMoney('x')).toBe('0');
  });
});
