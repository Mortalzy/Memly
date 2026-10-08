import type { PrismaClient } from '@memly/database';
import type { FolderDto, FolderInput } from '@memly/contracts';
import { conflict, missing } from '../../http/errors.ts';

const select = {
  id: true,
  title: true,
  icon: true,
  revision: true,
  _count: { select: { decks: true } },
};
const dto = ({
  _count,
  ...folder
}: {
  id: string;
  title: string;
  icon: string;
  revision: number;
  _count: { decks: number };
}): FolderDto => ({ ...folder, count: _count.decks });
export function createLibraryService(db: PrismaClient) {
  return {
    async list(userId: string): Promise<FolderDto[]> {
      return (
        await db.folder.findMany({
          where: { ownerId: userId },
          select,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      ).map(dto);
    },
    async create(userId: string, data: FolderInput): Promise<FolderDto> {
      return dto(await db.folder.create({ data: { ...data, ownerId: userId }, select }));
    },
    async update(
      userId: string,
      id: string,
      input: FolderInput & { revision: number },
    ): Promise<FolderDto> {
      return db.$transaction(async (tx) => {
        const { revision, ...data } = input;
        if (!(await tx.folder.findFirst({ where: { id, ownerId: userId } }))) throw missing();
        const updated = await tx.folder.updateMany({
          where: { id, ownerId: userId, revision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (!updated.count) throw conflict();
        return dto(await tx.folder.findUniqueOrThrow({ where: { id }, select }));
      });
    },
    async remove(userId: string, id: string, revision: number): Promise<void> {
      await db.$transaction(async (tx) => {
        if (!(await tx.folder.findFirst({ where: { id, ownerId: userId } }))) throw missing();
        const removed = await tx.folder.deleteMany({ where: { id, ownerId: userId, revision } });
        if (!removed.count) throw conflict();
      });
    },
  };
}
