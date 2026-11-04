// 🗂️ كاش مشترك للتذاكر الحديثة (للتوقعات والتشابه) والتذاكر المفتوحة (لحمل الفنيين).
// بيتحمّل عند الطلب بس، ومرة كل 10 دقايق، عشان القراءات تفضل قليلة.
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';

const TTL = 10 * 60 * 1000;
let recent = { at: 0, list: [], promise: null };
let open = { at: 0, list: [], promise: null };

export function loadRecentTickets(max = 800) {
  if (Date.now() - recent.at < TTL && recent.list.length) return Promise.resolve(recent.list);
  if (recent.promise) return recent.promise;
  recent.promise = getDocs(query(collection(db, 'tickets'), orderBy('updatedAt', 'desc'), limit(max)))
    .then((snap) => { recent = { at: Date.now(), list: snap.docs.map((d) => ({ id: d.id, ...d.data() })), promise: null }; return recent.list; })
    .catch((e) => { recent.promise = null; throw e; });
  return recent.promise;
}

export function loadOpenTickets() {
  if (Date.now() - open.at < TTL && open.at) return Promise.resolve(open.list);
  if (open.promise) return open.promise;
  open.promise = getDocs(query(collection(db, 'tickets'), where('status', 'not-in', TICKET_TERMINAL_STATUSES), limit(3000)))
    .then((snap) => { open = { at: Date.now(), list: snap.docs.map((d) => ({ id: d.id, ...d.data() })), promise: null }; return open.list; })
    .catch((e) => { open.promise = null; throw e; });
  return open.promise;
}

export function invalidateTicketPools() { recent.at = 0; open.at = 0; }
