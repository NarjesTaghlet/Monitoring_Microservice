import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { EcsMetric } from './entities/EcsMetric.entity';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenGuard } from './Guards/token-guard';
import { SchedulerRegistry } from '@nestjs/schedule';
import { MonitoringGateway } from './monitoring.gateway';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { WsAuthGuard } from './Guards/WsAuthGuard';

@Module({
   imports: [
   // TypeOrmModule.forFeature([EcsMetric]), // Import the User entity for TypeORM
    HttpModule,
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: 'mysecretkey', // Ensure SECRET_KEY is defined in your .env file
      signOptions: {
        expiresIn: '1h', // Use a string for expiration time
      },
    }),
  ],
  providers: [MonitoringService,TokenGuard,SchedulerRegistry,Number,MonitoringGateway, TokenGuard, WsAuthGuard ] ,
  controllers: [MonitoringController],
  exports: [MonitoringModule,JwtModule] ,

})
export class MonitoringModule {}
