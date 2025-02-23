import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadController } from './upload/upload.controller';
import { UploadService } from './upload/upload.service';
import { LoggerMiddleware } from './logger';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { BullModule } from '@nestjs/bullmq';
import { VectorizerController } from './vectorizer/vectorizer.controller';
import { VectorizerService } from './vectorizer/vectorizer.service';
import { Vectorizer } from './vectorizer/vectorizer';
import { PrismaService } from './prisma/prisma.service';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ElasticvectordbService } from './elasticsearch/elasticvectordb.service';
import { ElasticvectordbController } from './elasticsearch/elasticvectordb.controller';
import { ChatBotService } from './chatbot/chatbot.service';
import { ChatBotController } from './chatbot/chatbot.controller';
import { HealthController } from './health.controller'; 

@Module({
  imports: [
    ConfigModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'vectorizer-queue',
    }),
    // ElasticsearchModule configuration
    ElasticsearchModule.register({
      node: process.env.ELASTIC_URL,
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
      },
    }),
  ],

  controllers: [
    AppController,
    UploadController,
    ChatController,
    VectorizerController,
    ElasticvectordbController,
    ChatBotController,
    HealthController
  ],
  providers: [
    AppService,
    UploadService,
    ChatService,
    VectorizerService,
    Vectorizer,
    PrismaService,
    ChatBotService,
    ElasticvectordbService, // Ensure the service is added to the providers array
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'upload/file', method: RequestMethod.POST });
  }
}
