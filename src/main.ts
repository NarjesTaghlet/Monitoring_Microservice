import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'http://localhost:4200', // ✅ Autoriser uniquement le frontend Angular
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true, // ✅ Si besoin d'authentification (JWT, Cookies)
  });

 //await app.listen(3005);
 const corsMiddleware = (req, res, next) => {
   const allowedOrigins = [
     'https://dpfzuq7w5fb82.cloudfront.net',
         'https://d3lkl4tdwg9nb5.cloudfront.net',
         'https://d2k1rrgcfjq38f.cloudfront.net',
    'alb-myapp-299605994.us-east-1.elb.amazonaws.com',
     'https://*.cloudfront.net',
     'http://localhost:3030' // For local development
   ];
   
   const origin = req.headers.origin;
   if (allowedOrigins.includes(origin)) {
     res.header('Access-Control-Allow-Origin', origin);
   }
   
   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token');
   res.header('Access-Control-Allow-Credentials', 'true');
   
   // Handle preflight requests
   if (req.method === 'OPTIONS') {
     return res.sendStatus(200);
   }
   
   next();
 };
 
 // Use the middleware in all services
 app.use(corsMiddleware);

  await app.listen(3035);

}
bootstrap();
