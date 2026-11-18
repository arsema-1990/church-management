import type { Prisma } from '@prisma/client';

/** Put each member in the least populated active cell that still has room. */
export async function assignMemberToAvailableHomeCell(tx: Prisma.TransactionClient, memberId: string) {
  const currentAssignment = await tx.homeCellMember.findFirst({
    where: { memberId, leftAt: null },
    select: { cellId: true },
  });
  if (currentAssignment) return currentAssignment;

  const cells = await tx.homeCell.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, capacity: true },
  });
  for (const cell of cells) {
    const occupied = await tx.homeCellMember.count({ where: { cellId: cell.id, leftAt: null } });
    if (occupied < cell.capacity) {
      return tx.homeCellMember.create({ data: { cellId: cell.id, memberId } });
    }
  }
  return null;
}

/** Fill available spaces for existing members who have not yet been assigned. */
export async function assignUnassignedMembers(tx: Prisma.TransactionClient) {
  const unassigned = await tx.member.findMany({
    where: { cellMemberships: { none: { leftAt: null } } },
    orderBy: [{ membershipDate: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  let assigned = 0;
  for (const member of unassigned) {
    if (await assignMemberToAvailableHomeCell(tx, member.id)) assigned += 1;
  }
  return assigned;
}
