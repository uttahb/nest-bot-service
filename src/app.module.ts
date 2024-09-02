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

@Module({
  imports: [
    ConfigModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: 'redis',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'vectorizer-queue',
    }),
    // BullModule.forRoot({
    //   connection: {
    //     host: 'localhost',
    //     port: 6379,
    //   },
    // }),
  ],

  controllers: [
    AppController,
    UploadController,
    ChatController,
    VectorizerController,
  ],
  providers: [
    AppService,
    UploadService,
    ChatService,
    VectorizerService,
    Vectorizer,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'upload/file', method: RequestMethod.POST });
  }
}
