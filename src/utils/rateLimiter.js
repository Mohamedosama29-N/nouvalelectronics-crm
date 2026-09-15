export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new globalThis.Map();
  }

  check(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    const validRequests = userRequests.filter(
      time => now - time < this.windowMs
    );
    
    if (validRequests.length >= this.limit) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  getRemaining(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    const validRequests = userRequests.filter(
      time => now - time < this.windowMs
    );
    return Math.max(0, this.limit - validRequests.length);
  }

  reset(key) {
    this.requests.delete(key);
  }
}

export const apiLimiter = new RateLimiter(60, 60000);


// ==========================================================================
// 👤 USER IP & LOCATION TRACKING
// ==========================================================================
