import { describe, it, expect } from 'vitest';
import { buildBasketModel, suggestForCart } from '../../ai/basket';

const sale = (...serials) => ({ type: 'sell', items: serials.map((s) => ({ serialNumber: s, name: `n-${s}`, price: 10 })) });

describe('basket suggestions', () => {
  const txs = [sale('TV', 'HDMI', 'MOUNT'), sale('TV', 'HDMI'), sale('TV', 'MOUNT'), sale('TV', 'HDMI'), sale('FAN'), sale('TV', 'REMOTE'),
    { type: 'return', items: [{ serialNumber: 'TV' }, { serialNumber: 'X' }] }, { type: 'sell', items: [{ serialNumber: 'TV' }, { serialNumber: 'SVC', isService: true }] }];
  const model = buildBasketModel(txs);
  it('suggests frequent companions, excluding cart items, services, returns, and rare pairs', () => {
    const s = suggestForCart(model, ['TV']);
    expect(s.map((x) => x.serialNumber)).toEqual(['HDMI', 'MOUNT']);
    expect(s[0].together).toBe(3);
    expect(suggestForCart(model, ['TV', 'HDMI']).map((x) => x.serialNumber)).toEqual(['MOUNT']);
  });
  it('case-insensitive serials and empty cart', () => {
    expect(suggestForCart(model, ['tv'])[0].serialNumber).toBe('HDMI');
    expect(suggestForCart(model, [])).toEqual([]);
    expect(suggestForCart(null, ['TV'])).toEqual([]);
  });
});
