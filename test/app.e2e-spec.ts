import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from 'src/monitoring/monitoring.service';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EcsMetric } from 'src/monitoring/entities/EcsMetric.entity';
import { SchedulerRegistry } from '@nestjs/schedule';
import { of } from 'rxjs';

describe('MonitoringService', () => {
  let service: MonitoringService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: getRepositoryToken(EcsMetric), useValue: mockRepository },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});