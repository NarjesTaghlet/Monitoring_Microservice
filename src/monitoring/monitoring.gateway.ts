/*import { Logger, UseGuards } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenGuard } from './Guards/token-guard';
import { MonitoringService } from './monitoring.service';
import { WsAuthGuard } from './Guards/WsAuthGuard';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigChangeEvent, ConfigService } from '@nestjs/config';
@WebSocketGateway(3006, { 
  namespace: 'metrics',
  cors: {
origin: '*',
    credentials: true
  }
})

@WebSocketGateway({
  namespace: 'metrics',
  cors: {
    origin:  process.env.FRONTEND_URL || 'http://localhost:4200',
  },
})
@UseGuards(WsAuthGuard) // Apply guard at gateway level
export class MonitoringGateway implements OnGatewayConnection, OnGatewayDisconnect ,OnGatewayInit{
  @WebSocketServer()
  server: Server;

  private logger = new Logger(MonitoringGateway.name);
  private clients = new Map<string, { userId: number; siteName: string }>();
  private readonly clientSubscriptions = new Map<string, { userId: number; siteName: string }>();

  constructor(private monitoringService: MonitoringService ,private httpService: HttpService , private configService : ConfigService) {
    
    //  clientID: process.env.GOOGLE_CLIENT_ID,
     // clientSecret: process.env.GOOGLE_SECRET_ID,
  }

 private extractToken(client: Socket): string | null {
    // 1. Check handshake auth first
    if (client.handshake.auth?.token) {
      const token = client.handshake.auth.token;
      console.log(token)
      this.logger.debug(`Token extrait depuis handshake.auth: ${token.slice(0, 20) + '...'}`);
      return token;
    }

    // 2. Check authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      this.logger.debug(`Token extrait depuis authorization header: ${token.slice(0, 20) + '...'}`);
      return token;
    }

    // 3. Check query parameters
    if (client.handshake.query?.token) {
      const token = Array.isArray(client.handshake.query.token)
        ? client.handshake.query.token[0]
        : client.handshake.query.token;
      this.logger.debug(`Token extrait depuis query: ${token.slice(0, 20) + '...'}`);
      console.log(token.slice(0, 20))
      return token;
    }

    this.logger.warn('Aucun token trouvé');
    return null;
  }



afterInit(server: Server) {
    server.use(async (socket, next) => {
      const access_token = this.extractToken(socket);
      console.log(access_token)
      
      if (!access_token) return next(new Error('No token'));

      const userServiceUrl = this.configService.get<string>('USER_SERVICE_URL', 'http://localhost:3030');


      
      try {
      const response = await firstValueFrom(
            this.httpService.post(`${userServiceUrl}/auth/verify`, { access_token }, {
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        console.log("repsonse",response)
        socket.data.user = response.data;
        console.log(socket.data.user)
        next();
      } catch (e) {
        next(new Error('Invalid token hehe'));
      }
    });

       
  }
  // Periodic task to fetch and broadcast metrics
  @Interval(3000) // Every 3 seconds
  async handleMetricsUpdate() {
    this.logger.debug(`Running periodic metrics update for ${this.clientSubscriptions.size} clients`);

    for (const [socketId, { userId, siteName }] of this.clientSubscriptions) {
      if (!siteName) continue; // Skip clients not subscribed to a site

      try {
        const metrics = await this.monitoringService.collectECSMetricsss(userId, siteName);
        this.logger.debug(`Broadcasting metrics for user ${userId}, site ${siteName}`);
        this.server.to(`user-${userId}`).emit('metricsUpdate', metrics);
      } catch (err) {
        this.logger.error(`Failed to fetch metrics for user ${userId}, site ${siteName}: ${err.message}`);
        this.server.to(`user-${userId}`).emit('error', { message: `Failed to fetch metrics: ${err.message}` });
      }
    }
  }



  async handleConnection(socket: Socket) {
   this.logger.log(`Client connected: ${socket.id}`);
    
    // Check if user data exists
    if (!socket.data?.user) {
      this.logger.error(`No user data found for socket: ${socket.id}`);
      socket.disconnect();
      return;
    }
    
    const userId = socket.data.user.userId;
    this.logger.log(`User ${userId} connected`);
    
    // Join user-specific room
    socket.join(`user-${userId}`);
    
    this.clients.set(socket.id, { 
      userId,
      siteName: ''
    });

  }
  
    
  

  handleDisconnect(socket: Socket) {
    this.logger.log(`Client disconnected: ${socket.id}`);
    this.clientSubscriptions.delete(socket.id);
    socket.leave(`user-${socket.data.user.userId}`);
  }

  @SubscribeMessage('subscribeMetrics')
  async handleSubscribeMetrics(
    @MessageBody() data: { siteName: string; range: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { userId } = socket.data.user;
    const { siteName, range } = data;

    // Validate inputfz
    if (!siteName || !range) {
      socket.emit('error', { message: 'Missing siteName or range parameter' });
      return;
    }

    // Update client subscription
    this.clientSubscriptions.set(socket.id, { userId, siteName });

    try {
      // Fetch initial data
      const [realtime, historical] = await Promise.all([
        this.monitoringService.collectECSMetricsss(userId, siteName),
        this.monitoringService.getHistoricalMetrics(
          userId,
          parseInt(range, 10),
          siteName
        )
      ]);

      // Emit to client
      socket.emit('metricsUpdate', realtime);
      socket.emit('historicalMetrics', historical);
    } catch (err) {
      this.logger.error(`Metrics fetch failed: ${err.message}`, err.stack);
      socket.emit('error', { 
        message: `Failed to fetch metrics: ${err.message}` 
      });
    }
  }

  async broadcastMetrics(userId: number, siteName: string, metrics: any) {
    this.server.to(`user-${userId}`).emit('metricsUpdate', metrics);
  }
}
  */
import { Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { MonitoringService } from './monitoring.service';
import * as http from 'http';
import express from 'express';

@WebSocketGateway(3006, {
  path: '/metrics',
  cors: { origin: '*', credentials: true },
  transports: ['websocket'],
})
export class MonitoringGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(MonitoringGateway.name);
  private clients = new Map<string, { userId: number; siteName: string }>();
  private httpServer: http.Server;
  private readonly app = express();

  constructor(
    private monitoringService: MonitoringService,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.app.get('/health');
  }

  afterInit() {
    this.httpServer = http.createServer(this.app);
    this.httpServer.listen(3006, () => {
      this.logger.log('Health check server running on port 3007');
    });
  }

  async handleConnection(socket: Socket) {
    const token = socket.handshake.query.access_token as string;
    if (!token) {
      socket.disconnect(true);
      return this.logger.warn('Client rejected: No token');
    }

    try {
      const userServiceUrl = this.configService.get('USER_SERVICE_URL', 'http://localhost:3030');
      const response = await firstValueFrom(
        this.httpService.post(
          `${userServiceUrl}/auth/verify`,
          { access_token: token },
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
      
      const userId = response.data.userId;
      this.clients.set(socket.id, { userId, siteName: '' });
      this.logger.log(`Client ${socket.id} connected: User ${userId}`);
    } catch (e) {
      this.logger.error(`Token verification failed: ${e.message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    this.clients.delete(socket.id);
    this.logger.log(`Client ${socket.id} disconnected`);
  }

  @SubscribeMessage('subscribeMetrics')
  async handleSubscribeMetrics(
    socket: Socket,
    payload: { siteName: string; range: string }
  ) {
    const client = this.clients.get(socket.id);
    if (!client) return socket.emit('error', 'Client not authenticated');
    
    const { siteName, range } = payload;
    if (!siteName || !range) return socket.emit('error', 'Missing siteName or range');

    this.clients.set(socket.id, { ...client, siteName });
    
    try {
      const [realtime, historical] = await Promise.all([
        this.monitoringService.collectECSMetricsss(client.userId, siteName),
        this.monitoringService.getHistoricalMetrics(client.userId, parseInt(range, 10), siteName),
      ]);
      socket.emit('metricsUpdate', realtime);
      socket.emit('historicalMetrics', historical);
    } catch (err) {
      socket.emit('error', `Failed to fetch metrics: ${err.message}`);
    }
  }

  @Interval(3000)
  async handleMetricsUpdate() {
    for (const [socketId, { userId, siteName }] of this.clients) {
      if (!siteName) continue;
      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket?.connected) continue;
      
      try {
        const metrics = await this.monitoringService.collectECSMetricsss(userId, siteName);
        socket.emit('metricsUpdate', metrics);
      } catch (err) {
        socket.emit('error', `Failed to fetch metrics: ${err.message}`);
      }
    }
  }
}