import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantTransactionRunner {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Executes an interactive transaction with tenant RLS context established via `SET LOCAL`.
   *
   * @param organizationId Target tenant UUID
   * @param fn Callback executing tenant-scoped operations on the transaction client
   */
  async runWithTenant<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    if (!organizationId || !UUID_REGEX.test(organizationId)) {
      throw new BadRequestException('A valid organizationId UUID is required to establish tenant context');
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Establish transaction-local tenant context (SET LOCAL is_local=true)
        await tx.$queryRaw(
          Prisma.sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`
        );

        return fn(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 10000,
      }
    );
  }
}
