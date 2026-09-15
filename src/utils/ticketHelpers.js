import {
  doc, runTransaction
} from 'firebase/firestore';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { db } from '../firebase/config';

export const getTicketSLAInfo = (ticket, slaConfig) => {
  if (!ticket?.createdAt) return null;
  const createdDate = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt);
  if (isNaN(createdDate.getTime())) return null;

  const targetHours = (slaConfig || {})[ticket.priority || 'medium'] ?? 24;
  const deadline = new Date(createdDate.getTime() + targetHours * 60 * 60 * 1000);
  const isTerminal = TICKET_TERMINAL_STATUSES.includes(ticket.status);
  const now = new Date();
  const hoursRemaining = (deadline - now) / (1000 * 60 * 60);

  let level;
  if (isTerminal) {
    level = 'completed';
  } else if (hoursRemaining < 0) {
    level = 'overdue';
  } else if (hoursRemaining <= targetHours * 0.25) {
    level = 'due_soon';
  } else {
    level = 'on_track';
  }

  return { deadline, hoursRemaining, level, targetHours };
};

export const getNextTicketNumber = async () => {
  const counterRef = doc(db, 'counters', 'tickets');
  const nextValue = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const next = counterDoc.exists() ? (counterDoc.data().value || 0) + 1 : 1;
    transaction.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return `TKT-${String(nextValue).padStart(6, '0')}`;
};
