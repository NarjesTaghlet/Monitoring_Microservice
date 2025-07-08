import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EcsMetric } from './monitoring/entities/EcsMetric.entity';
import { HttpModule } from '@nestjs/axios';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // Change à '.env' si à la racine, ou garde 'src/.env' si dans src/
    }),
    HttpModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        console.log('SECRET_KEY in TypeOrm config:', process.env.SECRET_KEY); // Debug
        return {
          type: 'mysql',
    //host: 'localhost',
    host : process.env.DB_HOST,
    port: 3307,
    username: 'root',
    password: '',
    database: 'metrics',
    entities: [EcsMetric],
    synchronize: true,
        };
      },
      inject: [ConfigService],
    }),
   MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService], // Retire JwtStrategy d'ici
})
export class AppModule {}
