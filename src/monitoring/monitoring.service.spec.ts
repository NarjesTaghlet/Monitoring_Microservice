import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from './monitoring.service';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EcsMetric } from './entities/EcsMetric.entity';
import { SchedulerRegistry } from '@nestjs/schedule';
import { of } from 'rxjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

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

  const mockDynamoDBClient = {
    send: jest.fn().mockResolvedValue({}),
  };

  const mockCloudWatchClient = {
    send: jest.fn().mockResolvedValue({
      MetricDataResults: [
        { Id: 'cpu', Values: [50], Timestamps: [new Date()] },
        { Id: 'memory', Values: [60], Timestamps: [new Date()] },
        { Id: 'requestCount', Values: [100], Timestamps: [new Date()] },
      ],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: getRepositoryToken(EcsMetric), useValue: mockRepository },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
        { provide: DynamoDBClient, useValue: mockDynamoDBClient },
        { provide: CloudWatchClient, useValue: mockCloudWatchClient },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should collect and retrieve metrics for multiple users without mixing data', async () => {
    const users = [
      { userId: 1, siteName: 'siteA' },
      { userId: 2, siteName: 'siteB' },
      { userId: 3, siteName: 'siteC' },
    ];

    jest.spyOn(service, 'fetchEcsResourcesForSite').mockImplementation(async (userId, siteName) => ({
      userId,
      siteName,
      clusterName: `ecs-cluster-${siteName}`,
      serviceName: `medium-tier-service-${siteName}`,
      asgName: `asg-${siteName}`,
      targetGroupArn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/tg-${siteName}/1234567890`,
      loadBalancerArn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb-${siteName}/1234567890`,
      loadBalancerDNS: `alb-${siteName}.us-east-1.elb.amazonaws.com`,
    }));

    jest.spyOn(service, 'verifyECSDeployment').mockResolvedValue({ runningCount: 1, desiredCount: 1 });

    for (const user of users) {
      await service.collectECSMetricsss(user.userId, user.siteName);
    }

    expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(users.length);
    users.forEach(user => {
      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'EcsMetrics',
            Item: expect.objectContaining({
              siteName: { S: user.siteName },
              userId: { N: user.userId.toString() },
            }),
          }),
        }),
      );
    });

    mockDynamoDBClient.send.mockReset();
    mockDynamoDBClient.send.mockImplementation(async ({ input }) => ({
      Items: [
        {
          userId: { N: input.ExpressionAttributeValues[':userId'].N },
          siteName: { S: input.ExpressionAttributeValues[':siteName'].S },
          timestamp: { S: new Date().toISOString() },
          dataPoints: { L: [] },
        },
      ],
    }));

    for (const user of users) {
      const historicalMetrics = await service.getHistoricalMetrics(user.userId, 1, user.siteName);
      expect(historicalMetrics).toHaveLength(1);
      expect(historicalMetrics[0]).toMatchObject({
        userId: user.userId.toString(),
        siteName: user.siteName,
      });
    }
  });
});