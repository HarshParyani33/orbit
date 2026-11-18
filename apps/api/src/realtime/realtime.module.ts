import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getConfig } from '@orbit/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const config = getConfig();
        return {
          secret: config.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        };
      },
    }),
  ],
  providers: [
    PrismaService,
    TenantTransactionRunner,
    RealtimeGateway,
    RealtimeService,
  ],
  exports: [RealtimeGateway, RealtimeService],
})
export class RealtimeModule {}
