import { Entity, Column, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity()
@Unique(['clusterName', 'serviceName'])
export class EcsMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  clusterName: string;

  @Column()
  serviceName: string;

  @Column()
  region: string;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ type: 'float', default: 0 })
  cpuUtilization: number;

  @Column({ type: 'float', default: 0 })
  memoryUtilization: number;

  @Column({ type: 'bigint', default: 0 })
  networkRxBytes: number;

  @Column({ type: 'bigint', default: 0 })
  networkTxBytes: number;

  @Column({ type: 'int', default: 0 })
  requestCount: number;

  @Column({ type: 'float', default: 0 })
  targetResponseTime: number;

  @Column({ type: 'int', default: 0 })
  healthyHostCount: number;

  @Column({ type: 'int', default: 0 })
  http2xxCount: number;

  @Column({ type: 'int', default: 0 })
  runningCount: number;

  @Column({ type: 'int', default: 0 })
  desiredCount: number;

  @Column({ type: 'float', default: 0 })
  pageLoadTime: number;


    @Column({ type: 'float', default: 0 })
  cpureservation: number;

  
    @Column({ type: 'float', default: 0 })
  memoryreservation: number;

    
    @Column({ type: 'float', default: 0 })
  freeStorageSpace : number;
}
