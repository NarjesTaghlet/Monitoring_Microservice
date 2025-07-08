import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(private readonly httpService: HttpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    console.log('Guard executing for client:', client.id);
    
    const access_token = this.extractTokenFromSocket(client);
    console.log('Extracted token:', access_token ? `${access_token.substring(0, 10)}...` : 'NONE');

    if (!access_token) {
      console.error('No token found - disconnecting');
      throw new WsException('No token provided');
    }

    try {
      console.log('Verifying token with auth service...');
      const response = await firstValueFrom(
        this.httpService.post(
          'http://localhost:3030/auth/verify',
          { access_token },
          { headers: { 'Content-Type': 'application/json' } }
        )
      );

      console.log('Auth response:', JSON.stringify(response.data, null, 2));
      
      if (!response.data.userId) {
        console.error('Invalid user data in response');
        throw new WsException('Invalid user data');
      }

      // Attach user to socket
      client.data.user = response.data;
      console.log(`User ${response.data.userId} authenticated for socket ${client.id}`);
      
      return true;
    } catch (error) {
      console.error('Token verification failed:', error.message);
      throw new WsException('Invalid token');
    }
  }

  private extractTokenFromSocket(client: Socket): string | null {
    // 1. Check handshake auth first
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }
    
    // 2. Check authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    
    // 3. Check query parameters
    if (client.handshake.query?.token) {
      return Array.isArray(client.handshake.query.token)
        ? client.handshake.query.token[0]
        : client.handshake.query.token;
    }
    
    return null;
  }
}