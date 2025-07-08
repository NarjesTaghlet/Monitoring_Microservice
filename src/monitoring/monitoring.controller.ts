// src/monitoring.controller.ts
import { Controller, Get, HttpStatus, Param, Query, UseGuards,Post ,Body } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { TokenGuard } from './Guards/token-guard';
import { HttpException } from '@nestjs/common';
import { Request } from '@nestjs/common';


@Controller('metrics')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService  ) {}

 /* @Get(':siteId')
  async getMetricss(@Param() siteId: number) {
    return this.monitoringService.getLatestMetrics(+siteId);
  }



*/

// Pour Medium Plan
  @Post('start-cron')
  @UseGuards(TokenGuard)
  async startCron(@Request() req) {
   
    const userId = req.user.userId;
     console.log(userId)
  const region = 'us-east-1';
    const cluster = 'ecs-cluster-testformonitoring';
    const service = 'medium-tier-service-testformonitoring';
    const targetGroupArn ='';
 const albArn ='';
  const asgName ='';
    //extract cluster / service from secrets manager or db deployment
    //add deploymentId dans la base aussi !

    this.monitoringService.addUserConfig(userId,region,cluster,service,targetGroupArn,albArn,asgName)
    
    this.monitoringService.addCronJob(userId, '*/5 * * * *');
  }
  

  @Post('historical')
  @UseGuards(TokenGuard)
  async getHistoricalMetrics(@Request() req, @Query('range') range: string , @Body() body: {  siteName: string } ) {
    const userId = req.user.userId;
    const hours = parseInt(range, 10) || 4; // Par défaut 4 heures si non spécifié
    return await this.monitoringService.getHistoricalMetrics(userId, hours, body.siteName);
  }

 @Post('collect-metrics')
  @UseGuards(TokenGuard)
  async collectMetrics(@Request() req ,@Body() body: {  siteName: string } ) {
    const userId = req.user.userId;
    const region = 'us-east-1';
   // const cluster = `ecs-cluster-${body.siteName}`;
   // const service = `medium-tier-service-${body.siteName}`;
   // const targetGroupArn ='arn:aws:elasticloadbalancing:us-east-1:923159238841:targetgroup/mt-tg-testformonitoring/b162682aac9f5936';
    console.log("fetched")

    const result = await this.monitoringService.fetchEcsResourcesForSite(userId,body.siteName)
    console.log("eresult",result)
    await this.monitoringService.addUserConfig(userId,region,result.clusterName,result.serviceName,result.targetGroupArn,result.loadBalancerArn,result.asgName)
   return await this.monitoringService.collectECSMetricsss(userId,body.siteName);

   // await this.monitoringService.getECSMetrics(userId,region, cluster, service);

   // return { message: `Metrics collected for user ${userId}, cluster ${result.clusterName}` };
  }


  @Get('resources/:userId/:siteName')
  async getEcsResources(
    @Param('userId') userId: number,
    @Param('siteName') siteName: string,
  ) {
    return this.monitoringService.fetchEcsResourcesForSite(userId, siteName);
  }

}
