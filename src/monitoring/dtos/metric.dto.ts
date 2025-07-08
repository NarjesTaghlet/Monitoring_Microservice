// src/metrics/dto/metric.dto.ts
import { IsNumber, IsString } from 'class-validator';

export class StoreMetricDto {
  @IsNumber()
  userId: number;

  @IsString()
  cluster: string;

  @IsString()
  service: string;

  @IsNumber()
  cpuUtilization: number;

  @IsNumber()
  memoryUtilization: number;
}