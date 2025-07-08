import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EcsMetric } from './entities/EcsMetric.entity';
import { SchedulerRegistry } from '@nestjs/schedule';
import { of } from 'rxjs';

describe('MonitoringController', () => {
  let controller: MonitoringController;

  const mockHttpService = {
    post: jest.fn().mockReturnValue(of({ data: { accessKeyId: 'mockKey', secretAccessKey: 'mockSecret', sessionToken: 'mockToken' } })),
  };

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
  };

  const mockMonitoringService = {
    collectECSMetricsss: jest.fn(),
    getHistoricalMetrics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [
        { provide: MonitoringService, useValue: mockMonitoringService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: getRepositoryToken(EcsMetric), useValue: mockRepository },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    })
      .overrideGuard('TokenGuard')
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MonitoringController>(MonitoringController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});