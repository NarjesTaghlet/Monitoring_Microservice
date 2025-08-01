import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EcsMetric } from './entities/EcsMetric.entity';
import { LightsailClient, GetInstancesCommand, GetInstanceMetricDataCommand } from '@aws-sdk/client-lightsail';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Between } from 'typeorm';
import { CloudWatchClient, GetMetricDataCommand, type GetMetricDataCommandInput } from "@aws-sdk/client-cloudwatch";
import { ECSClient, DescribeServicesCommand } from "@aws-sdk/client-ecs";
import { Repository, EntityManager,createConnection } from 'typeorm';
import { PutItemCommand , DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {  QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { BadRequestException } from '@nestjs/common';
import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeLoadBalancersCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { AxiosResponse } from 'axios';

import * as dotenv from 'dotenv' ;
import { ConfigService } from '@nestjs/config';
dotenv.config();



interface ECSMetricsResult {
  cpuUtilization: number;
  memoryUtilization: number;
  timestamp: Date;
}

interface ECSMetrics {
  cpu: number;
  memory: number;
  timestamp: Date;
}
interface EcsConfig {
  region: string;
  cluster: string;
  service: string;
  targetGroupArn: string;
  albArn : string;
  asgName : string
}



@Injectable()
export class MonitoringService {
    private userConfigs: Map<number, EcsConfig>;

  private readonly logger = new Logger(MonitoringService.name);
  private lightsailClients: Map<number, { client: LightsailClient; expiration: Date }> = new Map();
  private jobs = new Map<number, CronJob>();

  constructor(
    private readonly httpService: HttpService,
   // @InjectRepository(EcsMetric) private metricRepository: Repository<EcsMetric>,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService : ConfigService
     

  ) {this.userConfigs = new Map<number, EcsConfig>();}



 addUserConfig(userId: number, region: string, cluster: string, service: string, targetGroupArn: string , albArn : string , asgName : string) {
    this.userConfigs.set(userId, { region, cluster, service, targetGroupArn , albArn , asgName});
    this.logger.debug(`Added config for user ${userId}: ${JSON.stringify(this.userConfigs.get(userId))}`);
  }
 // CRON pour le medium Plan => enregistre dans la bd => on nécéssite le reporting
 // pour basic plan=> aws sdk et call api => bouton refresh ! 
  
  
/*addCronJob(userId: string, cronExpression: string) {
    const job = new CronJob(cronExpression, () => {
      this.collectECSMetrics(parseInt(userId,10)); // Nom de méthode corrigé
    });

    this.schedulerRegistry.addCronJob(`user-${userId}`, job); // Utilisation correcte
    job.start();
    this.jobs.set(parseInt(userId,10), job);
  }

  removeCronJob(userId: string) {
    const job = this.jobs.get(parseInt(userId,10));
    if (job) {
      job.stop();
      this.schedulerRegistry.deleteCronJob(`user-${userId}`);
    }
  }
*/
  
  // monitoring.service.ts
/*async collectECSMetrics(userId: number): Promise<void> {

    const config = this.userConfigs.get(userId);
    if (!config) {
      this.logger.warn(`No ECS config found for user ${userId}`);
      throw new Error(`No configuration for user ${userId}`);
    }

    const { region, cluster, service } = config;
    this.logger.debug(`Fetching metrics for user ${userId}, cluster ${cluster}, service ${service}, region ${region}`);

const credentials = await this.fetchTempCredentials(userId)
  //console.log(credentials)
  const cloudwatch = new CloudWatchClient({ 
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 1 * 60 * 1000); // Last 5 minutes

    const input = {
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: 'cpu',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'CPUUtilization',
              Dimensions: [
                { Name: 'ClusterName', Value: cluster },
                { Name: 'ServiceName', Value: service },
              ],
            },
            Period: 300, // 5 minutes
            Stat: 'Average',
          },
          ReturnData: true,
        },
        {
          Id: 'memory',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'MemoryUtilization',
              Dimensions: [
                { Name: 'ClusterName', Value: cluster },
                { Name: 'ServiceName', Value: service },
              ],
            },
            Period: 300,
            Stat: 'Average',
          },
          ReturnData: true,
        },
      ],
    };

    try {
      const result = await cloudwatch.send(new GetMetricDataCommand(input));
      this.logger.debug(`CloudWatch response: ${JSON.stringify(result)}`);

      const data = new EcsMetric();
      data.userId = userId;
      data.clusterName = cluster;
      data.serviceName = service;
      data.region = region;
      data.timestamp = endTime;
      data.cpuUtilization = 0;
      data.memoryUtilization = 0;
      data.cpureservation = 0 ; 
      data.memoryreservation = 0 ; 
      data.requestCount = 0 ; 
      

      if (result.MetricDataResults) {
        for (const metric of result.MetricDataResults) {
          const value = metric.Values?.[0] ?? 0;
          if (metric.Id === 'cpu') {
            data.cpuUtilization = value;
            this.logger.debug(`CPU Utilization: ${value}%`);
          }
          if (metric.Id === 'memory') {
            data.memoryUtilization = value;
            this.logger.debug(`Memory Utilization: ${value}%`);
          }
        }
      } else {
        this.logger.warn(`No metric data returned for user ${userId}`);
      }

      // Upsert: Check for existing record for the same clusterName in the same 5-minute window
      const timeWindowStart = new Date(endTime.getTime() - 1 * 60 * 1000);
      const timeWindowEnd = endTime;

      const existingMetric = await this.metricRepository.findOne({
        where: {
          clusterName: cluster,
          timestamp: Between(timeWindowStart, timeWindowEnd),
        },
      });

      if (existingMetric) {
        // Update existing record
        existingMetric.userId = userId;
        existingMetric.serviceName = service;
        existingMetric.region = region;
        existingMetric.cpuUtilization = data.cpuUtilization;
        existingMetric.memoryUtilization = data.memoryUtilization;
        existingMetric.timestamp = endTime;
        await this.metricRepository.save(existingMetric);
        console.info(`Updated ECS metric for cluster ${cluster} at ${endTime.toISOString()}`);
      } else {
        // Insert new record
        await this.metricRepository.save(data);
        console.info(`Inserted new ECS metric for cluster ${cluster} at ${endTime.toISOString()}`);
      }
    } catch (err) {
      this.logger.error(`Failed to collect ECS metrics for user ${userId}: ${err.message}`, err);
      throw err;
    }
  }



   async  collectECSMetricss(
    userId : string ,
  region: string,
  clusterName: string,
  serviceName: string
): Promise<ECSMetricsResult> {
  await this.verifyECSDeployment(parseInt(userId,10),region, clusterName, serviceName);
  const credentials = await this.fetchTempCredentials(parseInt(userId,10))
  console.log(credentials)
  const cloudwatch = new CloudWatchClient({ 
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
 // const cloudwatch = new CloudWatchClient({ region });
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 300_000); // 5 minutes

  const input: GetMetricDataCommandInput = {
    StartTime: startTime,
    EndTime: endTime,
    MetricDataQueries: [
      {
        Id: "cpu",
        MetricStat: {
          Metric: {
            Namespace: "AWS/ECS",
            MetricName: "CPUUtilization",
            Dimensions: [
              { Name: "ClusterName", Value: clusterName },
              { Name: "ServiceName", Value: serviceName },
            ],
          },
          Period: 60, // 1 minute granularity
          Stat: "Average",
        },
        ReturnData: true,
      },
      {
        Id: "memory",
        MetricStat: {
          Metric: {
            Namespace: "AWS/ECS",
            MetricName: "MemoryUtilized", // Utilisez MemoryUtilized au lieu de MemoryUtilization
            Dimensions: [
              { Name: "ClusterName", Value: clusterName },
              { Name: "ServiceName", Value: serviceName },
            ],
          },
          Period: 60,
          Stat: "Average",
        },
        ReturnData: true,
      },
    ],
  };

  try {
    const result = await cloudwatch.send(new GetMetricDataCommand(input));
    const metrics = {
      cpuUtilization: 0,
      memoryUtilization: 0,
      timestamp: endTime,
    };

    result.MetricDataResults?.forEach((metricData) => {
      const value = metricData.Values?.[0] ?? 0;
      if (metricData.Id === "cpu") metrics.cpuUtilization = Number(value.toFixed(2));
      if (metricData.Id === "memory") metrics.memoryUtilization = Number(value.toFixed(2));
    });

    // Vérification des données manquantes
    if (metrics.cpuUtilization === 0 || metrics.memoryUtilization === 0) {
      console.warn("Aucune donnée de métrique valide trouvée. Vérifiez :");
      console.warn("- Que le service ECS est en cours d'exécution");
      console.warn("- Les dimensions du cluster/service");
      console.warn("- Les autorisations IAM CloudWatch:GetMetricData");
    }

    return metrics;
  } catch (error) {
    console.error("Erreur de collecte de métriques ECS :", error);
    throw new Error(`Échec de la collecte des métriques : ${(error as Error).message}`);
  }
}
*/


async verifyECSDeployment(userId: number, region: string, cluster: string, service: string) {
    const credentials = await this.fetchTempCredentials(userId);
    this.logger.debug(`Verifying ECS deployment for user ${userId}, cluster ${cluster}, service ${service}, region ${region}`);
    
    const ecs = new ECSClient({ 
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    try {
      const { services } = await ecs.send(new DescribeServicesCommand({
        cluster,
        services: [service],
      }));

      if (!services || services.length === 0) {
        throw new Error(`Service ${service} not found in cluster ${cluster}`);
      }

      if (!services[0].runningCount || services[0].runningCount === 0) {
        this.logger.warn(`Service ${service} in cluster ${cluster} has no active tasks. Check health checks or task definition.`);
        throw new Error(`Service ${service} in cluster ${cluster} has no active tasks`);
      }

      this.logger.debug(`Verified ECS deployment: ${service} in cluster ${cluster} has ${services[0].runningCount} running tasks`);
      return {
        runningCount: services[0].runningCount,
        desiredCount: services[0].desiredCount,
      };
    } catch (err) {
      this.logger.error(`Failed to verify ECS deployment for user ${userId}: ${err.message}`);
      throw err;
    }
  }

    // Récupérer les credentials temporaires
  /*async fetchTempCredentials(userId: number) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`http://localhost:3030/user/${userId}/connect-aws`, {})
      );
      this.logger.log(`Fetched AWS credentials for user ${userId}`);
      return data;
    } catch (error) {
      this.logger.error(`Error fetching AWS credentials for user ${userId}: ${error.message}`);
      throw error;
    }
  }
*/

async fetchTempCredentials(userId: number) {
  try {
    // Utilise une variable d'environnement pour l'URL du user-service
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:3030';
    const { data } = await firstValueFrom(
      this.httpService.post(`${userServiceUrl}/user/${userId}/connect-aws`, {})
    );
    this.logger.log(`Fetched AWS credentials for user ${userId}`);
    return data;
  } catch (error) {
    this.logger.error(`Error fetching AWS credentials for user ${userId}: ${error.message}`);
    throw error;
  }
}


async fetchEcsResourcesForSite(userId: number, siteName: string): Promise<any> {
  const region = 'us-east-1';

  // 🔐 Step 1: Get temporary credentials (STS)
 /* const response: AxiosResponse<any> = await firstValueFrom(
    this.httpService.post(`http://localhost:3030/user/${userId}/connect-aws`, {})
  );
  const { accessKeyId, secretAccessKey, sessionToken } = response.data;
  console.log(`🔐 Temp credentials fetched for user ${userId}`);
*/
    const credentials = await this.fetchTempCredentials(userId);

  

  // 🔁 Step 2: Init AWS SDK clients with credentials
  const ecsClient = new ECSClient({
    region,
    credentials: {
       accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const elbv2Client = new ElasticLoadBalancingV2Client({
    region,
    credentials: {
        accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // 🔧 Naming conventions
  const clusterName = `ecs-cluster-${siteName}`;
  const serviceName = `medium-tier-service-${siteName}`;
  const asgName =  `asg-${siteName}`
  console.log(`🔍 Fetching ECS+ALB resources for user ${userId}, site "${siteName}"`);

  // Step 3: Describe ECS Service
  const svcResponse = await ecsClient.send(
    new DescribeServicesCommand({
      cluster: clusterName,
      services: [serviceName],
    })
  );

  const service = svcResponse.services?.[0];
  if (!service) throw new Error("❌ ECS Service not found");

  const targetGroupArn = service.loadBalancers?.[0]?.targetGroupArn;
  if (!targetGroupArn) throw new Error("❌ Target Group not attached");

  console.log("🎯 Target Group ARN:", targetGroupArn);

  // Step 4: Describe Target Group
  const tgDesc = await elbv2Client.send(
    new DescribeTargetGroupsCommand({
      TargetGroupArns: [targetGroupArn],
    })
  );

  const tg = tgDesc.TargetGroups?.[0];
  const lbArn = tg?.LoadBalancerArns?.[0];
  if (!lbArn) throw new Error("❌ Load Balancer ARN not found");

  console.log("🧱 Load Balancer ARN:", lbArn);

  // Step 5: Describe Load Balancer to get DNS
  const lbDesc = await elbv2Client.send(
    new DescribeLoadBalancersCommand({
      LoadBalancerArns: [lbArn],
    })
  );

  const alb = lbDesc.LoadBalancers?.[0];
  if (!alb) throw new Error("❌ ALB not found");

  return {
    userId,
    siteName,
    clusterName,
    serviceName,
    asgName,
    targetGroupArn,
    loadBalancerArn: lbArn,
    loadBalancerDNS: alb.DNSName,
  };
}


async collectECSMetricsss(userId: number, siteName : string ,retries: number = 2, delayMs: number = 1000): Promise<any> {


    const resultt = await this.fetchEcsResourcesForSite(userId,siteName)

    const awsAccessKeyId_management = this.configService.get<string>('AWS_ACCESS_KEY_ID');
const awsSecretAccessKey_management = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
const awsSessionToken_management = this.configService.get<string>('AWS_SESSION_TOKEN'); // optionnel



    console.log("eresult",resultt)
    await this.addUserConfig(userId,'us-east-1',resultt.clusterName,resultt.serviceName,resultt.targetGroupArn,resultt.loadBalancerArn,resultt.asgName)

  let config = this.userConfigs.get(userId);
    if (!config) {
      this.logger.debug(`No ECS config found for user ${userId}, fetching resources for site ${siteName}`);
      try {
        const resources = await this.fetchEcsResourcesForSite(userId, siteName);
        config = {
          region: 'us-east-1', // From fetchEcsResourcesForSite
          cluster: resources.clusterName,
          service: resources.serviceName,
          targetGroupArn: resources.targetGroupArn,
          albArn: resources.loadBalancerArn,
          asgName: resources.asgName,
        };
        this.addUserConfig(userId, config.region, config.cluster, config.service, config.targetGroupArn, config.albArn, config.asgName);
        this.logger.debug(`Added ECS config for user ${userId}: ${JSON.stringify(config)}`);
      } catch (err) {
        this.logger.error(`Failed to fetch ECS resources for user ${userId}, site ${siteName}: ${err.message}`);
        throw new Error(`No configuration for user ${userId}: ${err.message}`);
      }
    }





  const { region, cluster, service, targetGroupArn , albArn , asgName } = config;
  this.logger.debug(`Fetching metrics for user ${userId}, cluster ${cluster}, service ${service}, region ${region}`);

  const { runningCount, desiredCount } = await this.verifyECSDeployment(userId, region, cluster, service);
  const credentials = await this.fetchTempCredentials(userId);
  const cloudwatch = new CloudWatchClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  
  const targetGroupPart = targetGroupArn.split(':targetgroup/')[1];
  const targetGroupDimension = `targetgroup/${targetGroupPart}`;

   // Compute RDS instance identifier
  const dbName = `db-${userId}-${siteName.replace(/[^a-zA-Z0-9_]/g, '_')}`.substring(0, 64);
  
  const albArnPartt = albArn.split(':loadbalancer/')[1];
  const albArnPart = `${albArnPartt }`
  console.log("albpart0",albArnPart)

  // Validate albArn and targetGroupArn
  if (!albArn || !targetGroupArn) {
    this.logger.warn(`Missing albArn or targetGroupArn for user ${userId}. albArn: ${albArn}, targetGroupArn: ${targetGroupArn}`);
    throw new Error(`Invalid configuration: albArn or targetGroupArn is missing for user ${userId}`);
  }

  const endTime = new Date();
  endTime.setSeconds(0, 0);
  const startTime = new Date(endTime.getTime() - 60_000);

  const input: GetMetricDataCommandInput = {
    StartTime: startTime,
    EndTime: endTime,
    MetricDataQueries: [
      {
        Id: 'cpu',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ECS',
            MetricName: 'CPUUtilization',
            Dimensions: [
              { Name: 'ClusterName', Value: cluster },
              { Name: 'ServiceName', Value: service },
            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
      //Recommended threshold: 80.0
      {
        Id: 'cpureservation',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ECS',
            MetricName: 'CPUReservation',
            Dimensions: [
              { Name: 'ClusterName', Value: cluster },
          //    { Name: 'ServiceName', Value: service },
            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
      {
        Id: 'memoryreservation',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ECS',
            MetricName: 'MemoryReservation',
            Dimensions: [
              { Name: 'ClusterName', Value: cluster },
      //      { Name: 'ServiceName', Value: service },
            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
      {
        Id: 'memory',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ECS',
            MetricName: 'MemoryUtilization',
            Dimensions: [
              { Name: 'ClusterName', Value: cluster },
              { Name: 'ServiceName', Value: service },
            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
      //Intent: This alarm is used to detect a high target response time for ECS service requests.

      {
        Id: 'targetresponsetime',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ECS',
            MetricName: 'TargetResponseTime',
            Dimensions: [
             { Name: 'ClusterName', Value: cluster },
            { Name: 'ServiceName', Value: service },
           //     { Name: 'LoadBalancer', Value: albArnPart  },
             //   { Name: 'TargetGroup', Value: targetGroupDimension },



            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
     // Network Metrics (FIXED)
   {
      Id: 'networkIn',
      MetricStat: {
        Metric: {
          Namespace: 'AWS/EC2',
          MetricName: 'NetworkIn',  // Correct metric for outgoing traffic
          Dimensions: [
           // { Name: 'ClusterName', Value: cluster },
            //{ Name: 'ServiceName', Value: service },
            { Name: 'AutoScalingGroupName', Value: asgName },
          ],
        },
        Period: 60,
        Stat: 'Sum',
        Unit: 'Bytes',
      },
      ReturnData: true,
    },
    {
      Id: 'networkOut',
      MetricStat: {
        Metric: {
          Namespace: 'AWS/EC2',
          MetricName: 'NetworkOut',  // Correct metric for outgoing traffic
          Dimensions: [
           // { Name: 'ClusterName', Value: cluster },
            //{ Name: 'ServiceName', Value: service },
            { Name: 'AutoScalingGroupName', Value: asgName },
          ],
        },
        Period: 60,
        Stat: 'Sum',
        Unit: 'Bytes',
      },
      ReturnData: true,
    },

      {
        Id: 'requestCount',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ApplicationELB',
            MetricName: 'RequestCount',
            Dimensions: [
              { Name: 'LoadBalancer', Value: albArnPart  },
            ],
          },
          Period: 60,
          Stat: 'Sum',
        },
        ReturnData: true,
      },
      {
        Id: 'healthyHosts',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ApplicationELB',
            MetricName: 'HealthyHostCount',
            Dimensions: [
              { Name: 'TargetGroup', Value: targetGroupDimension },
                            { Name: 'LoadBalancer', Value: albArnPart  },

            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
      {
          Id: 'freeStorageSpace',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/RDS',
              MetricName: 'FreeStorageSpace',
              Dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbName }],
            },
            Period: 60,
            Stat: 'Average',
          },
          ReturnData: true,
        },

      {
        Id: 'http2xx',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ApplicationELB',
            MetricName: 'HTTPCode_Target_5XX_Count',
            Dimensions: [
       { Name: 'TargetGroup', Value: targetGroupDimension },
                            { Name: 'LoadBalancer', Value: albArnPart  },

            ],
          },
          Period: 60,
          Stat: 'Average',
        },
        ReturnData: true,
      },
    ],
  };

  let result;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      result = await cloudwatch.send(new GetMetricDataCommand(input));
      this.logger.debug(`CloudWatch response (attempt ${attempt}): ${JSON.stringify(result.MetricDataResults, null, 2)}`);
      break;
    } catch (err) {
      this.logger.error(`Failed to collect ECS metrics for user ${userId}: ${err.message}`);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }

  // Filtrer les métriques avec des données valides
  const convertedResults = result.MetricDataResults
    .filter((metric: any) => metric.Timestamps && metric.Values && metric.Timestamps.length === metric.Values.length)
    .map((metric: any) => ({
      ...metric,
      Timestamps: metric.Timestamps.map((ts: Date) => ts.toISOString()),
    }));

  // Sauvegarde dans DynamoDB
  const dynamoDbClient = new DynamoDBClient({ region: 'us-east-1' ,
    credentials: {
    accessKeyId: awsAccessKeyId_management,
    secretAccessKey: awsSecretAccessKey_management,
  },
  });
  const params = {
    TableName: 'EcsMetrics',
    Item: marshall(
      {
       siteName: siteName, // Clé de partition
      timestamp: endTime.toISOString(), // Clé de tri
      userId: userId, // Attribut supplémentaire
      cluster: cluster,
      service: service,
      region: region,
      dbName, // Store dbName for reference
      runningCount: runningCount,
      desiredCount: desiredCount,
        dataPoints: convertedResults,
      },
      { convertClassInstanceToMap: true }
    ),
  };

  try {
    await dynamoDbClient.send(new PutItemCommand(params));
    this.logger.debug(`Metrics saved to DynamoDB for user ${userId}: ${JSON.stringify(unmarshall(params.Item), null, 2)}`);
  } catch (err) {
    this.logger.error(`Failed to save metrics to DynamoDB for user ${userId}: ${err.message}`);
  }

  // Extraire les dernières valeurs pour le retour immédiat
  const metrics = {
    cpuUtilization: 0,
    memoryUtilization: 0,
    cpureservation : 0 ,
    memoryreservation : 0 ,
    requestCount: 0,
    networkOut : 0 ,
    networkIn : 0 ,
    freeStorageSpace: 0,
    healthyHosts : 0 , // In GB
    runningCount,
    desiredCount,
  };

  if (result.MetricDataResults) {
    for (const metric of result.MetricDataResults) {
      const value = metric.Values?.[0] ?? 0;
      if (metric.Id === 'cpu') {
        metrics.cpuUtilization = Number(value.toFixed(2));
        this.logger.debug(`CPU Utilization: ${metrics.cpuUtilization}%`);
      } else if (metric.Id === 'memory') {
        metrics.memoryUtilization = Number(value.toFixed(2));
        this.logger.debug(`Memory Utilization: ${metrics.memoryUtilization}%`);
      } else if (metric.Id === 'requestCount') {
        metrics.requestCount = Math.round(value);
        this.logger.debug(`Request Count: ${metrics.requestCount}`);
      }else if (metric.Id === 'cpureservation') {
        metrics.cpureservation = Math.round(value);
        this.logger.debug(`cpureservation: ${metrics.cpureservation}`);
      }
      else if (metric.Id === 'memoryreservation') {
        metrics.memoryreservation = Math.round(value);
        this.logger.debug(`memoryreservation: ${metrics.memoryreservation}`);
      }
       else if (metric.Id === 'freeStorageSpace') {
          metrics.freeStorageSpace = Number((value / 1_073_741_824).toFixed(2)); // Convert bytes to GB
        } else if (metric.Id === 'networkOut') {
        metrics.networkOut = Math.round(value);
        this.logger.debug(`networkout: ${metrics.networkOut}`);
      }
       else if (metric.Id === 'networkIn') {
          metrics.networkIn =  Math.round(value); 
          this.logger.debug(`networkIn: ${metrics.networkIn}`);// Convert bytes to GB
        }else if (metric.Id === 'healthyHosts') {
          metrics.healthyHosts =  Math.round(value); 
          this.logger.debug(`healthyHosts: ${metrics.healthyHosts}`);// Convert bytes to GB
        }
    }
  }

  return metrics;
}


 // monitoring.service.ts
// monitoring.service.ts
async getHistoricalMetricss(userId: number, hours: number, siteName : string): Promise<any[]> {
  const dynamoDbClient = new DynamoDBClient({ region: 'us-east-1' });
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

  this.logger.debug(`Querying historical metrics for user ${userId}, startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}`);

 /* const params = {
    TableName: 'EcsMetrics',
    KeyConditionExpression: 'userId = :userId AND #ts BETWEEN :startTime AND :endTime',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':userId': { N: userId.toString() },
      ':startTime': { S: startTime.toISOString() },
      ':endTime': { S: endTime.toISOString() },
    },
  };*/

  const params = {
    TableName: 'EcsMetrics',
    IndexName: 'UserIdTimestampIndex',
    KeyConditionExpression: 'userId = :userId AND #ts BETWEEN :startTime AND :endTime',
    FilterExpression: 'siteName = :siteName',
    ExpressionAttributeNames: {
      '#ts': 'timestamp'
    },
    ExpressionAttributeValues: {
      ':userId': { N: userId.toString() },
      ':siteName': { S: siteName },
      ':startTime': { S: startTime.toISOString() },
      ':endTime': { S: endTime.toISOString() }
    }
  };

  try {
    const result = await dynamoDbClient.send(new QueryCommand(params));
    this.logger.debug(`DynamoDB query result for user ${userId}: ${JSON.stringify(result, null, 2)}`);

    // Vérification explicite pour result et result.Items
    if (!result || !result.Items) {
      this.logger.warn(`No items found for user ${userId} in the specified time range or query failed`);
      return [];
    }

    const items = result.Items.map(item => unmarshall(item));
    this.logger.debug(`Raw historical data for user ${userId}: ${JSON.stringify(items, null, 2)}`);

    // Déduplication et tri décroissant basé sur timestamp
    const uniqueItems = Array.from(
      new Map(items.map(item => [item.timestamp, item])).values()
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Vérifier et normaliser dataPoints
    const normalizedItems = uniqueItems.map(item => ({
      ...item,
      dataPoints: (item.dataPoints || []).map((dp: any) => ({
        ...dp,
        Timestamps: dp.Timestamps || [],
        Values: dp.Values || [],
      })),
    }));

    this.logger.debug(`Normalized historical data for user ${userId}: ${JSON.stringify(normalizedItems, null, 2)}`);
    return normalizedItems;
  } catch (err) {
    this.logger.error(`Failed to fetch historical metrics for user ${userId}: ${err.message}`);
    throw err;
  }
}
async getHistoricalMetrics(userId: number, hours: number, siteName: string): Promise<any[]> {

   const awsAccessKeyId_management = this.configService.get<string>('AWS_ACCESS_KEY_ID');
const awsSecretAccessKey_management = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

  const dynamoDbClient = new DynamoDBClient({ region: 'us-east-1',
       credentials: {
    accessKeyId: awsAccessKeyId_management,
    secretAccessKey: awsSecretAccessKey_management,
  },
   });
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

  // Validate inputs
  if (!userId || !siteName || !hours || hours <= 0) {
    this.logger.error(`Invalid input parameters: userId=${userId}, siteName=${siteName}, hours=${hours}`);
    throw new BadRequestException(`Invalid parameters: userId, siteName, and hours are required`);
  }

  this.logger.debug(`Querying historical metrics for user ${userId}, site ${siteName}, startTime: ${startTime.toISOString()}, endTime: ${endTime.toISOString()}`);

  const params = {
    TableName: 'EcsMetrics',
    IndexName: 'UserIdTimestampIndex',
    KeyConditionExpression: 'userId = :userId AND #ts BETWEEN :startTime AND :endTime',
    FilterExpression: 'siteName = :siteName',
    ExpressionAttributeNames: {
      '#ts': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':userId': { N: userId.toString() },
      ':siteName': { S: siteName },
      ':startTime': { S: startTime.toISOString() },
      ':endTime': { S: endTime.toISOString() },
    },
  };

  try {
    const result = await dynamoDbClient.send(new QueryCommand(params));
    this.logger.debug(`DynamoDB query result for user ${userId}: ${JSON.stringify(result, null, 2)}`);

    if (!result || !result.Items) {
      this.logger.warn(`No items found for user ${userId} in the specified time range`);
      return [];
    }

    const items = result.Items.map(item => unmarshall(item));
    this.logger.debug(`Raw historical data for user ${userId}: ${JSON.stringify(items, null, 2)}`);

    // Deduplicate and sort by timestamp (descending)
    const uniqueItems = Array.from(
      new Map(items.map(item => [item.timestamp, item])).values()
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Normalize dataPoints
    const normalizedItems = uniqueItems.map(item => ({
      ...item,
      dataPoints: (item.dataPoints || []).map((dp: any) => ({
        ...dp,
        Timestamps: dp.Timestamps || [],
        Values: dp.Values || [],
      })),
    }));

    this.logger.debug(`Normalized historical data for user ${userId}: ${JSON.stringify(normalizedItems, null, 2)}`);
    return normalizedItems;
  } catch (err) {
    this.logger.error(`Failed to fetch historical metrics for user ${userId}: ${err.message}`);
    throw err;
  }
}
}